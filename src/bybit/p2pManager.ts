import { RestClientV5 } from "bybit-api";
import type {
  P2PAdvertisement,
  P2POrder,
  PaymentMethod,
  CreateAdvertisementParams,
  P2PBalance,
  P2PMessage,
} from "./types/models";
import { AccountManager } from "./accountManager";
import Decimal from "decimal.js";
import { TimeSyncManager } from "./utils/timeSync";

export class P2PManager {
  constructor(private accountManager: AccountManager) {}

  async getP2PBalance(accountId: string): Promise<P2PBalance[]> {
    const httpClient = this.accountManager.getHttpClient(accountId);
    if (!httpClient) {
      throw new Error(`Account ${accountId} not found`);
    }

    // Get account to check if testnet
    const account = this.accountManager.getAccount(accountId);
    await TimeSyncManager.syncServerTime(account?.isTestnet || false);

    try {
      // Use the correct endpoint for getting coin balance
      const response = await httpClient.request("GET", "/v5/asset/transfer/query-account-coins-balance", {
        accountType: "FUND", // P2P uses FUND account type
        withBonus: "0"
      });

      if (response.ret_code !== 0) {
        throw new Error(`Failed to get balance: ${response.ret_msg}`);
      }

      // Handle response structure for P2P balance
      const balances = response.result.balance || [];
      return balances.map((balance: any) => ({
        coin: balance.coin,
        free: balance.transferBalance || balance.walletBalance || "0",
        locked: "0", // Not provided in P2P balance
        frozen: "0", // Not provided in P2P balance
      }));
    } catch (error) {
      throw new Error(`Failed to get P2P balance: ${error}`);
    }
  }

  async getAccountInfo(accountId: string): Promise<any> {
    const httpClient = this.accountManager.getHttpClient(accountId);
    if (!httpClient) {
      throw new Error(`Account ${accountId} not found`);
    }

    try {
      // Get P2P account information
      const response = await httpClient.request("POST", "/v5/p2p/user/personal/info", {});

      if (response.ret_code !== 0) {
        throw new Error(`Failed to get account info: ${response.ret_msg}`);
      }

      return response.result;
    } catch (error) {
      throw new Error(`Failed to get account info: ${error}`);
    }
  }

  async getActiveAdvertisements(
    accountId: string,
  ): Promise<P2PAdvertisement[]> {
    const httpClient = this.accountManager.getHttpClient(accountId);
    if (!httpClient) {
      throw new Error(`Account ${accountId} not found`);
    }

    try {
      // Get online ads - using the correct P2P endpoint
      const response = await httpClient.request("POST", "/v5/p2p/item/online", {
        tokenId: "USDT",
        currencyId: "RUB",
        side: "0", // 0 for buy ads, 1 for sell ads
        page: "1",
        size: "50"
      });

      if (response.ret_code !== 0) {
        throw new Error(`Failed to get advertisements: ${response.ret_msg}`);
      }

      const ads: P2PAdvertisement[] =
        response.result.items?.map((item: any) => ({
          advId: item.id,
          accountId,
          coin: item.tokenId,
          fiatCurrency: item.currencyId,
          side: item.side === 1 || item.side === "1" ? "Sell" : "Buy",
          price: item.price,
          minAmount: item.minAmount,
          maxAmount: item.maxAmount,
          quantity: item.lastQuantity,
          paymentMethods: this.parsePaymentMethods(item.payments),
          paymentPeriod: parseInt(item.paymentPeriod),
          status: item.status === 10 ? "Active" : "Inactive",
          hasOrders: false,
          createdTime: item.createDate,
        })) || [];

      for (const ad of ads) {
        ad.hasOrders = await this.checkAdvertisementHasOrders(
          accountId,
          ad.advId,
        );
      }

      return ads;
    } catch (error) {
      throw new Error(`Failed to get advertisements: ${error}`);
    }
  }

  async getPaymentMethods(accountId: string): Promise<PaymentMethod[]> {
    const httpClient = this.accountManager.getHttpClient(accountId);
    if (!httpClient) {
      throw new Error(`Account ${accountId} not found`);
    }

    try {
      // Get user payment methods - using the correct P2P endpoint
      const response = await httpClient.request("POST", "/v5/p2p/user/personal/payment", {});

      if (response.ret_code !== 0) {
        throw new Error(`Failed to get payment methods: ${response.ret_msg}`);
      }

      return (
        response.result?.items?.map((item: any) => ({
          id: item.id,
          type: item.paymentType === "75" ? "Tinkoff" : "SBP",
          accountName: item.accountName,
          accountNumber: item.account,
          bankName: item.bankName,
          isActive: item.status === "1",
        })) || []
      );
    } catch (error) {
      throw new Error(`Failed to get payment methods: ${error}`);
    }
  }

  async checkAdvertisementHasOrders(
    accountId: string,
    advId: string,
  ): Promise<boolean> {
    const httpClient = this.accountManager.getHttpClient(accountId);
    if (!httpClient) {
      throw new Error(`Account ${accountId} not found`);
    }

    try {
      // Check orders for the advertisement - using the correct P2P endpoint
      const response = await httpClient.request("POST", "/v5/p2p/order/simplifyList", {
        page: 1,
        size: 100,
        status: null // Get all statuses
      });

      if (response.ret_code !== 0) {
        return false;
      }

      // Filter orders for this specific advertisement ID
      const ordersForAd = response.result.items?.filter((order: any) => 
        order.itemId === advId && 
        (order.status === 10 || order.status === 20 || order.status === 30)
      ) || [];

      return ordersForAd.length > 0;
    } catch (error) {
      console.error(
        `Failed to check orders for advertisement ${advId}:`,
        error,
      );
      return false;
    }
  }

  async createSellAdvertisement(
    params: CreateAdvertisementParams,
  ): Promise<P2PAdvertisement> {
    const { accountId, price, minTransactionAmount = 15000 } = params;

    const client = this.accountManager.getClient(accountId);
    if (!client) {
      throw new Error(`Account ${accountId} not found`);
    }

    const activeAds = await this.getActiveAdvertisements(accountId);
    const activeCount = activeAds.filter((ad) => ad.status === "Active").length;

    if (activeCount >= 2) {
      throw new Error(
        "Cannot create more than 2 active advertisements per account",
      );
    }

    const paymentMethod = await this.selectPaymentMethod(accountId, activeAds);
    if (!paymentMethod) {
      throw new Error("No available payment method");
    }

    const priceDecimal = new Decimal(price);
    const minAmountDecimal = new Decimal(minTransactionAmount);
    const totalQuantity = minAmountDecimal.div(priceDecimal).plus(5).toFixed(2);

    try {
      const httpClient = this.accountManager.getHttpClient(accountId);
      if (!httpClient) {
        throw new Error(`Account ${accountId} not found`);
      }
      // Create new ad - using the correct P2P endpoint
      const response = await httpClient.request("POST", "/v5/p2p/ad/post-new", {
        tokenId: "USDT",
        currencyId: "RUB",
        side: "1", // 1 for sell
        priceType: "1",
        price: price,
        quantity: totalQuantity,
        minAmount: minTransactionAmount.toString(),
        maxAmount: minTransactionAmount.toString(),
        paymentPeriod: "15",
        payments: [paymentMethod.id],
        remarks: "",
      });

      if (response.ret_code !== 0) {
        throw new Error(`Failed to create advertisement: ${response.ret_msg}`);
      }

      return {
        advId: response.result.id,
        accountId,
        coin: "USDT",
        fiatCurrency: "RUB",
        side: "Sell",
        price: price,
        minAmount: minTransactionAmount.toString(),
        maxAmount: minTransactionAmount.toString(),
        quantity: totalQuantity,
        paymentMethods: [paymentMethod],
        paymentPeriod: 15,
        status: "Active",
        hasOrders: false,
        createdTime: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to create advertisement: ${error}`);
    }
  }

  async getOrders(accountId: string, status?: string): Promise<P2POrder[]> {
    const httpClient = this.accountManager.getHttpClient(accountId);
    if (!httpClient) {
      throw new Error(`Account ${accountId} not found`);
    }

    try {
      // Get orders - using the correct P2P endpoint
      const response = await httpClient.request("POST", "/v5/p2p/order/simplifyList", {
        page: 1,
        size: 50,
        status: status ? parseInt(status) : null
      });

      if (response.ret_code !== 0) {
        throw new Error(`Failed to get orders: ${response.ret_msg}`);
      }

      return (
        response.result.items?.map((item: any) => ({
          orderId: item.id,
          advId: item.itemId,
          accountId,
          side: item.side === "1" ? "Sell" : "Buy",
          price: item.price,
          quantity: item.quantity,
          amount: item.amount,
          fiatCurrency: item.currencyId,
          coin: item.tokenId,
          status: this.mapOrderStatus(item.orderStatus),
          paymentMethod: this.parsePaymentMethod(item.payment),
          createdTime: item.createDate,
          updatedTime: item.updateDate,
        })) || []
      );
    } catch (error) {
      throw new Error(`Failed to get orders: ${error}`);
    }
  }

  async getOrderMessages(
    accountId: string,
    orderId: string,
  ): Promise<P2PMessage[]> {
    const httpClient = this.accountManager.getHttpClient(accountId);
    if (!httpClient) {
      throw new Error(`Account ${accountId} not found`);
    }

    try {
      // Get chat messages - using the correct P2P endpoint
      const response = await httpClient.request(
        "POST",
        "/v5/p2p/order/chat-msg",
        {
          orderId: orderId,
          page: 1,
          size: 100
        },
      );

      if (response.ret_code !== 0) {
        throw new Error(`Failed to get messages: ${response.ret_msg}`);
      }

      return (
        response.result.items?.map((item: any) => ({
          messageId: item.id,
          orderId: orderId,
          senderId: item.sendUserId,
          content: item.message,
          timestamp: item.createDate,
          type:
            item.msgType === "1"
              ? "text"
              : item.msgType === "2"
                ? "image"
                : "system",
        })) || []
      );
    } catch (error) {
      throw new Error(`Failed to get messages: ${error}`);
    }
  }

  async sendOrderMessage(
    accountId: string,
    orderId: string,
    message: string,
  ): Promise<void> {
    const httpClient = this.accountManager.getHttpClient(accountId);
    if (!httpClient) {
      throw new Error(`Account ${accountId} not found`);
    }

    try {
      // Send chat message - using the correct P2P endpoint
      const response = await httpClient.request(
        "POST",
        "/v5/p2p/order/send-chat-msg",
        {
          orderId: orderId,
          message: message,
          msgType: "1", // 1 for text message
        },
      );

      if (response.ret_code !== 0) {
        throw new Error(`Failed to send message: ${response.ret_msg}`);
      }
    } catch (error) {
      throw new Error(`Failed to send message: ${error}`);
    }
  }

  async releaseOrder(accountId: string, orderId: string): Promise<void> {
    const httpClient = this.accountManager.getHttpClient(accountId);
    if (!httpClient) {
      throw new Error(`Account ${accountId} not found`);
    }

    try {
      // Release order - using the correct P2P endpoint
      const response = await httpClient.request("POST", "/v5/p2p/order/release-digital-asset", {
        orderId: orderId,
      });

      if (response.ret_code !== 0) {
        throw new Error(`Failed to release order: ${response.ret_msg}`);
      }
    } catch (error) {
      throw new Error(`Failed to release order: ${error}`);
    }
  }

  private async selectPaymentMethod(
    accountId: string,
    activeAds: P2PAdvertisement[],
  ): Promise<PaymentMethod | null> {
    const allMethods = await this.getPaymentMethods(accountId);
    const activeMethods = allMethods.filter(
      (m) => m.isActive && (m.type === "Tinkoff" || m.type === "SBP"),
    );

    if (activeMethods.length === 0) {
      return null;
    }

    const activeAdWithoutOrders = activeAds.find(
      (ad) => ad.status === "Active" && !ad.hasOrders,
    );

    if (activeAdWithoutOrders) {
      const usedMethod = activeAdWithoutOrders.paymentMethods[0];
      const alternativeMethod = activeMethods.find(
        (m) => m.type !== usedMethod.type,
      );
      return alternativeMethod || null;
    }

    const tinkoffMethod = activeMethods.find((m) => m.type === "Tinkoff");
    const sbpMethod = activeMethods.find((m) => m.type === "SBP");

    const lastUsedTinkoff = activeAds.find((ad) =>
      ad.paymentMethods.some((pm) => pm.type === "Tinkoff"),
    );
    const lastUsedSBP = activeAds.find((ad) =>
      ad.paymentMethods.some((pm) => pm.type === "SBP"),
    );

    if (!lastUsedTinkoff && tinkoffMethod) return tinkoffMethod;
    if (!lastUsedSBP && sbpMethod) return sbpMethod;

    if (lastUsedTinkoff && lastUsedSBP) {
      const tinkoffTime = new Date(lastUsedTinkoff.createdTime).getTime();
      const sbpTime = new Date(lastUsedSBP.createdTime).getTime();
      return tinkoffTime > sbpTime ? sbpMethod : tinkoffMethod;
    }

    return tinkoffMethod || sbpMethod || null;
  }

  private parsePaymentMethods(payments: any[]): PaymentMethod[] {
    if (!payments) return [];

    return payments.map((p) => ({
      id: p.id,
      type: p.paymentType === "75" ? ("Tinkoff" as const) : ("SBP" as const),
      accountName: p.accountName,
      accountNumber: p.account,
      bankName: p.bankName,
      isActive: true,
    }));
  }

  private parsePaymentMethod(payment: any): PaymentMethod {
    return {
      id: payment.id,
      type: payment.paymentType === "75" ? "Tinkoff" : "SBP",
      accountName: payment.accountName,
      accountNumber: payment.account,
      bankName: payment.bankName,
      isActive: true,
    };
  }

  private mapOrderStatus(status: string): P2POrder["status"] {
    const statusMap: Record<string, P2POrder["status"]> = {
      "10": "Pending",
      "20": "Processing",
      "30": "Processing",
      "40": "Completed",
      "50": "Cancelled",
      "60": "Appeal",
    };
    return statusMap[status] || "Pending";
  }
}
