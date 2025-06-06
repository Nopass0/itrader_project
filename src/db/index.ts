import { PrismaClient, type Payout } from "../../generated/prisma";

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

  async upsertPayoutFromGate(
    gatePayoutData: GatePayoutData,
    gateAccount: string,
  ): Promise<Payout> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.payout.upsert({
        where: { gatePayoutId: gatePayoutData.id },
        update: {
          paymentMethodId: gatePayoutData.payment_method_id,
          wallet: gatePayoutData.wallet,
          amountTrader: gatePayoutData.amount.trader,
          totalTrader: gatePayoutData.total.trader,
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
          amountTrader: gatePayoutData.amount.trader,
          totalTrader: gatePayoutData.total.trader,
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

  async upsertPayout(payoutData: Partial<Payout> & { gatePayoutId: number }): Promise<Payout> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.payout.upsert({
        where: { gatePayoutId: payoutData.gatePayoutId },
        update: {
          paymentMethodId: payoutData.paymentMethodId,
          wallet: payoutData.wallet,
          amountTrader: payoutData.amountTrader ?? undefined,
          totalTrader: payoutData.totalTrader ?? undefined,
          status: payoutData.status,
          approvedAt: payoutData.approvedAt,
          expiredAt: payoutData.expiredAt,
          meta: payoutData.meta ?? undefined,
          method: payoutData.method ?? undefined,
          attachments: payoutData.attachments ?? undefined,
          tooltip: payoutData.tooltip ?? undefined,
          bank: payoutData.bank ?? undefined,
          trader: payoutData.trader ?? undefined,
          gateAccount: payoutData.gateAccount,
        },
        create: {
          gatePayoutId: payoutData.gatePayoutId,
          paymentMethodId: payoutData.paymentMethodId!,
          wallet: payoutData.wallet!,
          amountTrader: payoutData.amountTrader!,
          totalTrader: payoutData.totalTrader!,
          status: payoutData.status!,
          approvedAt: payoutData.approvedAt,
          expiredAt: payoutData.expiredAt,
          createdAt: payoutData.createdAt || new Date(),
          updatedAt: payoutData.updatedAt || new Date(),
          meta: payoutData.meta!,
          method: payoutData.method!,
          attachments: payoutData.attachments!,
          tooltip: payoutData.tooltip!,
          bank: payoutData.bank!,
          trader: payoutData.trader!,
          gateAccount: payoutData.gateAccount!,
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

  async getPayoutsByGateAccount(gateAccount: string): Promise<Payout[]> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.payout.findMany({
        where: { gateAccount },
        orderBy: { createdAt: "desc" },
      });
    }, "Get payouts by gate account");
  }

  async getPayoutsByStatusAndAccount(
    status: number,
    gateAccount: string,
  ): Promise<Payout[]> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.payout.findMany({
        where: {
          AND: [{ status }, { gateAccount }],
        },
        orderBy: { createdAt: "desc" },
      });
    }, "Get payouts by status and account");
  }

  async getPayoutById(id: string): Promise<Payout | null> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.payout.findUnique({
        where: { id },
      });
    }, "Get payout by ID");
  }

  async getPayoutByGatePayoutId(gatePayoutId: number): Promise<Payout | null> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.payout.findUnique({
        where: { gatePayoutId },
      });
    }, "Get payout by Gate payout ID");
  }

  async getExpiredPayouts(): Promise<Payout[]> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.payout.findMany({
        where: { status: 5 }, // 5 = expired
        orderBy: { expiredAt: "desc" },
      });
    }, "Get expired payouts");
  }

  async getPendingPayouts(): Promise<Payout[]> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.payout.findMany({
        where: { 
          status: {
            notIn: [5] // not expired
          },
          approvedAt: null
        },
        orderBy: { createdAt: "desc" },
      });
    }, "Get pending payouts");
  }

  async getApprovedPayouts(): Promise<Payout[]> {
    return await this.executeWithRetry(async () => {
      return await this.prisma.payout.findMany({
        where: { 
          NOT: {
            approvedAt: null
          }
        },
        orderBy: { approvedAt: "desc" },
      });
    }, "Get approved payouts");
  }

  get client() {
    return this.prisma;
  }
}

export const db = new DatabaseClient();
export type { Payout, GatePayoutData };