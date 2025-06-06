// P2P Balance types
export interface P2PBalance {
  coin: string;
  free: string;
  locked: string;
  frozen: string;
}

// User types
export interface P2PUserInfo {
  uid: string;
  nickName: string;
  isOnline: number;
  lastLoginTime: string;
  kycVerifyStatus: number;
  registerTime: string;
  isShowUid: number;
  isCounterparty: number;
  completedOrderCount: string;
  completedOrderRate: string;
  totalOrderCount: string;
  avgReleaseTime: string;
  avgPaymentTime: string;
  totalVolume: string;
  totalVolumeRank: number;
  likeCount: string;
  dislikeCount: string;
  likeRate: string;
  isBlockedByMe: number;
  isBlocked: number;
  recentOrderCount: string;
  recentExecuteRate: string;
  recentBuyCount: string;
  recentSellCount: string;
}

export interface CounterpartyUserInfo extends P2PUserInfo {
  paymentHistory: PaymentHistory[];
}

export interface PaymentHistory {
  payType: string;
  paymentCount: string;
  successRate: string;
}

// Payment Method types
export interface PaymentMethod {
  id: string;
  payType: string;
  account: string;
  bankName?: string;
  branchName?: string;
  qrCodeUrl?: string;
}

export interface UserPaymentMethod extends PaymentMethod {
  paymentDetailId: string;
  realName: string;
  createTime: string;
  updateTime: string;
}

// Order types
export interface P2POrder {
  orderId: string;
  itemId: string;
  userId: string;
  nickName: string;
  side: "0" | "1"; // 0: buy, 1: sell
  fiat: string;
  fiatSymbol: string;
  price: string;
  quantity: string;
  amount: string;
  fee: string;
  orderStatus: string;
  payMethods: PaymentMethod[];
  createTime: string;
  updateTime: string;
  paymentTime?: string;
  finishTime?: string;
  tokenId: string;
  tokenName: string;
  isOnline: number;
  lastSeen: string;
  makerContactTimeoutTime?: string;
  takerContactTimeoutTime?: string;
  isMaker: boolean;
  appealStatus?: string;
  appealFreezeTime?: string;
  timeToPayTime?: string;
  isShowUid: number;
}

export interface P2POrderDetail extends P2POrder {
  payments: PaymentDetail[];
  orderMemo?: string;
  riskLevel: number;
  makerUid: string;
  takerUid: string;
  makerNickName: string;
  takerNickName: string;
  takerKycStatus: number;
  makerKycStatus: number;
  makerIsOnline: number;
  takerIsOnline: number;
  makerLastSeen: string;
  takerLastSeen: string;
  isBlockedByMaker: number;
  isBlockedByTaker: number;
}

export interface PaymentDetail {
  id: string;
  payType: string;
  account: string;
  bankName?: string;
  branchName?: string;
  qrCodeUrl?: string;
  realName: string;
}

// Chat types
export interface ChatMessage {
  id: string;
  orderId: string;
  userId: string;
  otherUserId: string;
  msgType: string; // TEXT, IMAGE, FILE
  message: string;
  fileName?: string;
  fileSize?: string;
  extend?: any;
  createTime: string;
}

export interface ChatFile {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

// Advertisement types
export interface P2PAdvertisement {
  id: string;
  accountId: string;
  userId: string;
  nickName: string;
  tokenId: string;
  tokenName: string;
  fiat: string;
  fiatSymbol: string;
  side: "0" | "1"; // 0: buy, 1: sell
  priceType: "1" | "2"; // 1: fixed, 2: floating
  floatingRate?: string;
  price: string;
  quantity: string;
  minAmount: string;
  maxAmount: string;
  payTimeLimit: number;
  payments: string[];
  createTime: string;
  updateTime: string;
  status: "1" | "2"; // 1: online, 2: offline
  copyFrom?: string;
  nextAutoRepostTime?: string;
  lastQuantity: string;
  frozen: string;
  executedQuantity: string;
  remark?: string;
  isOnline: number;
  lastSeen: string;
  completedOrderCount: string;
  completedRate: string;
  avgReleaseTime: string;
  avgPaymentTime: string;
  isKycVerified: number;
  totalVolume: string;
  totalVolumeRank: number;
  recentOrderCount: string;
  recentExecuteRate: string;
  isBlockedByMe: number;
  isBlocked: number;
}

export interface AdDetail extends P2PAdvertisement {
  tradeMethods: PaymentMethod[];
  makerFee: string;
  takerFee: string;
}

export interface CreateAdParams {
  tokenId: string;
  currencyId: string;
  side: "0" | "1"; // 0: buy, 1: sell
  priceType: "0" | "1"; // 0: fixed rate, 1: floating rate
  premium?: string; // for floating rate
  price: string;
  minAmount: string;
  maxAmount: string;
  remark: string;
  tradingPreferenceSet: {
    autoBuyFlag?: boolean;
    autoSellFlag?: boolean;
    paymentPeriod?: number;
    registerDays?: number;
    kycVerifyLevel?: number;
    completedOrderCount?: number;
    completeRatePercent?: number;
    isFilterBlockedUser?: boolean;
  };
  paymentIds: string[]; // payment method IDs
  quantity: string;
  paymentPeriod: string; // in minutes
  itemType: "ORIGIN" | "BULK";
}

export interface UpdateAdParams {
  itemId: string;
  priceType?: "1" | "2";
  price?: string;
  floatingRate?: string;
  quantity?: string;
  minAmount?: string;
  maxAmount?: string;
  payTimeLimit?: number;
  payments?: string[];
  remarks?: string;
  autoRepost?: 0 | 1;
  status?: "1" | "2";
}

// Search/Filter types
export interface AdSearchParams {
  tokenId: string;
  currencyId: string; // was 'fiat'
  side: "0" | "1"; // 0: buy, 1: sell (required)
  page?: number;
  size?: number; // was 'limit'
}

export interface OrderListParams {
  side?: "0" | "1";
  orderStatus?: string;
  beginTime?: number;
  endTime?: number;
  page?: number;
  limit?: number;
}

// Response types
export interface P2PApiResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
  time: number;
}

export interface PagedResult<T> {
  list: T[];
  count: number;
}