import { db } from "../db";
import { BybitP2PManagerService } from "./bybitP2PManager";
import { ChatAutomationService } from "./chatAutomation";
import { TimeSync } from "../bybit/utils/timeSync";
import { EventEmitter } from "events";

export class ActiveOrdersMonitorService extends EventEmitter {
  private bybitManager: BybitP2PManagerService;
  private chatService: ChatAutomationService;
  private monitoringInterval: NodeJS.Timeout | null = null;
  public isMonitoring = false;

  constructor(bybitManager: BybitP2PManagerService) {
    super();
    this.bybitManager = bybitManager;
    this.chatService = new ChatAutomationService(bybitManager);
  }

  async startMonitoring(intervalMs = 30000) {
    if (this.isMonitoring) {
      console.log("[ActiveOrdersMonitor] Already monitoring");
      return;
    }

    this.isMonitoring = true;
    console.log("[ActiveOrdersMonitor] Starting active orders monitoring...");

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
    console.log("[ActiveOrdersMonitor] Monitoring stopped");
  }

  private async checkActiveOrders() {
    try {
      console.log("\n[ActiveOrdersMonitor] ========= CHECKING ACTIVE ORDERS =========");
      console.log(`[ActiveOrdersMonitor] Time: ${new Date().toLocaleString()}`);

      // Ensure time sync
      if (!TimeSync.isSynchronized()) {
        await TimeSync.forceSync(false);
      }

      const accounts = await this.bybitManager.getActiveAccounts();
      console.log(`[ActiveOrdersMonitor] Checking ${accounts.length} Bybit accounts...`);

      let totalOrdersFound = 0;
      for (const account of accounts) {
        const ordersFound = await this.checkAccountOrders(account.accountId);
        totalOrdersFound += ordersFound;
      }

      console.log(`[ActiveOrdersMonitor] Total active orders found: ${totalOrdersFound}`);

      // Process any unprocessed messages
      await this.chatService.processUnprocessedMessages();
      
      console.log("[ActiveOrdersMonitor] ==========================================\n");
    } catch (error) {
      console.error("[ActiveOrdersMonitor] Error checking orders:", error);
      this.emit("error", error);
    }
  }

  private async checkAccountOrders(accountId: string): Promise<number> {
    let ordersFound = 0;
    try {
      const client = this.bybitManager.getClient(accountId);
      const httpClient = (client as any).httpClient;

      console.log(`\n[ActiveOrdersMonitor] 📋 Account: ${accountId}`);

      // Get specific orders from DB
      const activeTransactions = await db.getActiveTransactions();

      for (const transaction of activeTransactions) {
        if (transaction.orderId) {
          // Check specific order
          await this.processSpecificOrder(
            transaction.orderId,
            accountId,
            httpClient,
          );
        }
      }

      // Also check for new orders
      const newOrdersFound = await this.checkForNewOrders(accountId, httpClient);
      ordersFound += newOrdersFound;
    } catch (error) {
      console.error(
        `[ActiveOrdersMonitor] Error checking account ${accountId}:`,
        error,
      );
    }
    return ordersFound;
  }

  private async processSpecificOrder(
    orderId: string,
    accountId: string,
    httpClient: any,
  ) {
    try {
      console.log(`[ActiveOrdersMonitor] Checking order ${orderId}`);

      // Get order info
      const orderInfo = await httpClient.post("/v5/p2p/order/info", {
        orderId: orderId,
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
      console.error(
        `[ActiveOrdersMonitor] Error processing order ${orderId}:`,
        error,
      );
    }
  }

  private async checkForNewOrders(accountId: string, httpClient: any): Promise<number> {
    let ordersFound = 0;
    try {
      const client = this.bybitManager.getClient(accountId);
      if (!client) return 0;

      // Get all orders first (without status filter)
      const allOrdersResult = await client.getOrdersSimplified({
        page: 1,
        size: 20,
      });

      console.log(
        `   Found ${allOrdersResult.count} total orders`,
      );

      if (allOrdersResult.items && allOrdersResult.items.length > 0) {
        // Process all orders with relevant statuses
        // Status 10 = Payment in processing
        // Status 20 = Waiting for coin transfer
        // Status 30 = Completed
        // Status 40 = Cancelled
        // Status 50 = Disputed
        const relevantOrders = allOrdersResult.items.filter(
          (order: any) => order.status === 10 || order.status === 20,
        );

        console.log(`   Active orders (status 10 or 20): ${relevantOrders.length}`);
        
        // Display order details
        for (const order of allOrdersResult.items) {
          const statusText = this.getStatusText(order.status);
          console.log(`\n   📦 Order: ${order.id}`);
          console.log(`      Status: ${order.status} (${statusText})`);
          console.log(`      Amount: ${order.amount} ${order.currencyId}`);
          console.log(`      Price: ${order.price}`);
          console.log(`      USDT: ${order.notifyTokenQuantity} ${order.notifyTokenId}`);
          console.log(`      Counterparty: ${order.targetNickName}`);
          console.log(`      Created: ${order.createDate ? new Date(parseInt(order.createDate)).toLocaleString() : 'Unknown'}`);
          
          if (order.status === 10 || order.status === 20) {
            ordersFound++;
            await this.processActiveOrder(order, accountId, httpClient);
          }
        }
      }

      // Also check for specific active status orders
      const activeOrdersResult = await client.getOrdersSimplified({
        page: 1,
        size: 20,
        status: 10, // Payment in processing
      });

      if (activeOrdersResult.items && activeOrdersResult.items.length > 0) {
        console.log(
          `\n   Orders specifically with status 10: ${activeOrdersResult.items.length}`,
        );

        for (const order of activeOrdersResult.items) {
          // Skip if already processed
          const alreadyProcessed = allOrdersResult.items?.some((o: any) => o.id === order.id);
          if (!alreadyProcessed) {
            ordersFound++;
            await this.processActiveOrder(order, accountId, httpClient);
          }
        }
      }
    } catch (error) {
      console.error(
        `[ActiveOrdersMonitor] Error checking new orders:`,
        error,
      );
    }
    return ordersFound;
  }

  private async processActiveOrder(
    order: any,
    accountId: string,
    httpClient: any,
  ) {
    console.log(`\n      🔄 Processing active order ${order.id}`);

    try {
      // Find or create transaction
      let transaction = await db.getTransactionByOrderId(order.id);

      if (!transaction) {
        // Try to find by advertisement ID
        const advertisements = await db.getAdvertisements();
        const advertisement = advertisements.find(ad => ad.bybitAdId === order.itemId);

        if (advertisement) {
          // Find transaction by advertisement
          const transactions = await db.getActiveTransactions();
          transaction = transactions.find(t => t.advertisementId === advertisement.id && !t.orderId);

          if (transaction) {
            // Update with order ID
            await db.updateTransaction(transaction.id, {
              orderId: order.id,
              status: this.mapOrderStatus(order.status),
            });
            transaction = await db.getTransactionWithDetails(transaction.id);
            console.log(
              `      ✅ Linked order to existing transaction ${transaction.id}`,
            );
          }
        }
      }

      if (!transaction) {
        console.log(`      ⚠️ No transaction found for order ${order.id}`);
        // Could create new transaction here if needed
        return;
      }

      // Sync chat messages
      await this.syncChatMessages(
        order.id,
        transaction.id,
        order.userId,
        httpClient,
      );

      // Get updated transaction with messages
      transaction = await db.getTransactionWithDetails(transaction.id);

      // Check if automation needed
      const hasOurMessages = transaction.chatMessages?.some(
        (msg) => msg.sender === "us",
      ) || false;
      const hasUnprocessedMessages = transaction.chatMessages?.some(
        (msg) => msg.sender === "counterparty" && !msg.isProcessed,
      ) || false;

      if (!hasOurMessages) {
        console.log("      🤖 No messages from us yet, starting automation...");
        await this.chatService.startAutomation(transaction.id);
        console.log("      ✅ Initial message sent!");
      } else if (hasUnprocessedMessages) {
        console.log("      📨 Has unprocessed messages, processing...");
        await this.chatService.processUnprocessedMessages();
      } else {
        console.log("      ✅ Chat is up to date");
      }

      // Start chat polling if not already active
      await this.bybitManager.startChatPolling(transaction.id);

      this.emit("orderProcessed", {
        orderId: order.id,
        transactionId: transaction.id,
        status: order.status,
      });
    } catch (error) {
      console.error(`[ActiveOrdersMonitor] Error processing order:`, error);
      this.emit("error", error);
    }
  }

  private async syncChatMessages(
    orderId: string,
    transactionId: string,
    ourUserId: string,
    httpClient: any,
  ) {
    try {
      console.log("      📨 Syncing chat messages...");

      const chatResponse = await httpClient.post(
        "/v5/p2p/order/message/listpage",
        {
          orderId: orderId,
          size: "50",
        },
      );

      // Handle both response structures
      let messages = [];
      if (chatResponse.result && Array.isArray(chatResponse.result)) {
        messages = chatResponse.result;
      } else if (chatResponse.result?.result && Array.isArray(chatResponse.result.result)) {
        messages = chatResponse.result.result;
      }

      if (messages.length > 0) {
        console.log(`      Found ${messages.length} total messages`);
        
        let newMessagesCount = 0;
        let ourMessagesCount = 0;
        let theirMessagesCount = 0;

        for (const msg of messages) {
          if (!msg.message) continue;

          // Determine sender
          const sender = msg.userId === ourUserId ? "us" : "counterparty";
          
          if (sender === "us") {
            ourMessagesCount++;
          } else {
            theirMessagesCount++;
          }

          // Check if message exists
          const existingMessages = await db.getChatMessages(transactionId);
          const exists = existingMessages.find(m => m.messageId === msg.id);

          if (!exists) {
            newMessagesCount++;
            
            await db.saveChatMessage({
              transactionId: transactionId,
              messageId: msg.id,
              sender: sender,
              content: msg.message,
              messageType:
                msg.contentType === "str"
                  ? "TEXT"
                  : msg.contentType?.toUpperCase() || "TEXT",
              isProcessed: sender === "us",
            });

            console.log(
              `      💬 New message [${sender}]: ${msg.message.substring(0, 80)}${msg.message.length > 80 ? '...' : ''}`,
            );
          }
        }
        
        console.log(`      📊 Message stats: ${ourMessagesCount} from us, ${theirMessagesCount} from counterparty, ${newMessagesCount} new`);
        
        // Show latest message
        if (messages.length > 0) {
          const latestMsg = messages[0]; // Usually the latest message is first
          const sender = latestMsg.userId === ourUserId ? "us" : "counterparty";
          console.log(`      📝 Latest message [${sender}]: ${latestMsg.message.substring(0, 80)}${latestMsg.message.length > 80 ? '...' : ''}`);
        }
      } else {
        console.log("      No messages found in chat");
      }
    } catch (error) {
      console.error(
        "[ActiveOrdersMonitor] Error syncing chat messages:",
        error,
      );
    }
  }

  private mapOrderStatus(bybitStatus: number): string {
    switch (bybitStatus) {
      case 10:
        return "waiting_payment";
      case 20:
        return "payment_received";
      case 30:
        return "completed";
      case 40:
        return "cancelled";
      default:
        return "unknown";
    }
  }

  private getStatusText(status: number): string {
    switch (status) {
      case 10:
        return "Payment in processing";
      case 20:
        return "Waiting for coin transfer";
      case 30:
        return "Completed";
      case 40:
        return "Cancelled";
      case 50:
        return "Disputed";
      default:
        return "Unknown";
    }
  }

  async cleanup() {
    await this.stopMonitoring();
  }
}
