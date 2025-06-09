export class TimeSyncManager {
  static async syncServerTime(): Promise<{ serverTime: number; offset: number }> {
    const serverTime = Date.now();
    return { serverTime, offset: 0 };
  }
}
