/**
 * Bybit P2P API Types
 * Complete type definitions for P2P functionality
 */

export interface P2PConfig {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
  recvWindow?: number;
  debugMode?: boolean;
}

export interface P2PAccount {
  id: string;
  config: P2PConfig;
  isActive: boolean;
  lastSync?: Date;
}

// Advertisement Types
export interface P2PAdvertisement {
  id: string;
  side: 'BUY' | 'SELL';
  asset: string;
  fiatCurrency: string;
  price: string;
  quantity: string;
  minOrderAmount: string;
  maxOrderAmount: string;
  paymentMethods: PaymentMethod[];
  remarks?: string;
  status: 'ONLINE' | 'OFFLINE' | 'DELETED';
  createTime: number;
  updateTime: number;
}

export interface CreateAdvertisementParams {
  side: 'BUY' | 'SELL';
  asset: string;
  fiatCurrency: string;
  priceType: 'FIXED' | 'FLOAT';
  price?: string;
  floatRate?: number;
  quantity: string;
  minOrderAmount: string;
  maxOrderAmount: string;
  paymentIds: string[];
  remarks?: string;
  autoReply?: string;
  targetUserId?: string;
}

export interface UpdateAdvertisementParams {
  itemId: string;
  price?: string;
  quantity?: string;
  minOrderAmount?: string;
  maxOrderAmount?: string;
  remarks?: string;
  autoReply?: string;
  status?: 'ONLINE' | 'OFFLINE';
}

// Order Types
export interface P2POrder {
  orderId: string;
  itemId: string;
  side: 'BUY' | 'SELL';
  asset: string;
  fiatCurrency: string;
  price: string;
  quantity: string;
  totalAmount: string;
  status: OrderStatus;
  createTime: number;
  updateTime: number;
  paymentInfo?: PaymentInfo;
  counterparty: CounterpartyInfo;
}

export type OrderStatus = 
  | 'CREATED'
  | 'PAID'
  | 'RELEASED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'APPEAL';

export interface CounterpartyInfo {
  userId: string;
  nickname: string;
  level: number;
  completedOrders: number;
  completionRate: number;
}

export interface PaymentInfo {
  method: string;
  account: string;
  accountName: string;
  qrCode?: string;
}

// Chat Types
export interface ChatMessage {
  messageId: string;
  orderId: string;
  senderId: string;
  content: string;
  type: 'TEXT' | 'IMAGE' | 'FILE';
  timestamp: number;
  isRead: boolean;
  fileInfo?: FileInfo;
}

export interface FileInfo {
  fileName: string;
  fileSize: number;
  fileUrl: string;
  fileType: string;
}

export interface SendMessageParams {
  orderId: string;
  message: string;
  messageType?: 'TEXT' | 'IMAGE' | 'FILE';
  fileData?: Buffer;
  fileName?: string;
}

// Payment Method Types
export interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  account: string;
  accountName: string;
  bankName?: string;
  qrCode?: string;
  isEnabled: boolean;
}

export type PaymentMethodType = 
  | 'BANK_TRANSFER'
  | 'ALIPAY'
  | 'WECHAT_PAY'
  | 'PAYPAL'
  | 'WISE'
  | 'PERFECT_MONEY'
  | 'OTHER';

// API Response Types
export interface ApiResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
  retExtInfo: Record<string, any>;
  time: number;
}

export interface PaginatedResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Event Types
export interface P2PEvent {
  type: P2PEventType;
  accountId: string;
  data: any;
  timestamp: number;
}

export type P2PEventType = 
  | 'AD_CREATED'
  | 'AD_UPDATED'
  | 'AD_DELETED'
  | 'ORDER_CREATED'
  | 'ORDER_PAID'
  | 'ORDER_RELEASED'
  | 'ORDER_COMPLETED'
  | 'ORDER_CANCELLED'
  | 'ORDER_APPEAL'
  | 'MESSAGE_RECEIVED'
  | 'CONNECTION_STATUS';

// Filter Types
export interface AdvertisementFilter {
  asset?: string;
  fiatCurrency?: string;
  side?: 'BUY' | 'SELL';
  paymentMethod?: string;
  minPrice?: string;
  maxPrice?: string;
  status?: 'ONLINE' | 'OFFLINE';
}

export interface OrderFilter {
  status?: OrderStatus | OrderStatus[];
  asset?: string;
  fiatCurrency?: string;
  side?: 'BUY' | 'SELL';
  startTime?: number;
  endTime?: number;
}

// Error Types
export interface P2PError extends Error {
  code: string;
  retCode?: number;
  details?: any;
}