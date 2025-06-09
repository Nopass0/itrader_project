import { 
  PrismaClient, 
  type Payout,
  type BybitAdvertisement,
  type Transaction,
  type ChatMessage,
  type GateAccount,
  type BybitAccount,
  type GmailAccount,
  type BlacklistedTransaction,
  type SystemSettings
} from "../../generated/prisma";

interface GatePayoutData {
  id: number;
  payment_method_id: number;
  wallet: string;
  amount: {
    trader: Record<string, number>;
  };
  total: {
    trader: Record<string, number>;
  };
  status: number;
  approved_at: string | null;
  expired_at: string | null;
  created_at: string;
  updated_at: string;
  meta: any;
  method: any;
  attachments: any[];
  tooltip: any;
  bank: any;
  trader: any;
}

class DatabaseClient {
  private prisma: PrismaClient;
  private maxRetries = 3;
  private retryDelay = 1000;

  constructor() {
    this.prisma = new PrismaClient({
      log: ["error", "warn"],
    });
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.error(
          `${operationName} failed (attempt ${attempt}/${this.maxRetries}):`,
          error,
        );

        if (attempt < this.maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelay * attempt),
          );
        }
      }
    }

    throw new Error(
      `${operationName} failed after ${this.maxRetries} attempts: ${lastError?.message}`,
    );
  }

  async connect(): Promise<void> {
    await this.executeWithRetry(
      async () => await this.prisma.$connect(),
      "Database connection",
    );
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  // ========== Payout Methods ==========

  async getPayoutByGatePayoutId(gatePayoutId: number): Promise<Payout | null> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.payout.findUnique({
        where: { gatePayoutId },
      });
    }, "Get payout by Gate payout ID");
  }

  async upsertPayoutFromGate(
    gatePayoutData: GatePayoutData,
    gateAccount: string,
  ): Promise<Payout> {
    return await this.executeWithRetry(async () => {
      // Handle empty amount arrays for pending transactions
      const amountTrader = Array.isArray(gatePayoutData.amount) && gatePayoutData.amount.length === 0 
        ? {} 
        : (gatePayoutData.amount?.trader || {});
      
      const totalTrader = Array.isArray(gatePayoutData.total) && gatePayoutData.total.length === 0 
        ? {} 
        : (gatePayoutData.total?.trader || {});

      return await this.prisma.payout.upsert({
        where: { gatePayoutId: gatePayoutData.id },
        update: {
          paymentMethodId: gatePayoutData.payment_method_id,
          wallet: gatePayoutData.wallet,
          amountTrader,
          totalTrader,
          status: gatePayoutData.status,
          approvedAt: gatePayoutData.approved_at ? new Date(gatePayoutData.approved_at) : null,
          expiredAt: gatePayoutData.expired_at ? new Date(gatePayoutData.expired_at) : null,
          updatedAt: new Date(gatePayoutData.updated_at),
          meta: gatePayoutData.meta,
          method: gatePayoutData.method,
          attachments: gatePayoutData.attachments,
          tooltip: gatePayoutData.tooltip,
          bank: gatePayoutData.bank,
          trader: gatePayoutData.trader,
          gateAccount,
        },
        create: {
          gatePayoutId: gatePayoutData.id,
          paymentMethodId: gatePayoutData.payment_method_id,
          wallet: gatePayoutData.wallet,
          amountTrader,
          totalTrader,
          status: gatePayoutData.status,
          approvedAt: gatePayoutData.approved_at ? new Date(gatePayoutData.approved_at) : null,
          expiredAt: gatePayoutData.expired_at ? new Date(gatePayoutData.expired_at) : null,
          createdAt: new Date(gatePayoutData.created_at),
          updatedAt: new Date(gatePayoutData.updated_at),
          meta: gatePayoutData.meta,
          method: gatePayoutData.method,
          attachments: gatePayoutData.attachments,
          tooltip: gatePayoutData.tooltip,
          bank: gatePayoutData.bank,
          trader: gatePayoutData.trader,
          gateAccount,
        },
      });
    }, "Upsert payout");
  }

  async getPayoutsByStatus(status: number): Promise<Payout[]> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.payout.findMany({
        where: { status },
        orderBy: { createdAt: "desc" },
      });
    }, "Get payouts by status");
  }

  async getPayoutsWithoutTransaction(status: number): Promise<Payout[]> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.payout.findMany({
        where: { 
          status,
          transaction: null
        },
        orderBy: { createdAt: "asc" },
      });
    }, "Get payouts without transaction");
  }

  // ========== Advertisement Methods ==========

  async createAdvertisement(data: {
    bybitAdId: string;
    bybitAccountId: string;
    side: string;
    asset: string;
    fiatCurrency: string;
    price: string;
    quantity: string;
    minOrderAmount: string;
    maxOrderAmount: string;
    paymentMethod: string;
    status: string;
  }): Promise<BybitAdvertisement> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.bybitAdvertisement.create({
        data,
      });
    }, "Create advertisement");
  }

  async updateAdvertisement(
    id: string,
    data: Partial<BybitAdvertisement>,
  ): Promise<BybitAdvertisement> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.bybitAdvertisement.update({
        where: { id },
        data,
      });
    }, "Update advertisement");
  }

  async getActiveAdvertisementsByAccount(
    bybitAccountId: string,
  ): Promise<BybitAdvertisement[]> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.bybitAdvertisement.findMany({
        where: {
          bybitAccountId,
          status: "ONLINE",
        },
      });
    }, "Get active advertisements by account");
  }

  async countActiveAdvertisementsByAccount(
    bybitAccountId: string,
  ): Promise<number> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.bybitAdvertisement.count({
        where: {
          bybitAccountId,
          status: "ONLINE",
        },
      });
    }, "Count active advertisements");
  }

  // ========== Transaction Methods ==========

  async createTransaction(data: {
    payoutId: string;
    advertisementId: string;
    status: string;
  }): Promise<Transaction> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.transaction.create({
        data,
      });
    }, "Create transaction");
  }

  async updateTransaction(
    id: string,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.transaction.update({
        where: { id },
        data,
      });
    }, "Update transaction");
  }

  async getActiveTransactions(): Promise<Transaction[]> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.transaction.findMany({
        where: {
          status: {
            notIn: ["completed", "failed", "blacklisted"],
          },
        },
        include: {
          payout: true,
          advertisement: true,
          chatMessages: true,
        },
      });
    }, "Get active transactions");
  }

  async getTransactionWithDetails(id: string): Promise<Transaction | null> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.transaction.findUnique({
        where: { id },
        include: {
          payout: true,
          advertisement: true,
          chatMessages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }, "Get transaction with details");
  }

  async getTransactionByOrderId(orderId: string): Promise<Transaction | null> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.transaction.findFirst({
        where: { orderId },
        include: {
          payout: true,
          advertisement: true,
        },
      });
    }, "Get transaction by order ID");
  }

  async getSuccessfulTransactionsForRelease(): Promise<Transaction[]> {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    
    return await this.executeWithRetry(async () => {
      return await this.prisma.transaction.findMany({
        where: {
          status: "payment_received",
          checkReceivedAt: {
            lte: twoMinutesAgo,
          },
        },
        include: {
          payout: true,
          advertisement: true,
        },
      });
    }, "Get transactions for release");
  }

  // ========== Chat Methods ==========

  async createChatMessage(data: {
    transactionId: string;
    messageId: string;
    sender: string;
    content: string;
    messageType: string;
  }): Promise<ChatMessage> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.chatMessage.create({
        data,
      });
    }, "Create chat message");
  }

  async markChatMessageProcessed(id: string): Promise<ChatMessage> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.chatMessage.update({
        where: { id },
        data: { isProcessed: true },
      });
    }, "Mark chat message processed");
  }

  async getUnprocessedChatMessages(): Promise<ChatMessage[]> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.chatMessage.findMany({
        where: { isProcessed: false },
        include: {
          transaction: {
            include: {
              payout: true,
              advertisement: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    }, "Get unprocessed chat messages");
  }

  // ========== Account Methods ==========

  async upsertGateAccount(data: {
    accountId: string;
    email: string;
    apiKey: string;
    apiSecret: string;
  }): Promise<GateAccount> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.gateAccount.upsert({
        where: { accountId: data.accountId },
        update: {
          email: data.email,
          apiKey: data.apiKey,
          apiSecret: data.apiSecret,
          isActive: true,
        },
        create: data,
      });
    }, "Upsert Gate account");
  }

  async getActiveGateAccounts(): Promise<GateAccount[]> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.gateAccount.findMany({
        where: { isActive: true },
      });
    }, "Get active Gate accounts");
  }

  async upsertBybitAccount(data: {
    accountId: string;
    apiKey: string;
    apiSecret: string;
  }): Promise<BybitAccount> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.bybitAccount.upsert({
        where: { accountId: data.accountId },
        update: {
          apiKey: data.apiKey,
          apiSecret: data.apiSecret,
          isActive: true,
        },
        create: data,
      });
    }, "Upsert Bybit account");
  }

  async getActiveBybitAccounts(): Promise<BybitAccount[]> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.bybitAccount.findMany({
        where: { isActive: true },
      });
    }, "Get active Bybit accounts");
  }

  async getBybitAccountWithLeastAds(): Promise<BybitAccount | null> {
    return await this.executeWithRetry(async () => {
      const accounts = await this.prisma.bybitAccount.findMany({
        where: { isActive: true },
      });

      if (accounts.length === 0) return null;

      // Count active ads for each account
      const accountsWithAdCounts = await Promise.all(
        accounts.map(async (account) => {
          const count = await this.countActiveAdvertisementsByAccount(
            account.accountId,
          );
          return { account, count };
        }),
      );

      // Sort by ad count and return the one with least ads
      accountsWithAdCounts.sort((a, b) => a.count - b.count);
      return accountsWithAdCounts[0].account;
    }, "Get Bybit account with least ads");
  }

  async upsertGmailAccount(data: {
    email: string;
    refreshToken: string;
  }): Promise<GmailAccount> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.gmailAccount.upsert({
        where: { email: data.email },
        update: {
          refreshToken: data.refreshToken,
          isActive: true,
        },
        create: data,
      });
    }, "Upsert Gmail account");
  }

  async getActiveGmailAccount(): Promise<GmailAccount | null> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.gmailAccount.findFirst({
        where: { isActive: true },
      });
    }, "Get active Gmail account");
  }

  // ========== Blacklist Methods ==========

  async addToBlacklist(data: {
    payoutId: string;
    reason: string;
    wallet?: string;
    amount?: string;
  }): Promise<BlacklistedTransaction> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.blacklistedTransaction.create({
        data,
      });
    }, "Add to blacklist");
  }

  async isBlacklisted(wallet: string): Promise<boolean> {
    return await this.executeWithRetry(async () => {
      const count = await this.prisma.blacklistedTransaction.count({
        where: { wallet },
      });
      return count > 0;
    }, "Check if blacklisted");
  }

  // ========== Settings Methods ==========

  async setSetting(key: string, value: string): Promise<SystemSettings> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.systemSettings.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }, "Set setting");
  }

  async getSetting(key: string): Promise<string | null> {
    return await this.executeWithRetry(async () => {
      const setting = await this.prisma.systemSettings.findUnique({
        where: { key },
      });
      return setting?.value || null;
    }, "Get setting");
  }

  async isManualMode(): Promise<boolean> {
    const mode = await this.getSetting("mode");
    return mode === "manual";
  }

  get client() {
    return this.prisma;
  }
}

export const db = new DatabaseClient();
export type { 
  Payout, 
  GatePayoutData,
  BybitAdvertisement,
  Transaction,
  ChatMessage,
  GateAccount,
  BybitAccount,
  GmailAccount,
  BlacklistedTransaction,
  SystemSettings
};