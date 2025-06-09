/**
 * Сервис обработки P2P ордеров Bybit
 */

import { EventEmitter } from 'events';
import { PrismaClient } from "../../generated/prisma";
import { BybitP2PManagerService } from './bybitP2PManager';
import { ChatAutomationService } from './chatAutomation';

const prisma = new PrismaClient();

interface OrderProcessorConfig {
  pollingInterval?: number; // Интервал опроса ордеров (мс)
  maxRetries?: number;
  retryDelay?: number;
}

interface P2POrder {
  id: string;
  side: number; // 0: Buy, 1: Sell
  tokenId: string;
  orderType: string;
  amount: string;
  currencyId: string;
  price: string;
  fee: string;
  targetNickName: string;
  targetUserId: string;
  status: number;
  createDate: string;
  transferLastSeconds: string;
  sellerRealName: string;
  buyerRealName: string;
}

type OrderStatus = 
  | 'CREATED'      // Order just created
  | 'PAID'         // Buyer marked as paid
  | 'RELEASED'     // Seller released crypto
  | 'COMPLETED'    // Order completed
  | 'CANCELLED'    // Order cancelled
  | 'APPEALING';   // Order in dispute

interface OrderEvent {
  type: 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'ORDER_COMPLETED' | 'ORDER_FAILED';
  orderId: string;
  advertisementId?: string;
  status?: OrderStatus;
  data?: any;
}

export class P2POrderProcessor extends EventEmitter {
  private config: Required<OrderProcessorConfig>;
  private intervalId?: NodeJS.Timeout;
  public isRunning = false;
  private processedOrders = new Set<string>();
  private orderMonitors = new Map<string, NodeJS.Timeout>();

  constructor(
    private bybitManager: BybitP2PManagerService,
    private chatService: ChatAutomationService,
    config: OrderProcessorConfig = {}
  ) {
    super();
    
    this.config = {
      pollingInterval: config.pollingInterval || 10000, // 10 seconds
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 5000
    };

    // Listen to chat service events
    this.chatService.on('chatMessage', this.handleChatMessage.bind(this));
  }

  /**
   * Start monitoring for new orders
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[OrderProcessor] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[OrderProcessor] Starting order monitoring...');

    // Start polling
    this.intervalId = setInterval(() => {
      this.checkPendingOrders().catch(error => {
        console.error('[OrderProcessor] Error checking orders:', error);
      });
    }, this.config.pollingInterval);

    // Initial check
    await this.checkPendingOrders();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    // Clear all order monitors
    for (const [orderId, timeout] of this.orderMonitors) {
      clearTimeout(timeout);
    }
    this.orderMonitors.clear();

    this.isRunning = false;
    console.log('[OrderProcessor] Stopped');
  }

  /**
   * Check for pending orders
   */
  private async checkPendingOrders(): Promise<void> {
    try {
      const accounts = await this.bybitManager.getActiveAccounts();
      
      for (const account of accounts) {
        try {
          await this.checkAccountOrders(account.accountId);
        } catch (error) {
          console.error(`[OrderProcessor] Error checking account ${account.accountId}:`, error);
        }
      }
    } catch (error) {
      console.error('[OrderProcessor] Error in checkPendingOrders:', error);
    }
  }

  /**
   * Check orders for specific account
   */
  private async checkAccountOrders(accountId: string): Promise<void> {
    const client = this.bybitManager.getClient(accountId);
    if (!client) {
      return;
    }

    try {
      // Get pending orders
      const response = await client.request({
        method: 'POST',
        endpoint: '/v5/p2p/order/pending/simplifyList',
        data: {
          page: 1,
          size: 20
        }
      });

      if (!response.result?.items) {
        return;
      }

      const orders: P2POrder[] = response.result.items;
      
      for (const order of orders) {
        if (!this.processedOrders.has(order.id)) {
          await this.processNewOrder(order, accountId);
        }
      }
    } catch (error) {
      console.error(`[OrderProcessor] Error fetching orders for ${accountId}:`, error);
    }
  }

  /**
   * Process newly discovered order
   */
  private async processNewOrder(order: P2POrder, bybitAccountId: string): Promise<void> {
    try {
      console.log(`[OrderProcessor] New order discovered: ${order.id}`);
      this.processedOrders.add(order.id);

      // Get order details
      const orderDetails = await this.getOrderDetails(order.id, bybitAccountId);
      if (!orderDetails) {
        console.error(`[OrderProcessor] Failed to get details for order ${order.id}`);
        return;
      }

      // Find matching transaction by advertisement ID
      const advertisementId = orderDetails.itemId;
      const transaction = await prisma.transaction.findFirst({
        where: {
          advertisement: {
            bybitId: advertisementId
          }
        },
        include: {
          advertisement: true,
          payout: true
        }
      });

      if (!transaction) {
        console.error(`[OrderProcessor] No transaction found for advertisement ${advertisementId}`);
        return;
      }

      // Update transaction with order ID
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          orderId: order.id,
          status: 'chat_started'
        }
      });

      console.log(`[OrderProcessor] Linked order ${order.id} to transaction ${transaction.id}`);

      // Delete the advertisement
      if (transaction.advertisement) {
        try {
          await this.deleteAdvertisement(transaction.advertisement.id, bybitAccountId);
        } catch (error) {
          console.error(`[OrderProcessor] Error deleting advertisement:`, error);
        }
      }

      // Start chat automation
      await this.chatService.startAutomation(transaction.id);

      // Start monitoring order status
      this.startOrderMonitoring(order.id, transaction.id, bybitAccountId);

      // Emit event
      this.emit('orderEvent', {
        type: 'ORDER_CREATED',
        orderId: order.id,
        advertisementId,
        data: order
      } as OrderEvent);

    } catch (error) {
      console.error(`[OrderProcessor] Error processing order ${order.id}:`, error);
    }
  }

  /**
   * Get detailed order information
   */
  private async getOrderDetails(orderId: string, accountId: string): Promise<any> {
    const client = this.bybitManager.getClient(accountId);
    if (!client) {
      return null;
    }

    try {
      const response = await client.request({
        method: 'POST',
        endpoint: '/v5/p2p/order/info',
        data: { orderId }
      });

      return response.result;
    } catch (error) {
      console.error(`[OrderProcessor] Error getting order details:`, error);
      return null;
    }
  }

  /**
   * Delete advertisement after order creation
   */
  private async deleteAdvertisement(advertisementId: string, accountId: string): Promise<void> {
    const client = this.bybitManager.getClient(accountId);
    if (!client) {
      return;
    }

    try {
      // Get Bybit advertisement details
      const advertisement = await prisma.bybitAdvertisement.findUnique({
        where: { id: advertisementId }
      });

      if (!advertisement || !advertisement.bybitId) {
        console.error(`[OrderProcessor] Advertisement ${advertisementId} not found`);
        return;
      }

      // Cancel on Bybit
      await client.request({
        method: 'POST',
        endpoint: '/v5/p2p/item/cancel',
        data: { itemId: advertisement.bybitId }
      });

      // Update status in DB
      await prisma.bybitAdvertisement.update({
        where: { id: advertisementId },
        data: { status: 'DELETED' }
      });

      console.log(`[OrderProcessor] Deleted advertisement ${advertisementId}`);
    } catch (error) {
      console.error(`[OrderProcessor] Error deleting advertisement ${advertisementId}:`, error);
      throw error;
    }
  }

  /**
   * Start monitoring order status changes
   */
  private startOrderMonitoring(orderId: string, transactionId: string, accountId: string): void {
    // Monitor for 30 minutes max
    const maxMonitorTime = 30 * 60 * 1000;
    
    const checkStatus = async () => {
      try {
        const orderDetails = await this.getOrderDetails(orderId, accountId);
        if (!orderDetails) {
          return;
        }

        const oldStatus = await this.getTransactionStatus(transactionId);
        const newStatus = this.mapOrderStatus(orderDetails.status);

        if (oldStatus !== newStatus) {
          console.log(`[OrderProcessor] Order ${orderId} status changed: ${oldStatus} -> ${newStatus}`);
          
          await this.updateTransactionStatus(transactionId, newStatus);
          
          this.emit('orderEvent', {
            type: 'ORDER_STATUS_CHANGED',
            orderId,
            status: newStatus,
            data: orderDetails
          } as OrderEvent);

          // Stop monitoring if completed or failed
          if (newStatus === 'COMPLETED' || newStatus === 'CANCELLED') {
            this.stopOrderMonitoring(orderId);
          }
        }
      } catch (error) {
        console.error(`[OrderProcessor] Error monitoring order ${orderId}:`, error);
      }
    };

    // Check every 30 seconds
    const intervalId = setInterval(checkStatus, 30000);
    this.orderMonitors.set(orderId, intervalId);

    // Stop monitoring after max time
    setTimeout(() => {
      this.stopOrderMonitoring(orderId);
    }, maxMonitorTime);
  }

  /**
   * Stop monitoring specific order
   */
  private stopOrderMonitoring(orderId: string): void {
    const intervalId = this.orderMonitors.get(orderId);
    if (intervalId) {
      clearInterval(intervalId);
      this.orderMonitors.delete(orderId);
    }
  }

  /**
   * Map Bybit order status to our status
   */
  private mapOrderStatus(bybitStatus: number): string {
    switch (bybitStatus) {
      case 5: // waiting for chain
      case 10: // waiting for buy pay
        return 'waiting_payment';
      case 20: // waiting for seller release
        return 'payment_received';
      case 30: // Appealing
      case 100: // objectioning
      case 110: // Waiting for objection
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Get current transaction status
   */
  private async getTransactionStatus(transactionId: string): Promise<string> {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { status: true }
    });
    return transaction?.status || 'pending';
  }

  /**
   * Update transaction status
   */
  private async updateTransactionStatus(transactionId: string, status: string): Promise<void> {
    const updateData: any = { status };
    
    if (status === 'payment_received') {
      updateData.paymentSentAt = new Date();
    } else if (status === 'completed') {
      updateData.completedAt = new Date();
    }

    await prisma.transaction.update({
      where: { id: transactionId },
      data: updateData
    });
  }

  /**
   * Handle chat messages from automation service
   */
  private async handleChatMessage(data: any): Promise<void> {
    const { transactionId, message, sender } = data;
    
    try {
      // Save message to DB
      await prisma.chatMessage.create({
        data: {
          transactionId,
          messageId: message.id || Date.now().toString(),
          sender,
          content: message.content,
          messageType: message.type || 'TEXT',
          isProcessed: true
        }
      });
    } catch (error) {
      console.error('[OrderProcessor] Error saving chat message:', error);
    }
  }
}

// Export for convenience
export async function startP2POrderProcessor(
  bybitManager: BybitP2PManagerService,
  chatService: ChatAutomationService,
  config?: OrderProcessorConfig
): Promise<P2POrderProcessor> {
  const processor = new P2POrderProcessor(bybitManager, chatService, config);
  await processor.start();
  return processor;
}