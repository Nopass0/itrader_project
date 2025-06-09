/**
 * Bybit P2P Client
 * Core client for interacting with Bybit P2P API
 */

import { EventEmitter } from 'events';
import { HttpClient } from './utils/httpClient';
import {
  P2PConfig,
  P2PAdvertisement,
  CreateAdvertisementParams,
  UpdateAdvertisementParams,
  P2POrder,
  ChatMessage,
  SendMessageParams,
  PaymentMethod,
  ApiResponse,
  PaginatedResponse,
  AdvertisementFilter,
  OrderFilter,
  P2PEvent,
  P2PEventType,
} from './types/p2p';

export class P2PClient extends EventEmitter {
  private httpClient: HttpClient;
  private config: P2PConfig;
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isConnected: boolean = false;

  constructor(config: P2PConfig) {
    super();
    this.config = config;
    this.httpClient = new HttpClient(config);
  }

  /**
   * Connect to P2P service (simulates WebSocket connection)
   */
  async connect(): Promise<void> {
    try {
      // Test connection by getting account info
      await this.getAccountInfo();
      this.isConnected = true;
      this.emit('connected');
      
      if (this.config.debugMode) {
        console.log('P2P Client connected successfully');
      }
    } catch (error) {
      this.isConnected = false;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnect from P2P service
   */
  disconnect(): void {
    // Clear all polling intervals
    for (const [key, interval] of this.pollingIntervals) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();
    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * Get account information
   */
  async getAccountInfo(): Promise<any> {
    return await this.httpClient.post('/v5/p2p/user/personal/info', {});
  }

  // ========== Advertisement Methods ==========

  /**
   * Get all active advertisements
   */
  async getActiveAdvertisements(filter?: AdvertisementFilter): Promise<PaginatedResponse<P2PAdvertisement>> {
    const response = await this.httpClient.post<PaginatedResponse<P2PAdvertisement>>(
      '/v5/p2p/item/online',
      filter || {}
    );
    return response.result;
  }

  /**
   * Get my advertisements
   */
  async getMyAdvertisements(page: number = 1, pageSize: number = 20): Promise<PaginatedResponse<P2PAdvertisement>> {
    const response = await this.httpClient.post<PaginatedResponse<P2PAdvertisement>>(
      '/v5/p2p/item/personal/list',
      { page, pageSize }
    );
    return response.result;
  }

  /**
   * Get advertisement details
   */
  async getAdvertisementDetails(itemId: string): Promise<P2PAdvertisement> {
    const response = await this.httpClient.post<P2PAdvertisement>(
      '/v5/p2p/item/info',
      { itemId }
    );
    return response.result;
  }

  /**
   * Create new advertisement
   */
  async createAdvertisement(params: CreateAdvertisementParams): Promise<P2PAdvertisement> {
    const response = await this.httpClient.post<P2PAdvertisement>(
      '/v5/p2p/item/create',
      params
    );
    
    const ad = response.result;
    this.emitEvent('AD_CREATED', ad);
    return ad;
  }

  /**
   * Update advertisement
   */
  async updateAdvertisement(params: UpdateAdvertisementParams): Promise<P2PAdvertisement> {
    const response = await this.httpClient.post<P2PAdvertisement>(
      '/v5/p2p/item/update',
      params
    );
    
    const ad = response.result;
    this.emitEvent('AD_UPDATED', ad);
    return ad;
  }

  /**
   * Delete advertisement
   */
  async deleteAdvertisement(itemId: string): Promise<void> {
    await this.httpClient.post('/v5/p2p/item/cancel', { itemId });
    this.emitEvent('AD_DELETED', { itemId });
  }

  // ========== Order Methods ==========

  /**
   * Get all orders
   */
  async getOrders(filter?: OrderFilter, page: number = 1, pageSize: number = 20): Promise<PaginatedResponse<P2POrder>> {
    const response = await this.httpClient.post<PaginatedResponse<P2POrder>>(
      '/v5/p2p/order/simplifyList',
      { ...filter, page, pageSize }
    );
    return response.result;
  }

  /**
   * Get pending orders
   */
  async getPendingOrders(page: number = 1, pageSize: number = 20): Promise<PaginatedResponse<P2POrder>> {
    const response = await this.httpClient.post<PaginatedResponse<P2POrder>>(
      '/v5/p2p/order/pending/simplifyList',
      { page, pageSize }
    );
    return response.result;
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId: string): Promise<P2POrder> {
    const response = await this.httpClient.post<P2POrder>(
      '/v5/p2p/order/info',
      { orderId }
    );
    return response.result;
  }

  /**
   * Mark order as paid
   */
  async markOrderAsPaid(orderId: string): Promise<void> {
    await this.httpClient.post('/v5/p2p/order/pay', { orderId });
    this.emitEvent('ORDER_PAID', { orderId });
  }

  /**
   * Release assets (complete order)
   */
  async releaseAssets(orderId: string): Promise<void> {
    await this.httpClient.post('/v5/p2p/order/finish', { orderId });
    this.emitEvent('ORDER_RELEASED', { orderId });
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, reason?: string): Promise<void> {
    await this.httpClient.post('/v5/p2p/order/cancel', { orderId, reason });
    this.emitEvent('ORDER_CANCELLED', { orderId });
  }

  // ========== Chat Methods ==========

  /**
   * Get chat messages for order
   */
  async getChatMessages(orderId: string, page: number = 1, pageSize: number = 50): Promise<PaginatedResponse<ChatMessage>> {
    const response = await this.httpClient.post<PaginatedResponse<ChatMessage>>(
      '/v5/p2p/order/message/listpage',
      { orderId, page, pageSize }
    );
    return response.result;
  }

  /**
   * Send chat message
   */
  async sendChatMessage(params: SendMessageParams): Promise<ChatMessage> {
    const response = await this.httpClient.post<ChatMessage>(
      '/v5/p2p/order/message/send',
      params
    );
    
    const message = response.result;
    this.emitEvent('MESSAGE_RECEIVED', message);
    return message;
  }

  /**
   * Upload file to chat
   */
  async uploadFile(orderId: string, fileData: Buffer, fileName: string): Promise<any> {
    // Note: This would require multipart/form-data upload
    // Implementation depends on exact API requirements
    const response = await this.httpClient.post<any>(
      '/v5/p2p/order/file/upload',
      { orderId, fileData, fileName }
    );
    return response.result;
  }

  // ========== Payment Methods ==========

  /**
   * Get my payment methods
   */
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const response = await this.httpClient.post<PaymentMethod[]>(
      '/v5/p2p/user/payment/list',
      {}
    );
    return response.result;
  }

  /**
   * Add payment method
   */
  async addPaymentMethod(paymentMethod: Omit<PaymentMethod, 'id'>): Promise<PaymentMethod> {
    const response = await this.httpClient.post<PaymentMethod>(
      '/v5/p2p/payment/add',
      paymentMethod
    );
    return response.result;
  }

  /**
   * Update payment method
   */
  async updatePaymentMethod(paymentMethod: PaymentMethod): Promise<PaymentMethod> {
    const response = await this.httpClient.post<PaymentMethod>(
      '/v5/p2p/payment/update',
      paymentMethod
    );
    return response.result;
  }

  /**
   * Delete payment method
   */
  async deletePaymentMethod(paymentId: string): Promise<void> {
    await this.httpClient.post('/v5/p2p/payment/delete', { paymentId });
  }

  // ========== Polling Methods (WebSocket simulation) ==========

  /**
   * Start polling for order updates
   */
  startOrderPolling(intervalMs: number = 5000): void {
    if (this.pollingIntervals.has('orders')) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const orders = await this.getPendingOrders();
        for (const order of orders.list) {
          this.emit('orderUpdate', order);
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, intervalMs);

    this.pollingIntervals.set('orders', interval);
  }

  /**
   * Start polling for chat messages
   */
  startChatPolling(orderId: string, intervalMs: number = 3000): void {
    const key = `chat_${orderId}`;
    if (this.pollingIntervals.has(key)) {
      return;
    }

    let lastMessageId: string | null = null;

    const interval = setInterval(async () => {
      try {
        const messages = await this.getChatMessages(orderId);
        for (const message of messages.list) {
          if (!lastMessageId || message.messageId > lastMessageId) {
            this.emit('chatMessage', message);
            lastMessageId = message.messageId;
          }
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, intervalMs);

    this.pollingIntervals.set(key, interval);
  }

  /**
   * Stop polling for specific key
   */
  stopPolling(key: string): void {
    const interval = this.pollingIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(key);
    }
  }

  // ========== Helper Methods ==========

  /**
   * Emit P2P event
   */
  private emitEvent(type: P2PEventType, data: any): void {
    const event: P2PEvent = {
      type,
      accountId: this.config.apiKey,
      data,
      timestamp: Date.now(),
    };
    this.emit('p2pEvent', event);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.isConnected;
  }
}