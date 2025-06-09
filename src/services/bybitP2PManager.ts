/**
 * Bybit P2P Manager Service
 * Manages Bybit P2P accounts and operations
 */

import { P2PManager, P2PConfig } from "../bybit";
import { db, type BybitAccount } from "../db";
import { getExchangeRateManager } from "./exchangeRateManager";

export class BybitP2PManagerService {
  private manager: P2PManager;
  private initialized: boolean = false;
  private paymentMethodsCache: Map<string, Map<string, string>> = new Map(); // accountId -> Map<methodName, methodId>
  private paymentMethodsCacheTime: Map<string, number> = new Map(); // accountId -> timestamp
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache

  constructor() {
    this.manager = new P2PManager();
    this.setupEventHandlers();
  }

  /**
   * Initialize all Bybit accounts from database
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log("[BybitP2PManager] Initializing Bybit accounts...");

    const accounts = await db.getActiveBybitAccounts();

    for (const account of accounts) {
      try {
        await this.manager.addAccount(account.accountId, {
          apiKey: account.apiKey,
          apiSecret: account.apiSecret,
          testnet: false,
          debugMode: true, // Enable debug mode to see request details
          recvWindow: 20000, // Increase recv_window to 20 seconds to handle time sync issues
        });

        console.log(`[BybitP2PManager] Added account ${account.accountId}`);
      } catch (error) {
        console.error(
          `[BybitP2PManager] Failed to add account ${account.accountId}:`,
          error,
        );
      }
    }

    // Start order polling for all accounts
    this.manager.startOrderPollingAll(10000); // Poll every 10 seconds

    this.initialized = true;
    console.log(
      `[BybitP2PManager] Initialized with ${accounts.length} accounts`,
    );
  }

  /**
   * Setup event handlers for P2P events
   */
  private setupEventHandlers(): void {
    this.manager.on("accountConnected", async ({ accountId }) => {
      console.log(`[BybitP2PManager] Account ${accountId} connected`);
      await db.client.bybitAccount.update({
        where: { accountId },
        data: { lastSync: new Date() },
      });
    });

    this.manager.on("p2pEvent", async (event) => {
      console.log(`[BybitP2PManager] P2P Event:`, event);

      // Handle order creation events
      if (event.type === "ORDER_CREATED" && event.data.orderId) {
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
            status: "chat_started",
          });
        }
      }
    });

    this.manager.on("chatMessage", async ({ accountId, message }) => {
      console.log(
        `[BybitP2PManager] New chat message from ${accountId}:`,
        message,
      );

      // Save message to database
      const transaction = await db.getTransactionByOrderId(message.orderId);
      if (transaction) {
        await db.createChatMessage({
          transactionId: transaction.id,
          messageId: message.messageId,
          sender: message.senderId === accountId ? "us" : "counterparty",
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
   * Ensure service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Payment type ID mappings based on Bybit's system
   * These are common payment type IDs used by Bybit
   */
  private readonly PAYMENT_TYPE_MAPPINGS: Record<string, string[]> = {
    'Tinkoff': ['59', '75', '14'], // Different IDs that might represent Tinkoff
    'SBP': ['65', '71', '581'], // SBP/Fast Payment System IDs
    'Bank Transfer': ['1', '2'], // Generic bank transfer
    'Raiffeisenbank': ['64'],
    'Sberbank': ['28'],
    'Alfa-Bank': ['32'],
    'QIWI': ['31'],
    'YooMoney': ['35'],
  };

  /**
   * Get payment method name by type ID
   */
  private getPaymentMethodNameByType(paymentType: string): string | null {
    for (const [methodName, typeIds] of Object.entries(this.PAYMENT_TYPE_MAPPINGS)) {
      if (typeIds.includes(paymentType)) {
        return methodName;
      }
    }
    return null;
  }

  /**
   * Get payment methods for account with caching
   */
  private async getPaymentMethodsForAccount(accountId: string): Promise<Map<string, string>> {
    // Check cache first
    const cachedTime = this.paymentMethodsCacheTime.get(accountId) || 0;
    const now = Date.now();
    
    if (cachedTime && (now - cachedTime) < this.CACHE_DURATION) {
      const cached = this.paymentMethodsCache.get(accountId);
      if (cached) {
        return cached;
      }
    }

    try {
      // Ensure service is initialized
      await this.ensureInitialized();
      
      // Fetch payment methods from API
      const paymentMethods = await this.manager.getPaymentMethods(accountId);
      
      console.log(`[BybitP2PManager] Raw payment methods response for ${accountId}:`, JSON.stringify(paymentMethods, null, 2));
      
      // Create mapping of payment method names to IDs
      const methodMap = new Map<string, string>();
      
      // Check if paymentMethods is an array
      if (!Array.isArray(paymentMethods)) {
        console.error(`[BybitP2PManager] Payment methods response is not an array:`, paymentMethods);
        throw new Error('Invalid payment methods response format');
      }
      
      for (const method of paymentMethods) {
        // Check if method has required properties
        if (!method || typeof method !== 'object') {
          console.warn(`[BybitP2PManager] Invalid payment method object:`, method);
          continue;
        }
        
        // Extract ID
        const methodId = String(method.id);
        if (!methodId || methodId === '-1') {
          // Skip internal Balance payment method
          continue;
        }
        
        // Extract payment method details
        const paymentName = method.paymentConfigVo?.paymentName || '';
        const paymentType = String(method.paymentType || '');
        const bankName = method.bankName || '';
        const accountNo = method.accountNo || '';
        const isEnabled = method.online === '1';
        
        console.log(`[BybitP2PManager] Processing payment method:`, {
          id: methodId,
          name: paymentName,
          type: paymentType,
          bank: bankName,
          accountNo: accountNo,
          isEnabled: isEnabled,
          fullObject: method
        });
        
        // Note: Even if payment method is marked as offline (online: "0"),
        // we should still include it because it might still be usable for creating ads
        // The user's payment methods are all showing online: "0" but they need to work
        if (!isEnabled) {
          console.log(`[BybitP2PManager] Warning: Payment method ${methodId} is marked as offline but including anyway`);
        }
        
        // Try to determine payment method name
        let mappedMethodName: string | null = null;
        
        // First priority: Use payment name if available
        if (paymentName) {
          if (paymentName.toLowerCase().includes('tinkoff')) {
            mappedMethodName = 'Tinkoff';
          } else if (paymentName.toLowerCase().includes('sbp') || 
                     paymentName.toLowerCase().includes('fast payment') ||
                     paymentName.toLowerCase().includes('система быстрых платежей')) {
            mappedMethodName = 'SBP';
          } else if (paymentName.toLowerCase().includes('raiffeisen')) {
            mappedMethodName = 'Raiffeisenbank';
          } else if (paymentName.toLowerCase().includes('sber')) {
            mappedMethodName = 'Sberbank';
          } else if (paymentName.toLowerCase().includes('alfa') || paymentName.toLowerCase().includes('альфа')) {
            mappedMethodName = 'Alfa-Bank';
          }
        }
        
        // Second priority: Check bank name for bank transfers
        if (!mappedMethodName && bankName) {
          if (bankName.toLowerCase().includes('tinkoff')) {
            mappedMethodName = 'Tinkoff';
          } else if (bankName.toLowerCase().includes('sbp') || 
                     bankName.toLowerCase().includes('sber')) {
            mappedMethodName = 'SBP';
          } else if (bankName.toLowerCase().includes('raiffeisen')) {
            mappedMethodName = 'Raiffeisenbank';
          } else if (bankName.toLowerCase().includes('alfa') || bankName.toLowerCase().includes('альфа')) {
            mappedMethodName = 'Alfa-Bank';
          }
        }
        
        // Third priority: Use payment type mapping
        if (!mappedMethodName && paymentType) {
          mappedMethodName = this.getPaymentMethodNameByType(paymentType);
        }
        
        // Fourth priority: Check account number patterns
        if (!mappedMethodName && accountNo) {
          // Check for phone number pattern (might be SBP)
          if (/^\+?[78]\d{10}$/.test(accountNo.replace(/\D/g, ''))) {
            mappedMethodName = 'SBP';
          }
        }
        
        // If we identified a method name, add it to the map
        if (mappedMethodName) {
          console.log(`[BybitP2PManager] Mapped payment method: ${mappedMethodName} -> ${methodId}`);
          methodMap.set(mappedMethodName, methodId);
          
          // For Tinkoff and SBP, also add with lowercase
          if (mappedMethodName === 'Tinkoff') {
            methodMap.set('tinkoff', methodId);
          } else if (mappedMethodName === 'SBP') {
            methodMap.set('sbp', methodId);
          }
        }
        
        // Also map by exact payment name for flexibility
        if (paymentName) {
          methodMap.set(paymentName, methodId);
        }
        
        // Add mapping by payment type for debugging
        methodMap.set(`type_${paymentType}`, methodId);
      }
      
      // Cache the results
      this.paymentMethodsCache.set(accountId, methodMap);
      this.paymentMethodsCacheTime.set(accountId, now);
      
      console.log(`[BybitP2PManager] Final payment methods mapping for ${accountId}:`, 
        Array.from(methodMap.entries()));
      
      if (methodMap.size === 0) {
        console.warn(`[BybitP2PManager] No payment methods found for account ${accountId}`);
      }
      
      return methodMap;
    } catch (error) {
      console.error(`[BybitP2PManager] Failed to fetch payment methods for ${accountId}:`, error);
      throw new Error(`Failed to fetch payment methods: ${error.message}`);
    }
  }

  /**
   * Create advertisement with automatic account selection
   */
  async createAdvertisementWithAutoAccount(
    payoutId: string,
    amount: string,
    currency: string,
    paymentMethod: "SBP" | "Tinkoff",
  ): Promise<{ advertisementId: string; bybitAccountId: string }> {
    // Ensure service is initialized
    await this.ensureInitialized();
    
    // Get all active accounts
    const accounts = await db.getActiveBybitAccounts();
    if (accounts.length === 0) {
      throw new Error("No active Bybit accounts available");
    }

    // Try each account until we find one with less than 2 ads
    let selectedAccount: BybitAccount | null = null;
    let accountsStatus: Array<{accountId: string, dbAds: number, bybitAds: number, total: number}> = [];
    
    for (const account of accounts) {
      // Check if account already has 2 active ads (check both DB and Bybit API)
      const dbAdsCount = await db.countActiveAdvertisementsByAccount(account.accountId);
      const bybitAdsCount = await this.getActiveAdCountFromBybit(account.accountId);
      const activeAdsCount = Math.max(dbAdsCount, bybitAdsCount);
      
      accountsStatus.push({
        accountId: account.accountId,
        dbAds: dbAdsCount,
        bybitAds: bybitAdsCount,
        total: activeAdsCount
      });
      
      console.log(`[BybitP2PManager] Account ${account.accountId} ads count - DB: ${dbAdsCount}, Bybit: ${bybitAdsCount}, Total: ${activeAdsCount}`);
      
      if (activeAdsCount < 2) {
        selectedAccount = account;
        break;
      }
    }
    
    // If no account found with less than 2 ads, all accounts are full
    if (!selectedAccount) {
      const statusReport = accountsStatus
        .map(s => `${s.accountId}: ${s.total} ads (DB: ${s.dbAds}, Bybit: ${s.bybitAds})`)
        .join(', ');
      
      console.log(
        `[BybitP2PManager] All ${accounts.length} Bybit accounts have maximum ads (2 each). ` +
        `Account status: ${statusReport}. ` +
        `Waiting for some ads to complete...`
      );
      
      // Return a special response indicating we're waiting
      return {
        advertisementId: "WAITING",
        bybitAccountId: "WAITING"
      };
    }
    
    const account = selectedAccount;

    // Check payment method of existing ads
    const existingAds = await db.getActiveAdvertisementsByAccount(
      account.accountId,
    );
    let selectedPaymentMethod = paymentMethod;

    if (existingAds.length === 1) {
      // If one ad exists, use opposite payment method
      const existingMethod = existingAds[0].paymentMethod;
      selectedPaymentMethod = existingMethod === "SBP" ? "Tinkoff" : "SBP";
    }

    console.log(
      `[BybitP2PManager] Creating ad on account ${account.accountId} with method ${selectedPaymentMethod}`,
    );
    
    // Get payment method IDs for this account
    const paymentMethods = await this.getPaymentMethodsForAccount(account.accountId);
    const paymentMethodId = paymentMethods.get(selectedPaymentMethod);
    
    if (!paymentMethodId) {
      // List available methods for debugging
      const availableMethods = Array.from(paymentMethods.keys())
        .filter(key => !key.startsWith('type_')) // Filter out type_ entries for cleaner error message
        .join(', ');
      
      // Also list payment types for debugging
      const availableTypes = Array.from(paymentMethods.keys())
        .filter(key => key.startsWith('type_'))
        .map(key => key.replace('type_', ''))
        .join(', ');
      
      throw new Error(
        `Payment method '${selectedPaymentMethod}' not found for account ${account.accountId}. ` +
        `Available methods: ${availableMethods || 'none'}. ` +
        `Available payment types: ${availableTypes || 'none'}. ` +
        `Please ensure the payment method is configured and enabled in your Bybit account. ` +
        `If you see type 59, it might be Tinkoff. Type 65 might be SBP.`
      );
    }

    // Get exchange rate from the exchange rate manager
    const exchangeRateManager = getExchangeRateManager();
    let basePrice = exchangeRateManager.getRate();
    
    // Ensure basePrice is valid (must be positive)
    if (isNaN(basePrice) || basePrice <= 0) {
      console.warn(`[BybitP2PManager] Invalid base price: ${basePrice}, using default 85.00`);
      basePrice = 85.00; // Use a reasonable default
    }
    
    // Use the base price directly without any conflict checking
    let finalPrice = basePrice;
    
    console.log(`[BybitP2PManager] Using price: ${finalPrice.toFixed(2)}`);
    
    // Update exchange rate to use the final adjusted price
    const exchangeRate = finalPrice;
    
    // Validate exchange rate before calculation
    if (isNaN(exchangeRate) || exchangeRate <= 0) {
      throw new Error(`Invalid exchange rate: ${exchangeRate}. Cannot create advertisement.`);
    }
    
    // Calculate USDT quantity: (amount in RUB / exchange rate) + 5 USDT
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error(`Invalid amount: ${amount}. Cannot create advertisement.`);
    }
    
    const usdtQuantity = ((parsedAmount / exchangeRate) + 5).toFixed(2);
    
    // Validate the calculated quantity
    if (isNaN(parseFloat(usdtQuantity)) || parseFloat(usdtQuantity) <= 0) {
      throw new Error(`Invalid USDT quantity calculated: ${usdtQuantity}. Amount: ${amount}, Rate: ${exchangeRate}`);
    }
    
    // Store advertisement parameters since response won't include them
    const adParams = {
      tokenId: "USDT",
      currencyId: currency,
      side: "1", // 1 = SELL
      priceType: "0", // 0 = FIXED
      price: exchangeRate.toString(),
      premium: "", // Empty for fixed price
      minAmount: amount,
      maxAmount: amount,
      quantity: usdtQuantity,
      paymentIds: [paymentMethodId],
      remark: "✅ОПЛАЧИВАЮ ТОЛЬКО НА АЛЬФА БАНК, Т-БАНК, СБЕРАБАНК, ВТБ НОМЕР ТЕЛЕФОНА СКИДЫВАЕТЕ В ЧАТ, заходя в ордер вы соглашаетесь с моими условиями.✅ ✅ОПЛАЧИВАЮ В 3-5 ПЛАТЕЖЕЙ✅ ✅У вас должен быть доступ к лк, ЧЕКИ НЕ ПРЕДОСТАВЛЯЮ!✅ ✅После оплаты вы обязаны проверить поступления лично✅ ❌Треугольщики мимо‼️‼️❌ ✅С Реквизитами отправляем фио в чат✅ ✅после получения средств обязательно СКРИН С ИСТОРИИ ОПЕРАЦИЙ✅ ПОСЛЕ ПОЛУЧЕНИЯ СРЕДСТВ, СКРИНЫ!!! Заходите в сделку, если не торопитесь, оплачиваю в течении 10-40 минут. Нажимаю \"оплачено\" сразу, чтобы не истекло время сделки, так как не всегда получается быстро оплатить!",
      paymentPeriod: "15", // 15 minutes payment time as string
      itemType: "ORIGIN",
      tradingPreferenceSet: {} // Required empty object
    };
    
    console.log(`[BybitP2PManager] Creating advertisement with params:`, {
      ...adParams,
      paymentMethodName: selectedPaymentMethod,
      accountId: account.accountId,
    });

    // Create advertisement on Bybit
    // Note: Bybit only returns itemId and security fields, not full ad details
    const createResponse = await this.manager.createAdvertisement(
      adParams,
      account.accountId,
    );
    
    console.log(`[BybitP2PManager] Create advertisement response:`, createResponse);
    
    // Extract itemId from response
    // Response structure: { itemId: "...", securityRiskToken: "", ... }
    const itemId = createResponse.itemId || createResponse.id;
    if (!itemId) {
      throw new Error("Failed to get advertisement ID from Bybit response");
    }
    
    // Optional: Try to fetch the full advertisement details
    // This is not always necessary but can be useful for verification
    try {
      console.log(`[BybitP2PManager] Fetching advertisement details for ${itemId}`);
      const fullAdDetails = await this.manager.getAdvertisementDetails(itemId, account.accountId);
      console.log(`[BybitP2PManager] Full advertisement details:`, fullAdDetails);
    } catch (error) {
      console.warn(`[BybitP2PManager] Could not fetch full ad details (this is normal):`, error);
    }

    // Save to database with the parameters we sent
    const dbAd = await db.createAdvertisement({
      bybitAdId: itemId,
      bybitAccountId: account.accountId,
      side: "SELL",
      asset: "USDT",
      fiatCurrency: currency,
      price: adParams.price,
      quantity: adParams.quantity,
      minOrderAmount: adParams.minAmount,
      maxOrderAmount: adParams.maxAmount,
      paymentMethod: selectedPaymentMethod,
      status: "ONLINE", // Assume it's online after creation
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
      throw new Error("Transaction not found or no order ID");
    }

    const accountId = transaction.advertisement.bybitAccountId;

    await this.manager.sendChatMessage(
      {
        orderId: transaction.orderId,
        message,
        messageType: "TEXT",
      },
      accountId,
    );

    // Save message to database
    await db.createChatMessage({
      transactionId: transaction.id,
      messageId: `sent_${Date.now()}`,
      sender: "us",
      content: message,
      messageType: "TEXT",
    });
  }

  /**
   * Release assets for order
   */
  async releaseAssets(transactionId: string): Promise<void> {
    const transaction = await db.getTransactionWithDetails(transactionId);
    if (!transaction || !transaction.orderId) {
      throw new Error("Transaction not found or no order ID");
    }

    const accountId = transaction.advertisement.bybitAccountId;

    await this.manager.releaseAssets(transaction.orderId, accountId);

    // Update transaction status
    await db.updateTransaction(transactionId, {
      status: "completed",
      completedAt: new Date(),
    });
  }

  /**
   * Start chat polling for transaction
   */
  async startChatPolling(transactionId: string): Promise<void> {
    const transaction = await db.getTransactionWithDetails(transactionId);
    if (!transaction || !transaction.orderId) {
      throw new Error("Transaction not found or no order ID");
    }

    const accountId = transaction.advertisement.bybitAccountId;

    this.manager.startChatPolling(transaction.orderId, 3000, accountId);
  }

  /**
   * Clear payment methods cache for an account
   */
  clearPaymentMethodsCache(accountId?: string): void {
    if (accountId) {
      this.paymentMethodsCache.delete(accountId);
      this.paymentMethodsCacheTime.delete(accountId);
    } else {
      // Clear all cache
      this.paymentMethodsCache.clear();
      this.paymentMethodsCacheTime.clear();
    }
  }
  
  /**
   * Get active advertisement count from Bybit API
   */
  async getActiveAdCountFromBybit(accountId: string): Promise<number> {
    try {
      // Ensure service is initialized
      await this.ensureInitialized();
      
      const myAds = await this.manager.getMyAdvertisements(accountId);
      
      // Check if response is valid
      if (!myAds || typeof myAds !== 'object') {
        console.warn(`[BybitP2PManager] Invalid response from getMyAdvertisements:`, myAds);
        return 0;
      }
      
      // Check if list property exists and is an array
      if (!myAds.list || !Array.isArray(myAds.list)) {
        console.warn(`[BybitP2PManager] No advertisement list in response:`, myAds);
        return 0;
      }
      
      // Count only ONLINE ads (status 10 = ONLINE, 20 = OFFLINE, 30 = COMPLETED)
      const activeAds = myAds.list.filter(ad => ad && (ad.status === 'ONLINE' || ad.status === 10));
      return activeAds.length;
    } catch (error) {
      console.error(`[BybitP2PManager] Failed to get ad count from Bybit:`, error);
      // Fall back to database count
      return await db.countActiveAdvertisementsByAccount(accountId);
    }
  }

  /**
   * List all available payment methods for an account
   */
  async listPaymentMethods(accountId: string): Promise<Array<{id: string, name: string, type: string, bankName?: string, isEnabled?: boolean, mappedName?: string, accountNo?: string}>> {
    const paymentMethods = await this.manager.getPaymentMethods(accountId);
    
    console.log(`[BybitP2PManager] listPaymentMethods - Raw response:`, JSON.stringify(paymentMethods, null, 2));
    
    if (!Array.isArray(paymentMethods)) {
      console.error(`[BybitP2PManager] Payment methods response is not an array`);
      return [];
    }
    
    return paymentMethods
      .filter(method => method.id !== '-1') // Skip internal Balance payment method
      .map(method => {
        const id = String(method.id);
        const paymentName = method.paymentConfigVo?.paymentName || '';
        const type = String(method.paymentType);
        const bankName = method.bankName || undefined;
        const accountNo = method.accountNo || undefined;
        const isEnabled = method.online === '1';
        
        // Try to map the payment method name
        let mappedName: string | undefined;
        if (paymentName.toLowerCase().includes('tinkoff')) {
          mappedName = 'Tinkoff';
        } else if (paymentName.toLowerCase().includes('sbp') || 
                   paymentName.toLowerCase().includes('fast payment')) {
          mappedName = 'SBP';
        } else if (bankName?.toLowerCase().includes('tinkoff')) {
          mappedName = 'Tinkoff';
        } else if (bankName?.toLowerCase().includes('sbp')) {
          mappedName = 'SBP';
        } else {
          // Use type mapping
          mappedName = this.getPaymentMethodNameByType(type) || undefined;
        }
        
        // Generate display name
        let displayName = paymentName;
        if (!displayName) {
          if (mappedName) {
            displayName = `${mappedName} (Type ${type})`;
          } else {
            displayName = `Payment Type ${type}`;
          }
        }
        
        return {
          id: id,
          name: displayName,
          type: type,
          bankName: bankName,
          isEnabled: isEnabled,
          mappedName: mappedName,
          accountNo: accountNo
        };
      });
  }
}
