import { BybitClient } from "@/bybit/client";
import type { CreateAdParams } from "@/bybit/types/p2p";

/**
 * Complete P2P Advertisement Creation Example
 * This example demonstrates:
 * 1. Checking account balance
 * 2. Getting/creating payment methods
 * 3. Creating P2P advertisements with proper validation
 * 4. Handling errors and retrying with different parameters
 */

async function createP2PAdComplete() {
  console.log("=== Complete P2P Advertisement Creation ===\n");
  
  const client = new BybitClient();
  
  try {
    // 1. Connect account
    console.log("1. Connecting to Bybit account...");
    const accountId = await client.addAccount(
      "ysfXg4bN0vRMwlwYuI",
      "aIxbRqs8oqoDoqwGjEQTFsjDg68WsAxOns4n",
      false,
      "P2P Trading Account",
    );
    console.log("✅ Account connected\n");
    
    // 2. Check FUND balance
    console.log("2. Checking FUND account balance...");
    const balances = await client.getP2PBalances(accountId);
    const usdtBalance = balances.find(b => b.coin === "USDT");
    
    if (!usdtBalance || parseFloat(usdtBalance.free) === 0) {
      console.log("❌ No USDT balance in FUND account");
      console.log("💡 Please transfer USDT to your FUND account first");
      return;
    }
    
    console.log(`✅ USDT Balance: ${usdtBalance.free} USDT\n`);
    
    // 3. Get user info
    console.log("3. Getting P2P user info...");
    const userInfo = await client.getP2PUserInfo(accountId);
    console.log(`✅ User: ${userInfo.nickName}`);
    console.log(`   KYC Status: ${userInfo.kycVerifyStatus === 1 ? "Verified" : "Not Verified"}`);
    console.log(`   Completed Orders: ${userInfo.completedOrderCount}`);
    console.log(`   Online Status: ${userInfo.isOnline ? "Online" : "Offline"}\n`);
    
    // 4. Check payment methods
    console.log("4. Checking payment methods...");
    let paymentMethods: string[] = [];
    
    try {
      const methods = await client.getP2PPaymentMethods(accountId);
      if (methods.length > 0) {
        console.log(`✅ Found ${methods.length} payment methods:`);
        methods.forEach(m => {
          console.log(`   - ${m.payType}: ${m.account} (ID: ${m.id})`);
        });
        paymentMethods = methods.map(m => m.id);
      } else {
        console.log("⚠️  No payment methods found");
        console.log("   Using placeholder payment method ID");
        paymentMethods = ["1"]; // Placeholder
      }
    } catch (error: any) {
      console.log("⚠️  Could not fetch payment methods:", error.message);
      console.log("   Using placeholder payment method ID");
      paymentMethods = ["1"]; // Placeholder
    }
    console.log();
    
    // 5. Search for current market prices
    console.log("5. Checking current market prices...");
    try {
      const marketAds = await client.searchP2PAds(accountId, {
        tokenId: "USDT",
        currencyId: "RUB",
        side: "1", // sell ads
        page: 1,
        size: 10,
      });
      
      if (marketAds.list && marketAds.list.length > 0) {
        const prices = marketAds.list.map(ad => parseFloat(ad.price));
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        console.log(`✅ Market Analysis (${marketAds.list.length} ads):`);
        console.log(`   Price Range: ${minPrice.toFixed(2)} - ${maxPrice.toFixed(2)} RUB`);
        console.log(`   Average Price: ${avgPrice.toFixed(2)} RUB\n`);
      } else {
        console.log("   No market data available\n");
      }
    } catch (error: any) {
      console.log("   Could not fetch market data:", error.message, "\n");
    }
    
    // 6. Create advertisement with dynamic parameters
    console.log("6. Creating P2P advertisement...");
    
    // Calculate ad parameters based on balance
    const availableUsdt = parseFloat(usdtBalance.free);
    const adQuantity = Math.min(availableUsdt * 0.5, 100); // Use 50% of balance, max 100 USDT
    const price = "85.00"; // Price within allowed range
    const minOrderUsdt = 10; // Minimum order in USDT
    const maxOrderUsdt = adQuantity; // Maximum order equals ad quantity
    
    const createAdParams: CreateAdParams = {
      tokenId: "USDT",
      currencyId: "RUB",
      side: "1", // 1 = sell
      priceType: "0", // 0 = fixed rate
      price: price,
      quantity: adQuantity.toFixed(2),
      minAmount: (minOrderUsdt * parseFloat(price)).toFixed(2), // Min order in RUB
      maxAmount: (maxOrderUsdt * parseFloat(price)).toFixed(2), // Max order in RUB
      paymentPeriod: "15", // 15 minutes
      paymentIds: paymentMethods,
      remark: "Professional P2P trader. Fast release after payment confirmation. Available 24/7.",
      tradingPreferenceSet: {
        autoBuyFlag: false,
        autoSellFlag: false,
        paymentPeriod: 15,
        registerDays: 0,
        kycVerifyLevel: 0,
        completedOrderCount: 0,
        completeRatePercent: 0,
        isFilterBlockedUser: true,
      },
      itemType: "ORIGIN",
    };
    
    console.log("\n📋 Advertisement Details:");
    console.log(`   Type: SELL ${createAdParams.quantity} USDT`);
    console.log(`   Price: ${createAdParams.price} RUB per USDT`);
    console.log(`   Total Value: ${(parseFloat(createAdParams.price) * parseFloat(createAdParams.quantity)).toFixed(2)} RUB`);
    console.log(`   Order Limits: ${createAdParams.minAmount} - ${createAdParams.maxAmount} RUB`);
    console.log(`   Payment Time: ${createAdParams.paymentPeriod} minutes`);
    console.log(`   Payment Methods: ${paymentMethods.length} method(s)\n`);
    
    try {
      const result = await client.createP2PAd(accountId, createAdParams);
      console.log("✅ Advertisement created successfully!");
      console.log(`   Ad ID: ${result.itemId}`);
      
      if (result.securityRiskToken) {
        console.log(`   Security Token: ${result.securityRiskToken}`);
      }
      
      // 7. Verify ad creation
      console.log("\n7. Verifying advertisement...");
      try {
        const adDetail = await client.getP2PAdDetail(accountId, result.itemId);
        console.log("✅ Advertisement verified:");
        console.log(`   Status: ${adDetail.status === "1" ? "Online" : "Offline"}`);
        console.log(`   Created: ${new Date(parseInt(adDetail.createTime)).toLocaleString()}`);
        console.log(`   Available: ${adDetail.lastQuantity} USDT`);
      } catch (error: any) {
        console.log("   Could not fetch ad details:", error.message);
      }
      
    } catch (error: any) {
      console.log("❌ Failed to create advertisement");
      console.log(`   Error: ${error.message}\n`);
      
      // Handle specific errors with solutions
      if (error.message.includes("912120022")) {
        console.log("💡 Solution: Price is out of allowed range");
        console.log("   The price must be within the market-allowed range (71.28 - 91.09 RUB)");
        console.log("   Trying with market average price...\n");
        
        // Retry with different price
        createAdParams.price = "80.00"; // Middle of allowed range
        createAdParams.minAmount = (minOrderUsdt * 80).toFixed(2);
        createAdParams.maxAmount = (maxOrderUsdt * 80).toFixed(2);
        
        try {
          const retryResult = await client.createP2PAd(accountId, createAdParams);
          console.log("✅ Advertisement created on retry!");
          console.log(`   Ad ID: ${retryResult.itemId}`);
        } catch (retryError: any) {
          console.log("❌ Retry failed:", retryError.message);
        }
        
      } else if (error.message.includes("912120021")) {
        console.log("💡 Solution: Premium rate issue");
        console.log("   For floating rate ads, premium must be between 90-115%");
        
      } else if (error.message.includes("912010001")) {
        console.log("💡 Solution: Invalid payment method");
        console.log("   You need to add payment methods in your Bybit P2P settings first");
        console.log("   Go to: Bybit App/Web → P2P → Settings → Payment Methods");
        
      } else if (error.message.includes("balance")) {
        console.log("💡 Solution: Insufficient balance");
        console.log("   Ensure you have enough USDT in your FUND account");
        console.log(`   Current balance: ${usdtBalance.free} USDT`);
        console.log(`   Trying to create ad for: ${createAdParams.quantity} USDT`);
      }
    }
    
    // 8. List user's advertisements
    console.log("\n8. Listing your advertisements...");
    try {
      const myAds = await client.getP2PMyAds(accountId);
      if (myAds.length > 0) {
        console.log(`✅ You have ${myAds.length} advertisement(s):`);
        myAds.forEach((ad, index) => {
          console.log(`\n   ${index + 1}. ${ad.side === "1" ? "SELL" : "BUY"} ${ad.quantity} ${ad.tokenId}`);
          console.log(`      Price: ${ad.price} ${ad.fiat}`);
          console.log(`      Status: ${ad.status === "1" ? "Online" : "Offline"}`);
          console.log(`      Available: ${ad.lastQuantity} ${ad.tokenId}`);
        });
      } else {
        console.log("   No advertisements found");
      }
    } catch (error: any) {
      console.log("   Could not fetch ads:", error.message);
    }
    
  } catch (error: any) {
    console.error("\n❌ Unexpected error:", error.message);
    console.error("Stack:", error.stack);
  }
}

// Helper function to monitor ad performance
async function monitorAdPerformance() {
  console.log("\n\n=== P2P Ad Performance Monitor ===\n");
  
  const client = new BybitClient();
  const accountId = await client.addAccount(
    "ysfXg4bN0vRMwlwYuI",
    "aIxbRqs8oqoDoqwGjEQTFsjDg68WsAxOns4n",
    false,
  );
  
  try {
    // Get all ads
    const myAds = await client.getP2PMyAds(accountId);
    const activeAds = myAds.filter(ad => ad.status === "1");
    
    if (activeAds.length === 0) {
      console.log("No active advertisements to monitor");
      return;
    }
    
    console.log(`Monitoring ${activeAds.length} active ad(s):\n`);
    
    for (const ad of activeAds) {
      console.log(`Ad ${ad.id}:`);
      console.log(`  Type: ${ad.side === "1" ? "SELL" : "BUY"} ${ad.tokenId}/${ad.fiat}`);
      console.log(`  Price: ${ad.price} ${ad.fiat}`);
      console.log(`  Progress: ${ad.executedQuantity}/${ad.quantity} ${ad.tokenId}`);
      console.log(`  Frozen: ${ad.frozen} ${ad.tokenId}`);
      console.log(`  Available: ${ad.lastQuantity} ${ad.tokenId}\n`);
    }
    
    // Check pending orders
    const pendingOrders = await client.getP2PPendingOrders(accountId);
    if (pendingOrders.length > 0) {
      console.log(`\n⚠️  You have ${pendingOrders.length} pending order(s):`);
      pendingOrders.forEach(order => {
        console.log(`  Order ${order.orderId}: ${order.quantity} ${order.tokenId} at ${order.price} ${order.fiat}`);
      });
    }
    
  } catch (error: any) {
    console.error("Monitor error:", error.message);
  }
}

// Main execution
createP2PAdComplete()
  .then(() => monitorAdPerformance())
  .then(() => {
    console.log("\n✅ P2P setup complete!");
    console.log("\n📚 Next steps:");
    console.log("1. Add payment methods in Bybit P2P settings");
    console.log("2. Ensure KYC verification is complete");
    console.log("3. Monitor your ads and respond to orders quickly");
    console.log("4. Build reputation through successful trades");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });