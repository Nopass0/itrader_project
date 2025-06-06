import axios from "axios";

export class TimeSyncManager {
  private static serverTimeOffset: number = 0;
  private static lastSync: number = 0;
  private static SYNC_INTERVAL = 60 * 1000; // Sync every minute

  static async syncServerTime(isTestnet: boolean = false): Promise<void> {
    const now = Date.now();
    
    // Skip if already synced recently
    if (this.lastSync && (now - this.lastSync) < this.SYNC_INTERVAL) {
      return;
    }

    try {
      const baseUrl = isTestnet 
        ? "https://api-testnet.bybit.com"
        : "https://api.bybit.com";
        
      const response = await axios.get(`${baseUrl}/v5/market/time`, {
        timeout: 5000, // 5 second timeout
      });
      
      if (response.data.retCode === 0) {
        const serverTime = parseInt(response.data.result.timeSecond) * 1000;
        this.serverTimeOffset = serverTime - now;
        this.lastSync = now;
        
        console.log(`Bybit time sync successful. Offset: ${this.serverTimeOffset}ms`);
      }
    } catch (error) {
      console.error("Failed to sync Bybit server time:", error);
    }
  }

  static getAdjustedTimestamp(): number {
    return Date.now() + this.serverTimeOffset;
  }

  static getServerTimeOffset(): number {
    return this.serverTimeOffset;
  }
}