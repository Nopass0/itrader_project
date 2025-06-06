export interface BybitAccount {
  id: string;
  apiKey: string;
  apiSecret: string;
  isTestnet: boolean;
  label?: string;
}

export interface P2PBalance {
  coin: string;
  free: string;
  locked: string;
  frozen: string;
}

export interface PaymentMethod {
  id: string;
  type: 'Tinkoff' | 'SBP';
  accountName?: string;
  accountNumber?: string;
  bankName?: string;
  isActive: boolean;
}

export interface P2PAdvertisement {
  advId: string;
  accountId: string;
  coin: string;
  fiatCurrency: string;
  side: 'Buy' | 'Sell';
  price: string;
  minAmount: string;
  maxAmount: string;
  quantity: string;
  paymentMethods: PaymentMethod[];
  paymentPeriod: number;
  status: 'Active' | 'Inactive' | 'Completed';
  hasOrders: boolean;
  createdTime: string;
}

export interface P2POrder {
  orderId: string;
  advId: string;
  accountId: string;
  side: 'Buy' | 'Sell';
  price: string;
  quantity: string;
  amount: string;
  fiatCurrency: string;
  coin: string;
  status: 'Pending' | 'Processing' | 'Completed' | 'Cancelled' | 'Appeal';
  paymentMethod: PaymentMethod;
  createdTime: string;
  updatedTime: string;
}

export interface P2PMessage {
  messageId: string;
  orderId: string;
  senderId: string;
  content: string;
  timestamp: string;
  type: 'text' | 'image' | 'system';
}

export interface CreateAdvertisementParams {
  accountId: string;
  price: string;
  minTransactionAmount?: number;
}

export interface BybitApiResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
  retExtInfo?: Record<string, any>;
  time: number;
}

export interface AccountBalance {
  accountType: string;
  accountId: string;
  coin: Array<{
    coin: string;
    walletBalance: string;
    availableBalance: string;
    lockedBalance?: string;
  }>;
}