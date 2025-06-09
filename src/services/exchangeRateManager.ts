/**
 * Exchange Rate Manager
 * Manages exchange rates for P2P advertisements with support for constant and automatic modes
 */

export type ExchangeRateMode = 'constant' | 'automatic';

interface ExchangeRateConfig {
  mode: ExchangeRateMode;
  constantRate: number;
  lastUpdate: Date;
}

class ExchangeRateManager {
  private static instance: ExchangeRateManager;
  private config: ExchangeRateConfig;
  private rateUpdateListeners: ((rate: number) => void)[] = [];

  private constructor() {
    this.config = {
      mode: 'constant',
      constantRate: 85.0, // Default RUB/USDT rate (within Bybit's allowed range)
      lastUpdate: new Date()
    };
  }

  /**
   * Get the singleton instance of ExchangeRateManager
   */
  public static getInstance(): ExchangeRateManager {
    if (!ExchangeRateManager.instance) {
      ExchangeRateManager.instance = new ExchangeRateManager();
    }
    return ExchangeRateManager.instance;
  }

  /**
   * Get the current exchange rate
   * @returns The current exchange rate based on the active mode
   */
  public getRate(): number {
    switch (this.config.mode) {
      case 'constant':
        return this.config.constantRate;
      case 'automatic':
        // TODO: Implement automatic rate fetching
        // For now, fall back to constant rate
        console.warn('Automatic mode not yet implemented, using constant rate');
        return this.config.constantRate;
      default:
        return this.config.constantRate;
    }
  }

  /**
   * Set a new exchange rate (works in constant mode)
   * @param rate The new exchange rate
   */
  public setRate(rate: number): void {
    if (rate <= 0) {
      throw new Error('Exchange rate must be positive');
    }

    this.config.constantRate = rate;
    this.config.lastUpdate = new Date();
    
    // Notify listeners
    this.notifyListeners(rate);
    
    console.log(`Exchange rate updated to ${rate} RUB/USDT`);
  }

  /**
   * Set the exchange rate mode
   * @param mode The mode to set ('constant' or 'automatic')
   */
  public setMode(mode: ExchangeRateMode): void {
    if (mode !== 'constant' && mode !== 'automatic') {
      throw new Error(`Invalid mode: ${mode}. Must be 'constant' or 'automatic'`);
    }

    const previousMode = this.config.mode;
    this.config.mode = mode;
    
    console.log(`Exchange rate mode changed from ${previousMode} to ${mode}`);
    
    if (mode === 'automatic') {
      console.warn('Automatic mode selected but not yet implemented. Rate will remain constant.');
      // TODO: Start automatic rate fetching when implemented
    }
  }

  /**
   * Get the current configuration
   * @returns The current exchange rate configuration
   */
  public getConfig(): Readonly<ExchangeRateConfig> {
    return { ...this.config };
  }

  /**
   * Add a listener for rate updates
   * @param listener Function to call when rate is updated
   * @returns Function to remove the listener
   */
  public onRateUpdate(listener: (rate: number) => void): () => void {
    this.rateUpdateListeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.rateUpdateListeners.indexOf(listener);
      if (index > -1) {
        this.rateUpdateListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of a rate update
   * @param rate The new rate
   */
  private notifyListeners(rate: number): void {
    this.rateUpdateListeners.forEach(listener => {
      try {
        listener(rate);
      } catch (error) {
        console.error('Error in rate update listener:', error);
      }
    });
  }

  /**
   * Update the rate asynchronously (useful for automatic mode in the future)
   * @returns Promise that resolves to the new rate
   */
  public async updateRateAsync(): Promise<number> {
    if (this.config.mode === 'automatic') {
      // TODO: Implement automatic rate fetching from external sources
      // For example:
      // const newRate = await fetchRateFromExternalAPI();
      // this.setRate(newRate);
      // return newRate;
      
      console.warn('Automatic rate update not yet implemented');
    }
    
    return this.getRate();
  }

  /**
   * Reset to default configuration
   */
  public reset(): void {
    this.config = {
      mode: 'constant',
      constantRate: 92.5,
      lastUpdate: new Date()
    };
    console.log('Exchange rate manager reset to defaults');
  }
}

// Export singleton instance getter
export const getExchangeRateManager = (): ExchangeRateManager => {
  return ExchangeRateManager.getInstance();
};

// Export the class for type checking
export { ExchangeRateManager };