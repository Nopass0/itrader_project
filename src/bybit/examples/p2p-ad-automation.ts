import { BybitClient } from "@/bybit/client";
import type { CreateAdParams } from "@/bybit/types/p2p";

/**
 * P2P Advertisement Automation
 * Automatically creates and manages P2P ads based on market conditions
 */

interface MarketAnalysis {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  competitorCount: number;
  optimalPrice: number;
}

class P2PAdAutomation {
  private client: BybitClient;
  private accountId: string | null = null;

  constructor() {
    this.client = new BybitClient();
  }

  async initialize(apiKey: string, apiSecret: string): Promise<void> {
    this.accountId = await this.client.addAccount(apiKey, apiSecret, false, "P2P Automation");
    console.log("✅ P2P Automation initialized");
  }

  async analyzeMarket(tokenId: string, currencyId: string, side: "0" | "1"): Promise<MarketAnalysis> {
    if (!this.accountId) throw new Error("Not initialized");

    console.log(`\n📊 Analyzing ${tokenId}/${currencyId} market...`);
    
    const searchResult = await this.client.searchP2PAds(this.accountId, {
      tokenId,
      currencyId,
      side,
      page: 1,
      size: 20,
    });

    if (!searchResult.list || searchResult.list.length === 0) {
      throw new Error("No market data available");
    }

    const prices = searchResult.list.map(ad => parseFloat(ad.price));
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    // Calculate optimal price (slightly better than average)
    let optimalPrice: number;
    if (side === "1") { // Selling - price slightly below average
      optimalPrice = avgPrice * 0.995; // 0.5% below average
    } else { // Buying - price slightly above average
      optimalPrice = avgPrice * 1.005; // 0.5% above average
    }

    // Ensure price is within market range
    optimalPrice = Math.max(minPrice, Math.min(maxPrice, optimalPrice));

    console.log(`   Price Range: ${minPrice.toFixed(2)} - ${maxPrice.toFixed(2)}`);
    console.log(`   Average Price: ${avgPrice.toFixed(2)}`);
    console.log(`   Optimal Price: ${optimalPrice.toFixed(2)}`);
    console.log(`   Competitors: ${searchResult.list.length}`);

    return {
      avgPrice,
      minPrice,
      maxPrice,
      competitorCount: searchResult.list.length,
      optimalPrice,
    };
  }

  async createOptimalAd(
    tokenId: string,
    currencyId: string,
    side: "0" | "1",
    quantity: number,
    paymentIds: string[]
  ): Promise<string> {
    if (!this.accountId) throw new Error("Not initialized");

    // Analyze market first
    const market = await this.analyzeMarket(tokenId, currencyId, side);
    
    // Calculate parameters
    const price = market.optimalPrice.toFixed(2);
    const minOrderValue = 10; // Minimum $10 equivalent
    const maxOrderValue = quantity * market.optimalPrice;

    const params: CreateAdParams = {
      tokenId,
      currencyId,
      side,
      priceType: "0", // Fixed price
      price,
      quantity: quantity.toFixed(2),
      minAmount: (minOrderValue * market.optimalPrice).toFixed(2),
      maxAmount: maxOrderValue.toFixed(2),
      paymentPeriod: "15",
      paymentIds,
      remark: this.generateRemark(side, market.competitorCount),
      tradingPreferenceSet: {
        autoBuyFlag: false,
        autoSellFlag: false,
        paymentPeriod: 15,
        registerDays: 0,
        kycVerifyLevel: 0,
        completedOrderCount: 0,
        completeRatePercent: 80, // Minimum 80% completion rate
        isFilterBlockedUser: true,
      },
      itemType: "ORIGIN",
    };

    console.log(`\n📝 Creating optimized ad...`);
    console.log(`   Price: ${price} ${currencyId} (Market avg: ${market.avgPrice.toFixed(2)})`);
    console.log(`   Quantity: ${quantity} ${tokenId}`);

    const result = await this.client.createP2PAd(this.accountId, params);
    console.log(`✅ Ad created: ${result.itemId}`);

    return result.itemId;
  }

  async updateAdPrice(itemId: string): Promise<void> {
    if (!this.accountId) throw new Error("Not initialized");

    // Get current ad details
    const adDetail = await this.client.getP2PAdDetail(this.accountId, itemId);
    
    // Analyze current market
    const market = await this.analyzeMarket(
      adDetail.tokenId,
      adDetail.fiat,
      adDetail.side
    );

    const currentPrice = parseFloat(adDetail.price);
    const priceDiff = Math.abs(currentPrice - market.optimalPrice) / currentPrice;

    // Update if price difference is more than 1%
    if (priceDiff > 0.01) {
      console.log(`\n🔄 Updating ad price...`);
      console.log(`   Current: ${currentPrice.toFixed(2)}`);
      console.log(`   New: ${market.optimalPrice.toFixed(2)}`);

      await this.client.updateP2PAd(this.accountId, {
        itemId,
        price: market.optimalPrice.toFixed(2),
      });

      console.log(`✅ Price updated`);
    } else {
      console.log(`✅ Price is optimal (within 1% of market)`);
    }
  }

  async monitorAndAdjust(): Promise<void> {
    if (!this.accountId) throw new Error("Not initialized");

    console.log("\n🔄 Monitoring active ads...");
    
    const myAds = await this.client.getP2PMyAds(this.accountId);
    const activeAds = myAds.filter(ad => ad.status === "1");

    if (activeAds.length === 0) {
      console.log("   No active ads to monitor");
      return;
    }

    for (const ad of activeAds) {
      console.log(`\n📌 Ad ${ad.id}:`);
      console.log(`   ${ad.side === "1" ? "SELL" : "BUY"} ${ad.quantity} ${ad.tokenId}`);
      console.log(`   Current Price: ${ad.price} ${ad.fiat}`);
      console.log(`   Available: ${ad.lastQuantity}/${ad.quantity}`);

      try {
        await this.updateAdPrice(ad.id);
      } catch (error: any) {
        console.log(`   ⚠️ Could not update: ${error.message}`);
      }
    }
  }

  private generateRemark(side: "0" | "1", competitorCount: number): string {
    const remarks = {
      sell: [
        "⚡ Fast release! Professional trader with 1000+ completed orders",
        "🏆 Top rated seller. Quick response guaranteed",
        "✅ Instant release after payment confirmation. 24/7 online",
        "🔥 Best rates! Release in 1-2 minutes",
      ],
      buy: [
        "💰 Best prices! Fast payment through all methods",
        "⭐ Trusted buyer with excellent reputation",
        "🚀 Quick payment within 5 minutes guaranteed",
        "✨ Professional trader. Smooth transactions",
      ],
    };

    const remarkList = side === "1" ? remarks.sell : remarks.buy;
    
    // Add urgency if high competition
    if (competitorCount > 10) {
      return remarkList[0] + " | Limited time offer!";
    }
    
    return remarkList[Math.floor(Math.random() * remarkList.length)];
  }

  async getPerformanceStats(): Promise<void> {
    if (!this.accountId) throw new Error("Not initialized");

    console.log("\n📈 Performance Statistics:");
    
    const userInfo = await this.client.getP2PUserInfo(this.accountId);
    console.log(`   Completed Orders: ${userInfo.completedOrderCount}`);
    console.log(`   Success Rate: ${userInfo.completedOrderRate}%`);
    console.log(`   Avg Release Time: ${userInfo.avgReleaseTime} min`);
    console.log(`   Avg Payment Time: ${userInfo.avgPaymentTime} min`);
    console.log(`   Total Volume: ${userInfo.totalVolume}`);
    console.log(`   Volume Rank: #${userInfo.totalVolumeRank}`);
    
    const pendingOrders = await this.client.getP2PPendingOrders(this.accountId);
    console.log(`   Pending Orders: ${pendingOrders.length}`);
  }
}

// Example usage
async function runP2PAutomation() {
  console.log("=== P2P Trading Automation ===\n");
  
  const automation = new P2PAdAutomation();
  
  try {
    // Initialize
    await automation.initialize(
      "ysfXg4bN0vRMwlwYuI",
      "aIxbRqs8oqoDoqwGjEQTFsjDg68WsAxOns4n"
    );
    
    // Get payment methods
    const client = new BybitClient();
    const accountId = await client.addAccount(
      "ysfXg4bN0vRMwlwYuI",
      "aIxbRqs8oqoDoqwGjEQTFsjDg68WsAxOns4n",
      false
    );
    
    let paymentIds = ["1"]; // Default
    try {
      const methods = await client.getP2PPaymentMethods(accountId);
      if (methods.length > 0) {
        paymentIds = methods.map(m => m.id);
        console.log(`✅ Using ${methods.length} payment methods`);
      }
    } catch (error) {
      console.log("⚠️  Using default payment method");
    }
    
    // Check balance
    const balances = await client.getP2PBalances(accountId);
    const usdtBalance = balances.find(b => b.coin === "USDT");
    
    if (!usdtBalance || parseFloat(usdtBalance.free) < 10) {
      console.log("\n❌ Insufficient USDT balance (minimum 10 USDT required)");
      return;
    }
    
    console.log(`\n💰 Available balance: ${usdtBalance.free} USDT`);
    
    // Create optimal sell ad
    const adQuantity = Math.min(parseFloat(usdtBalance.free) * 0.3, 50); // Use 30% of balance, max 50
    
    try {
      const adId = await automation.createOptimalAd(
        "USDT",
        "RUB",
        "1", // Sell
        adQuantity,
        paymentIds
      );
      
      console.log(`\n✅ Created ad: ${adId}`);
    } catch (error: any) {
      console.log(`\n❌ Could not create ad: ${error.message}`);
    }
    
    // Monitor and adjust existing ads
    await automation.monitorAndAdjust();
    
    // Show performance stats
    await automation.getPerformanceStats();
    
    // Set up periodic monitoring (example - not actually running)
    console.log("\n\n💡 To enable automatic monitoring, you could:");
    console.log("   1. Run this script periodically (cron job)");
    console.log("   2. Implement a loop with delays");
    console.log("   3. Use a scheduler like node-cron");
    console.log("\nExample with node-cron:");
    console.log("   cron.schedule('*/15 * * * *', async () => {");
    console.log("     await automation.monitorAndAdjust();");
    console.log("   });");
    
  } catch (error: any) {
    console.error("\n❌ Automation error:", error.message);
  }
}

// Run the automation
runP2PAutomation()
  .then(() => {
    console.log("\n✅ Automation example completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });