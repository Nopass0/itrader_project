/**
 * Bybit P2P Manager Service
 * Manages Bybit P2P accounts and operations
 */

import { P2PManager, P2PConfig } from '../bybit';
import { db, type BybitAccount } from '../db';

export class BybitP2PManagerService {
  private manager: P2PManager;
  private initialized: boolean = false;

  constructor() {
    this.manager = new P2PManager();
    this.setupEventHandlers();
  }

  /**
   * Initialize all Bybit accounts from database
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[BybitP2PManager] Initializing Bybit accounts...');
    
    const accounts = await db.getActiveBybitAccounts();
    
    for (const account of accounts) {
      try {
        await this.manager.addAccount(account.accountId, {
          apiKey: account.apiKey,
          apiSecret: account.apiSecret,
          testnet: false,
        });
        
        console.log(`[BybitP2PManager] Added account ${account.accountId}`);
      } catch (error) {
        console.error(`[BybitP2PManager] Failed to add account ${account.accountId}:`, error);
      }
    }

    // Start order polling for all accounts
    this.manager.startOrderPollingAll(10000); // Poll every 10 seconds
    
    this.initialized = true;
    console.log(`[BybitP2PManager] Initialized with ${accounts.length} accounts`);
  }

  /**
   * Setup event handlers for P2P events
   */
  private setupEventHandlers(): void {
    this.manager.on('accountConnected', async ({ accountId }) => {
      console.log(`[BybitP2PManager] Account ${accountId} connected`);
      await db.client.bybitAccount.update({
        where: { accountId },
        data: { lastSync: new Date() },
      });
    });

    this.manager.on('p2pEvent', async (event) => {
      console.log(`[BybitP2PManager] P2P Event:`, event);
      
      // Handle order creation events
      if (event.type === 'ORDER_CREATED' && event.data.orderId) {
        // Update transaction with order ID
        const transaction = await db.client.transaction.findFirst({
          where: {
            advertisement: {
              bybitAdId: event.data.itemId,
            },
          },
        });
        
        if (transaction) {
          await db.updateTransaction(transaction.id, {
            orderId: event.data.orderId,
            status: 'chat_started',
          });
        }
      }
    });

    this.manager.on('chatMessage', async ({ accountId, message }) => {
      console.log(`[BybitP2PManager] New chat message from ${accountId}:`, message);
      
      // Save message to database
      const transaction = await db.getTransactionByOrderId(message.orderId);
      if (transaction) {
        await db.createChatMessage({
          transactionId: transaction.id,
          messageId: message.messageId,
          sender: message.senderId === accountId ? 'us' : 'counterparty',
          content: message.content,
          messageType: message.type,
        });
      }
    });
  }

  /**
   * Get the manager instance
   */
  getManager(): P2PManager {
    return this.manager;
  }

  /**
   * Create advertisement with automatic account selection
   */
  async createAdvertisementWithAutoAccount(
    payoutId: string,
    amount: string,
    currency: string,
    paymentMethod: 'SBP' | 'Tinkoff',
  ): Promise<{ advertisementId: string; bybitAccountId: string }> {
    // Get account with least ads
    const account = await db.getBybitAccountWithLeastAds();
    if (!account) {
      throw new Error('No active Bybit accounts available');
    }

    // Check if account already has 2 active ads
    const activeAdsCount = await db.countActiveAdvertisementsByAccount(account.accountId);
    if (activeAdsCount >= 2) {
      throw new Error(`Account ${account.accountId} already has maximum ads`);
    }

    // Check payment method of existing ads
    const existingAds = await db.getActiveAdvertisementsByAccount(account.accountId);
    let selectedPaymentMethod = paymentMethod;
    
    if (existingAds.length === 1) {
      // If one ad exists, use opposite payment method
      const existingMethod = existingAds[0].paymentMethod;
      selectedPaymentMethod = existingMethod === 'SBP' ? 'Tinkoff' : 'SBP';
    }

    console.log(`[BybitP2PManager] Creating ad on account ${account.accountId} with method ${selectedPaymentMethod}`);

    // Create advertisement on Bybit
    const ad = await this.manager.createAdvertisement({
      side: 'SELL',
      asset: 'USDT',
      fiatCurrency: currency,
      priceType: 'FLOAT',
      floatRate: 0.01, // 1% above market
      quantity: amount,
      minOrderAmount: '100',
      maxOrderAmount: amount,
      paymentIds: [selectedPaymentMethod], // This should be actual payment method IDs
      remarks: 'Fast trade, instant release',
    }, account.accountId);

    // Save to database
    const dbAd = await db.createAdvertisement({
      bybitAdId: ad.id,
      bybitAccountId: account.accountId,
      side: 'SELL',
      asset: 'USDT',
      fiatCurrency: currency,
      price: ad.price,
      quantity: ad.quantity,
      minOrderAmount: ad.minOrderAmount,
      maxOrderAmount: ad.maxOrderAmount,
      paymentMethod: selectedPaymentMethod,
      status: ad.status,
    });

    return {
      advertisementId: dbAd.id,
      bybitAccountId: account.accountId,
    };
  }

  /**
   * Send chat message for transaction
   */
  async sendChatMessage(transactionId: string, message: string): Promise<void> {
    const transaction = await db.getTransactionWithDetails(transactionId);
    if (!transaction || !transaction.orderId) {
      throw new Error('Transaction not found or no order ID');
    }

    const accountId = transaction.advertisement.bybitAccountId;
    
    await this.manager.sendChatMessage({
      orderId: transaction.orderId,
      message,
      messageType: 'TEXT',
    }, accountId);

    // Save message to database
    await db.createChatMessage({
      transactionId: transaction.id,
      messageId: `sent_${Date.now()}`,
      sender: 'us',
      content: message,
      messageType: 'TEXT',
    });
  }

  /**
   * Release assets for order
   */
  async releaseAssets(transactionId: string): Promise<void> {
    const transaction = await db.getTransactionWithDetails(transactionId);
    if (!transaction || !transaction.orderId) {
      throw new Error('Transaction not found or no order ID');
    }

    const accountId = transaction.advertisement.bybitAccountId;
    
    await this.manager.releaseAssets(transaction.orderId, accountId);
    
    // Update transaction status
    await db.updateTransaction(transactionId, {
      status: 'completed',
      completedAt: new Date(),
    });
  }

  /**
   * Start chat polling for transaction
   */
  async startChatPolling(transactionId: string): Promise<void> {
    const transaction = await db.getTransactionWithDetails(transactionId);
    if (!transaction || !transaction.orderId) {
      throw new Error('Transaction not found or no order ID');
    }

    const accountId = transaction.advertisement.bybitAccountId;
    
    this.manager.startChatPolling(transaction.orderId, 3000, accountId);
  }
}