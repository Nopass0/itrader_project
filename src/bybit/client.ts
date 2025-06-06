import { AccountManager } from "./accountManager";
import { P2PClient } from "./p2pClient";
import type { BybitAccount, AccountBalance } from "./types/models";
import type {
  P2PBalance,
  P2PUserInfo,
  CounterpartyUserInfo,
  UserPaymentMethod,
  P2POrder,
  P2POrderDetail,
  ChatMessage,
  P2PAdvertisement,
  AdDetail,
  CreateAdParams,
  UpdateAdParams,
  AdSearchParams,
  OrderListParams,
  PagedResult,
} from "./types/p2p";

export class BybitClient {
  private accountManager: AccountManager;
  private p2p: P2PClient;

  constructor() {
    this.accountManager = new AccountManager();
    this.p2p = new P2PClient(this.accountManager);
  }

  async addAccount(
    apiKey: string,
    apiSecret: string,
    isTestnet: boolean = false,
    label?: string,
  ): Promise<string> {
    return this.accountManager.addAccount(apiKey, apiSecret, isTestnet, label);
  }

  removeAccount(accountId: string): boolean {
    return this.accountManager.removeAccount(accountId);
  }

  getAccount(accountId: string): BybitAccount | undefined {
    return this.accountManager.getAccount(accountId);
  }

  getAllAccounts(): BybitAccount[] {
    return this.accountManager.getAllAccounts();
  }

  async getAccountBalances(accountId: string): Promise<AccountBalance[]> {
    return this.accountManager.getAccountBalances(accountId);
  }

  async getAllBalances(): Promise<Map<string, AccountBalance[]>> {
    return this.accountManager.getAllBalances();
  }

  // ==================== P2P Balance ====================
  
  async getP2PBalances(accountId: string): Promise<P2PBalance[]> {
    return this.p2p.getAllBalances(accountId);
  }

  // ==================== P2P User Info ====================
  
  async getP2PUserInfo(accountId: string): Promise<P2PUserInfo> {
    return this.p2p.getUserInfo(accountId);
  }

  async getCounterpartyInfo(
    accountId: string,
    originalUid: string,
    orderId: string,
  ): Promise<CounterpartyUserInfo> {
    return this.p2p.getCounterpartyInfo(accountId, originalUid, orderId);
  }

  async getP2PPaymentMethods(accountId: string): Promise<UserPaymentMethod[]> {
    return this.p2p.getUserPaymentMethods(accountId);
  }

  // ==================== P2P Orders ====================
  
  async getP2POrders(
    accountId: string,
    params?: OrderListParams,
  ): Promise<PagedResult<P2POrder>> {
    return this.p2p.getOrders(accountId, params);
  }

  async getP2POrderDetail(
    accountId: string,
    orderId: string,
  ): Promise<P2POrderDetail> {
    return this.p2p.getOrderDetail(accountId, orderId);
  }

  async getPendingP2POrders(accountId: string): Promise<P2POrder[]> {
    return this.p2p.getPendingOrders(accountId);
  }

  async getP2PPendingOrders(accountId: string): Promise<P2POrder[]> {
    return this.p2p.getPendingOrders(accountId);
  }

  async markP2POrderAsPaid(
    accountId: string,
    orderId: string,
    paymentType: string,
    paymentId: string,
  ): Promise<void> {
    return this.p2p.markOrderAsPaid(accountId, orderId, paymentType, paymentId);
  }

  async releaseP2POrder(accountId: string, orderId: string): Promise<void> {
    return this.p2p.releaseOrder(accountId, orderId);
  }

  async cancelP2POrder(accountId: string, orderId: string): Promise<void> {
    return this.p2p.cancelOrder(accountId, orderId);
  }

  // ==================== P2P Chat ====================
  
  async sendP2PChatMessage(
    accountId: string,
    orderId: string,
    message: string,
    contentType?: string,
    msgUuid?: string,
    fileName?: string,
  ): Promise<void> {
    return this.p2p.sendChatMessage(
      accountId,
      orderId,
      message,
      contentType,
      msgUuid,
      fileName,
    );
  }

  async getP2PChatMessages(
    accountId: string,
    orderId: string,
    page?: number,
    limit?: number,
  ): Promise<PagedResult<ChatMessage>> {
    return this.p2p.getChatMessages(accountId, orderId, page, limit);
  }

  // ==================== P2P Advertisements ====================
  
  async searchP2PAds(
    accountId: string,
    params: AdSearchParams,
  ): Promise<PagedResult<P2PAdvertisement>> {
    return this.p2p.searchAds(accountId, params);
  }

  async createP2PAd(
    accountId: string,
    params: CreateAdParams,
  ): Promise<{ itemId: string }> {
    return this.p2p.createAd(accountId, params);
  }

  async deleteP2PAd(accountId: string, itemId: string): Promise<void> {
    return this.p2p.deleteAd(accountId, itemId);
  }

  async updateP2PAd(
    accountId: string,
    params: UpdateAdParams,
  ): Promise<void> {
    return this.p2p.updateAd(accountId, params);
  }

  async getMyP2PAds(
    accountId: string,
    tokenId?: string,
    fiat?: string,
  ): Promise<P2PAdvertisement[]> {
    return this.p2p.getMyAds(accountId, tokenId, fiat);
  }

  async getP2PMyAds(
    accountId: string,
    tokenId?: string,
    fiat?: string,
  ): Promise<P2PAdvertisement[]> {
    return this.p2p.getMyAds(accountId, tokenId, fiat);
  }

  async getP2PAdDetail(accountId: string, itemId: string): Promise<AdDetail> {
    return this.p2p.getAdDetail(accountId, itemId);
  }

  // ==================== Helper Methods ====================
  
  async getActiveP2PAds(accountId: string): Promise<P2PAdvertisement[]> {
    return this.p2p.getActiveAds(accountId);
  }

  async hasActiveP2POrders(accountId: string): Promise<boolean> {
    return this.p2p.hasActiveOrders(accountId);
  }

  async getAllP2PBalances(): Promise<Map<string, P2PBalance[]>> {
    const allBalances = new Map<string, P2PBalance[]>();
    const accounts = this.getAllAccounts();

    for (const account of accounts) {
      try {
        const balances = await this.getP2PBalances(account.id);
        allBalances.set(account.id, balances);
      } catch (error) {
        console.error(
          `Failed to get P2P balances for account ${account.id}:`,
          error,
        );
        allBalances.set(account.id, []);
      }
    }

    return allBalances;
  }

  getAccountCount(): number {
    return this.getAllAccounts().length;
  }

  hasAccount(accountId: string): boolean {
    return this.getAccount(accountId) !== undefined;
  }
}
