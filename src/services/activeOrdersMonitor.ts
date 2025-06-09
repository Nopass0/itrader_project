import { PrismaClient } from '../../generated/prisma';
import { BybitP2PManagerService } from './bybitP2PManager';
import { ChatAutomationService } from './chatAutomation';
import { TimeSync } from '../bybit/utils/timeSync';
import { EventEmitter } from 'events';

export class ActiveOrdersMonitorService extends EventEmitter {
  private prisma: PrismaClient;
  private bybitManager: BybitP2PManagerService;
  private chatService: ChatAutomationService;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  constructor(bybitManager: BybitP2PManagerService) {
    super();
    this.prisma = new PrismaClient();
    this.bybitManager = bybitManager;
    this.chatService = new ChatAutomationService(bybitManager);
  }

  async startMonitoring(intervalMs = 30000) {
    if (this.isMonitoring) {
      console.log('[ActiveOrdersMonitor] Already monitoring');
      return;
    }

    this.isMonitoring = true;
    console.log('[ActiveOrdersMonitor] Starting active orders monitoring...');

    // Initial check
    await this.checkActiveOrders();

    // Set up interval
    this.monitoringInterval = setInterval(async () => {
      await this.checkActiveOrders();
    }, intervalMs);
  }

  async stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('[ActiveOrdersMonitor] Monitoring stopped');
  }

  private async checkActiveOrders() {
    try {
      console.log('\n[ActiveOrdersMonitor] Checking for active orders...');
      
      // Ensure time sync
      if (!TimeSync.isSynchronized()) {
        await TimeSync.forceSync(false);
      }

      const accounts = await this.bybitManager.getActiveAccounts();
      
      for (const account of accounts) {
        await this.checkAccountOrders(account.accountId);
      }

      // Process any unprocessed messages
      await this.chatService.processUnprocessedMessages();
      
    } catch (error) {
      console.error('[ActiveOrdersMonitor] Error checking orders:', error);
      this.emit('error', error);
    }
  }

  private async checkAccountOrders(accountId: string) {
    try {
      const client = this.bybitManager.getClient(accountId);
      const httpClient = (client as any).httpClient;
      
      // Get specific order if we have one in DB
      const existingTransaction = await this.prisma.transaction.findFirst({
        where: {
          orderId: { not: null },
          status: { in: ['waiting_payment', 'payment_received'] }
        },
        include: {
          advertisement: true,
          chatMessages: true
        }
      });

      if (existingTransaction && existingTransaction.orderId) {
        // Check specific order
        await this.processSpecificOrder(
          existingTransaction.orderId,
          accountId,
          httpClient
        );
      }

      // Also check for new orders
      await this.checkForNewOrders(accountId, httpClient);
      
    } catch (error) {
      console.error(`[ActiveOrdersMonitor] Error checking account ${accountId}:`, error);
    }
  }

  private async processSpecificOrder(
    orderId: string,
    accountId: string,
    httpClient: any
  ) {
    try {
      console.log(`[ActiveOrdersMonitor] Checking order ${orderId}`);
      
      // Get order info
      const orderInfo = await httpClient.post('/v5/p2p/order/info', {
        orderId: orderId
      });

      if (!orderInfo.result) {
        console.log(`[ActiveOrdersMonitor] Order ${orderId} not found`);
        return;
      }

      const order = orderInfo.result;
      console.log(`[ActiveOrdersMonitor] Order status: ${order.status}`);

      // Only process active orders (status 10 or 20)
      if (order.status === 10 || order.status === 20) {
        await this.processActiveOrder(order, accountId, httpClient);
      }
      
    } catch (error) {
      console.error(`[ActiveOrdersMonitor] Error processing order ${orderId}:`, error);
    }
  }

  private async checkForNewOrders(accountId: string, httpClient: any) {
    try {
      // Try to get orders without status filter first
      const ordersResponse = await httpClient.post('/v5/p2p/order/simplifyList', {
        page: 1,
        size: 20
      });

      if (ordersResponse.result?.items && ordersResponse.result.items.length > 0) {
        console.log(`[ActiveOrdersMonitor] Found ${ordersResponse.result.items.length} orders`);
        
        // Filter for active orders
        const activeOrders = ordersResponse.result.items.filter((order: any) => 
          order.status === 10 || order.status === 20
        );

        for (const order of activeOrders) {
          // Get full order details
          const orderDetails = await httpClient.post('/v5/p2p/order/info', {
            orderId: order.id
          });

          if (orderDetails.result) {
            await this.processActiveOrder(orderDetails.result, accountId, httpClient);
          }
        }
      }
    } catch (error) {
      // If simplifyList fails, try other methods
      console.log('[ActiveOrdersMonitor] Trying alternative method to find orders');
    }
  }

  private async processActiveOrder(order: any, accountId: string, httpClient: any) {
    console.log(`\n[ActiveOrdersMonitor] Processing active order ${order.id}`);
    console.log(`  Status: ${order.status} (${this.getStatusText(order.status)})`);
    console.log(`  Amount: ${order.amount} ${order.currencyId}`);
    console.log(`  Counterparty: ${order.targetNickName}`);

    try {
      // Find or create transaction
      let transaction = await this.prisma.transaction.findFirst({
        where: { orderId: order.id },
        include: { 
          chatMessages: true,
          advertisement: true,
          payout: true
        }
      });

      if (!transaction) {
        // Try to find by advertisement
        const advertisement = await this.prisma.bybitAdvertisement.findFirst({
          where: { bybitAdId: order.itemId }
        });

        if (advertisement) {
          transaction = await this.prisma.transaction.findFirst({
            where: { 
              advertisementId: advertisement.id,
              orderId: null
            },
            include: { 
              chatMessages: true,
              advertisement: true,
              payout: true
            }
          });

          if (transaction) {
            // Update with order ID
            transaction = await this.prisma.transaction.update({
              where: { id: transaction.id },
              data: { 
                orderId: order.id,
                status: this.mapOrderStatus(order.status)
              },
              include: { 
                chatMessages: true,
                advertisement: true,
                payout: true
              }
            });
            console.log(`  ✅ Linked order to existing transaction ${transaction.id}`);
          }
        }
      }

      if (!transaction) {
        console.log(`  ⚠️ No transaction found for order ${order.id}`);
        // Could create new transaction here if needed
        return;
      }

      // Sync chat messages
      await this.syncChatMessages(order.id, transaction.id, order.userId, httpClient);

      // Start chat polling if not already active
      await this.bybitManager.startChatPolling(transaction.id);

      // Check if automation needed
      const hasOurMessages = transaction.chatMessages.some(msg => msg.sender === 'us');
      const hasUnprocessedMessages = transaction.chatMessages.some(msg => 
        msg.sender === 'counterparty' && !msg.isProcessed
      );

      if (!hasOurMessages) {
        console.log('  🤖 No messages from us yet, starting automation...');
        await this.chatService.startAutomation(transaction.id);
      } else if (hasUnprocessedMessages) {
        console.log('  📨 Has unprocessed messages, processing...');
        await this.chatService.processUnprocessedMessages();
      }

      this.emit('orderProcessed', {
        orderId: order.id,
        transactionId: transaction.id,
        status: order.status
      });

    } catch (error) {
      console.error(`[ActiveOrdersMonitor] Error processing order:`, error);
      this.emit('error', error);
    }
  }

  private async syncChatMessages(
    orderId: string,
    transactionId: string,
    ourUserId: string,
    httpClient: any
  ) {
    try {
      console.log('  📨 Syncing chat messages...');
      
      const chatResponse = await httpClient.post('/v5/p2p/order/message/listpage', {
        orderId: orderId,
        size: "50"
      });

      if (chatResponse.result?.result && Array.isArray(chatResponse.result.result)) {
        console.log(`  Found ${chatResponse.result.result.length} messages`);

        for (const msg of chatResponse.result.result) {
          if (!msg.message) continue;

          // Check if message exists
          const exists = await this.prisma.chatMessage.findFirst({
            where: {
              transactionId: transactionId,
              messageId: msg.id
            }
          });

          if (!exists) {
            // Determine sender
            const sender = msg.userId === ourUserId ? 'us' : 'counterparty';

            await this.prisma.chatMessage.create({
              data: {
                transactionId: transactionId,
                messageId: msg.id,
                sender: sender,
                content: msg.message,
                messageType: msg.contentType === 'str' ? 'TEXT' : msg.contentType?.toUpperCase() || 'TEXT',
                isProcessed: sender === 'us'
              }
            });

            console.log(`  💾 New message: [${sender}] ${msg.message.substring(0, 50)}...`);
          }
        }
      }
    } catch (error) {
      console.error('[ActiveOrdersMonitor] Error syncing chat messages:', error);
    }
  }

  private mapOrderStatus(bybitStatus: number): string {
    switch (bybitStatus) {
      case 10: return 'waiting_payment';
      case 20: return 'payment_received';
      case 30: return 'completed';
      case 40: return 'cancelled';
      default: return 'unknown';
    }
  }

  private getStatusText(status: number): string {
    switch (status) {
      case 10: return 'Payment in processing';
      case 20: return 'Waiting for coin transfer';
      case 30: return 'Completed';
      case 40: return 'Cancelled';
      default: return 'Unknown';
    }
  }

  async cleanup() {
    await this.stopMonitoring();
    await this.prisma.$disconnect();
  }
}