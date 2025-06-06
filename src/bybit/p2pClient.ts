import { AccountManager } from "./accountManager";
import { TimeSyncManager } from "./utils/timeSync";
import type {
  P2PBalance,
  P2PUserInfo,
  CounterpartyUserInfo,
  UserPaymentMethod,
  P2POrder,
  P2POrderDetail,
  ChatMessage,
  ChatFile,
  P2PAdvertisement,
  AdDetail,
  CreateAdParams,
  UpdateAdParams,
  AdSearchParams,
  OrderListParams,
  P2PApiResponse,
  PagedResult,
} from "./types/p2p";

export class P2PClient {
  constructor(private accountManager: AccountManager) {}

  private async makeRequest<T>(
    accountId: string,
    method: string,
    endpoint: string,
    params: any = {},
  ): Promise<T> {
    const httpClient = this.accountManager.getHttpClient(accountId);
    if (!httpClient) {
      throw new Error(`Account ${accountId} not found`);
    }

    const account = this.accountManager.getAccount(accountId);
    await TimeSyncManager.syncServerTime(account?.isTestnet || false);

    const response = await httpClient.request(method, endpoint, params);

    // P2P endpoints use ret_code instead of retCode
    const code = response.retCode ?? response.ret_code;
    const msg = response.retMsg ?? response.ret_msg;

    if (code !== 0 && code !== "0") {
      throw new Error(`API Error ${code}: ${msg || "Unknown error"}`);
    }

    // Handle different response structures
    if (response.result !== undefined) {
      return response.result;
    } else if (response.data !== undefined) {
      return response.data;
    } else {
      // For P2P endpoints, the response might be the data itself
      const { ret_code, ret_msg, retCode, retMsg, ...data } = response;
      return data;
    }
  }

  // ==================== Balance Endpoints ====================

  async getAllBalances(accountId: string): Promise<P2PBalance[]> {
    const result = await this.makeRequest<any>(
      accountId,
      "GET",
      "/v5/asset/transfer/query-account-coins-balance",
      { accountType: "FUND" },
    );

    // Map the response to P2PBalance format based on actual structure
    if (result.balance && Array.isArray(result.balance)) {
      return result.balance.map((b: any) => ({
        coin: b.coin,
        free: b.transferBalance || b.walletBalance || "0",
        locked: "0", // not provided in this endpoint
        frozen: "0", // not provided in this endpoint
      }));
    }

    return [];
  }

  // ==================== User Info Endpoints ====================

  async getUserInfo(accountId: string): Promise<P2PUserInfo> {
    const response = await this.makeRequest<any>(
      accountId,
      "POST",
      "/v5/p2p/user/personal/info",
    );

    // P2P response might have the data nested differently
    if (response.user) {
      return response.user;
    } else if (response.userInfo) {
      return response.userInfo;
    }
    return response;
  }

  async getCounterpartyInfo(
    accountId: string,
    otherUserId: string,
  ): Promise<CounterpartyUserInfo> {
    return this.makeRequest<CounterpartyUserInfo>(
      accountId,
      "POST",
      "/v5/p2p/user/counterparty-user-info",
      { otherUserId },
    );
  }

  async getUserPaymentMethods(accountId: string): Promise<UserPaymentMethod[]> {
    const result = await this.makeRequest<{ list: UserPaymentMethod[] }>(
      accountId,
      "POST",
      "/v5/p2p/user/query-user-payment",
    );
    return result.list || [];
  }

  // ==================== Order Management Endpoints ====================

  async getOrders(
    accountId: string,
    params?: OrderListParams,
  ): Promise<PagedResult<P2POrder>> {
    const defaultParams = {
      page: 1,
      limit: 20,
      ...params,
    };

    return this.makeRequest<PagedResult<P2POrder>>(
      accountId,
      "POST",
      "/v5/p2p/order/simplifyList",
      defaultParams,
    );
  }

  async getOrderDetail(
    accountId: string,
    orderId: string,
  ): Promise<P2POrderDetail> {
    return this.makeRequest<P2POrderDetail>(
      accountId,
      "POST",
      "/v5/p2p/order/order-detail",
      { orderId },
    );
  }

  async getPendingOrders(accountId: string): Promise<P2POrder[]> {
    const result = await this.makeRequest<{ list: P2POrder[] }>(
      accountId,
      "POST",
      "/v5/p2p/order/pending-order",
    );
    return result.list || [];
  }

  async markOrderAsPaid(accountId: string, orderId: string): Promise<void> {
    await this.makeRequest(
      accountId,
      "POST",
      "/v5/p2p/order/mark-order-as-paid",
      { orderId },
    );
  }

  async releaseOrder(accountId: string, orderId: string): Promise<void> {
    await this.makeRequest(
      accountId,
      "POST",
      "/v5/p2p/order/release-digital-asset",
      { orderId },
    );
  }

  async cancelOrder(accountId: string, orderId: string): Promise<void> {
    await this.makeRequest(accountId, "POST", "/v5/p2p/order/cancel", {
      orderId,
    });
  }

  // ==================== Chat Endpoints ====================

  async sendChatMessage(
    accountId: string,
    orderId: string,
    message: string,
  ): Promise<void> {
    await this.makeRequest(accountId, "POST", "/v5/p2p/order/send-chat-msg", {
      orderId,
      msgType: "TEXT",
      message,
    });
  }

  async uploadChatFile(
    accountId: string,
    orderId: string,
    fileName: string,
    fileContent: string, // base64 encoded
  ): Promise<ChatFile> {
    return this.makeRequest<ChatFile>(
      accountId,
      "POST",
      "/v5/p2p/order/upload-chat-file",
      {
        orderId,
        fileName,
        fileContent,
      },
    );
  }

  async getChatMessages(
    accountId: string,
    orderId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<PagedResult<ChatMessage>> {
    return this.makeRequest<PagedResult<ChatMessage>>(
      accountId,
      "POST",
      "/v5/p2p/order/chat-msg",
      {
        orderId,
        page,
        limit,
      },
    );
  }

  // ==================== Advertisement Endpoints ====================

  async searchAds(
    accountId: string,
    params: AdSearchParams,
  ): Promise<PagedResult<P2PAdvertisement>> {
    const defaultParams = {
      page: 1,
      size: 10, // default page size
      ...params,
    };

    const response = await this.makeRequest<any>(
      accountId,
      "POST",
      "/v5/p2p/item/online",
      defaultParams,
    );

    // Response already contains items and count (makeRequest returns result)
    return {
      list: response.items || [],
      count: response.count || 0,
    };
  }

  async createAd(
    accountId: string,
    params: CreateAdParams,
  ): Promise<{ itemId: string; securityRiskToken?: string }> {
    return await this.makeRequest<{
      itemId: string;
      securityRiskToken?: string;
    }>(accountId, "POST", "/v5/p2p/item/create", params);
  }

  async deleteAd(accountId: string, itemId: string): Promise<void> {
    await this.makeRequest(accountId, "POST", "/v5/p2p/ad/remove", { itemId });
  }

  async updateAd(accountId: string, params: UpdateAdParams): Promise<void> {
    await this.makeRequest(accountId, "POST", "/v5/p2p/ad/update-list", params);
  }

  async getMyAds(
    accountId: string,
    tokenId?: string,
    fiat?: string,
  ): Promise<P2PAdvertisement[]> {
    const params: any = {};
    if (tokenId) params.tokenId = tokenId;
    if (fiat) params.fiat = fiat;

    try {
      const result = await this.makeRequest<{ list: P2PAdvertisement[] }>(
        accountId,
        "POST",
        "/v5/p2p/ad/ad-list",
        params,
      );
      return result.list || [];
    } catch (error: any) {
      // If the endpoint is not available, return empty array
      console.error("Error fetching my ads:", error.message);
      return [];
    }
  }

  async getAdDetail(accountId: string, itemId: string): Promise<AdDetail> {
    return this.makeRequest<AdDetail>(accountId, "POST", "/v5/p2p/item/info", {
      itemId,
    });
  }

  // ==================== Helper Methods ====================

  async getActiveAds(accountId: string): Promise<P2PAdvertisement[]> {
    const ads = await this.getMyAds(accountId);
    return ads.filter((ad) => ad.status === "1");
  }

  async hasActiveOrders(accountId: string): Promise<boolean> {
    const pendingOrders = await this.getPendingOrders(accountId);
    return pendingOrders.length > 0;
  }

  async getOrdersByStatus(
    accountId: string,
    status: string,
  ): Promise<P2POrder[]> {
    const result = await this.getOrders(accountId, { orderStatus: status });
    return result.list;
  }

  async getRecentMessages(
    accountId: string,
    orderId: string,
    count: number = 10,
  ): Promise<ChatMessage[]> {
    const result = await this.getChatMessages(accountId, orderId, 1, count);
    return result.list;
  }
}
