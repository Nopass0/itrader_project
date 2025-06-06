import { RestClientV5 } from "bybit-api";
import type {
  BybitAccount,
  AccountBalance,
  BybitApiResponse,
} from "./types/models";
import { v4 as uuidv4 } from "uuid";
import { TimeSyncManager } from "./utils/timeSync";
import { BybitHttpClient } from "./utils/httpClient";

export class AccountManager {
  private accounts: Map<
    string,
    { account: BybitAccount; client: RestClientV5; httpClient: BybitHttpClient }
  > = new Map();

  constructor() {}

  async addAccount(
    apiKey: string,
    apiSecret: string,
    isTestnet: boolean = false,
    label?: string,
  ): Promise<string> {
    // Sync server time before creating client
    await TimeSyncManager.syncServerTime(isTestnet);
    
    const accountId = uuidv4();
    const account: BybitAccount = {
      id: accountId,
      apiKey,
      apiSecret,
      isTestnet,
      label,
    };

    const client = new RestClientV5({
      key: apiKey,
      secret: apiSecret,
      testnet: isTestnet,
      parseAPIRateLimits: true,
      recv_window: 20000, // Increase recv_window to 20 seconds to handle time sync issues
      enable_time_sync: true, // Enable automatic time synchronization
    });

    const httpClient = new BybitHttpClient(apiKey, apiSecret, isTestnet);

    this.accounts.set(accountId, { account, client, httpClient });
    return accountId;
  }

  removeAccount(accountId: string): boolean {
    return this.accounts.delete(accountId);
  }

  getAccount(accountId: string): BybitAccount | undefined {
    const entry = this.accounts.get(accountId);
    return entry?.account;
  }

  getClient(accountId: string): RestClientV5 | undefined {
    const entry = this.accounts.get(accountId);
    return entry?.client;
  }

  getHttpClient(accountId: string): BybitHttpClient | undefined {
    const entry = this.accounts.get(accountId);
    return entry?.httpClient;
  }

  getAllAccounts(): BybitAccount[] {
    return Array.from(this.accounts.values()).map((entry) => entry.account);
  }

  async getAccountBalances(accountId: string): Promise<AccountBalance[]> {
    const client = this.getClient(accountId);
    if (!client) {
      throw new Error(`Account ${accountId} not found`);
    }

    try {
      const balances: AccountBalance[] = [];

      // Skip SPOT balance for now as it might not be available
      // const spotBalance = await client.getWalletBalance({
      //   accountType: "SPOT",
      // });
      // if (spotBalance.retCode === 0 && spotBalance.result.list) {
      //   balances.push({
      //     accountType: "SPOT",
      //     accountId,
      //     coin: spotBalance.result.list[0].coin.map((c: any) => ({
      //       coin: c.coin,
      //       walletBalance: c.walletBalance,
      //       availableBalance: c.free,
      //       lockedBalance: c.locked,
      //     })),
      //   });
      // }

      const unifiedBalance = await client.getWalletBalance({
        accountType: "UNIFIED",
      });
      if (unifiedBalance.retCode === 0 && unifiedBalance.result.list) {
        balances.push({
          accountType: "UNIFIED",
          accountId,
          coin: unifiedBalance.result.list[0].coin.map((c: any) => ({
            coin: c.coin,
            walletBalance: c.walletBalance,
            availableBalance: c.availableToWithdraw,
            lockedBalance: c.locked,
          })),
        });
      }

      // Skip FUND balance as it might not be supported
      // const fundingBalance = await client.getWalletBalance({
      //   accountType: "FUND",
      // });
      // if (fundingBalance.retCode === 0 && fundingBalance.result.list) {
      //   balances.push({
      //     accountType: "FUND",
      //     accountId,
      //     coin: fundingBalance.result.list[0].coin.map((c: any) => ({
      //       coin: c.coin,
      //       walletBalance: c.walletBalance,
      //       availableBalance: c.availableToWithdraw,
      //       lockedBalance: "0",
      //     })),
      //   });
      // }

      return balances;
    } catch (error) {
      throw new Error(
        `Failed to get balances for account ${accountId}: ${error}`,
      );
    }
  }

  async getAllBalances(): Promise<Map<string, AccountBalance[]>> {
    const allBalances = new Map<string, AccountBalance[]>();

    for (const [accountId, _] of this.accounts) {
      try {
        const balances = await this.getAccountBalances(accountId);
        allBalances.set(accountId, balances);
      } catch (error) {
        console.error(
          `Failed to get balances for account ${accountId}:`,
          error,
        );
      }
    }

    return allBalances;
  }
}
