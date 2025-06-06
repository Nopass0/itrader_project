import { BybitClient } from "@/bybit/client";

/**
 * P2P Payment Methods Setup Helper
 * This script helps you understand and set up payment methods for P2P trading
 */

async function setupPaymentMethods() {
  console.log("=== P2P Payment Methods Setup Guide ===\n");
  
  const client = new BybitClient();
  
  try {
    // Connect account
    const accountId = await client.addAccount(
      "ysfXg4bN0vRMwlwYuI",
      "aIxbRqs8oqoDoqwGjEQTFsjDg68WsAxOns4n",
      false,
      "P2P Account",
    );
    
    console.log("1. Checking current payment methods...");
    try {
      const methods = await client.getP2PPaymentMethods(accountId);
      
      if (methods.length === 0) {
        console.log("\n❌ No payment methods found\n");
        console.log("📋 How to add payment methods:\n");
        console.log("   1. Open Bybit app or website");
        console.log("   2. Go to P2P Trading section");
        console.log("   3. Click on Profile/Settings");
        console.log("   4. Select 'Payment Methods'");
        console.log("   5. Add your payment methods:\n");
        console.log("      For Russia (RUB):");
        console.log("      - Bank Transfer (Sberbank, Tinkoff, etc.)");
        console.log("      - Payment Systems (YooMoney, QIWI)");
        console.log("      - E-wallets\n");
        console.log("      Required Information:");
        console.log("      - Account holder name");
        console.log("      - Account/Card number");
        console.log("      - Bank name (for bank transfers)");
        console.log("      - QR code (optional)\n");
      } else {
        console.log(`\n✅ Found ${methods.length} payment method(s):\n`);
        
        methods.forEach((method, index) => {
          console.log(`${index + 1}. ${method.payType}`);
          console.log(`   ID: ${method.id}`);
          console.log(`   Account: ${method.account}`);
          console.log(`   Name: ${method.realName}`);
          if (method.bankName) {
            console.log(`   Bank: ${method.bankName}`);
          }
          console.log(`   Added: ${new Date(method.createTime).toLocaleDateString()}\n`);
        });
        
        console.log("💡 These payment method IDs can be used when creating ads");
        console.log(`   Example: paymentIds: ["${methods[0].id}"]`);
      }
    } catch (error: any) {
      console.log("\n⚠️  Could not fetch payment methods");
      console.log(`   Error: ${error.message}\n`);
      
      if (error.message.includes("404")) {
        console.log("🔍 Possible reasons:");
        console.log("   - P2P features not enabled for your account");
        console.log("   - KYC verification not completed");
        console.log("   - Regional restrictions\n");
      }
    }
    
    // Check KYC status
    console.log("\n2. Checking KYC verification status...");
    try {
      const userInfo = await client.getP2PUserInfo(accountId);
      const kycStatus = userInfo.kycVerifyStatus;
      
      if (kycStatus === 1) {
        console.log("✅ KYC verification completed");
      } else {
        console.log("❌ KYC verification not completed");
        console.log("\n📋 How to complete KYC:");
        console.log("   1. Go to Bybit account settings");
        console.log("   2. Select 'Identity Verification'");
        console.log("   3. Complete Basic and Advanced verification");
        console.log("   4. Wait for approval (usually 24-48 hours)");
      }
      
      console.log(`\n👤 P2P Profile Status:`);
      console.log(`   Nickname: ${userInfo.nickName}`);
      console.log(`   Completed Orders: ${userInfo.completedOrderCount}`);
      console.log(`   Success Rate: ${userInfo.completedOrderRate}%`);
      console.log(`   Average Release Time: ${userInfo.avgReleaseTime} min`);
      
    } catch (error: any) {
      console.log("   Could not fetch user info");
    }
    
    // Payment method recommendations
    console.log("\n\n📚 Payment Method Best Practices:\n");
    console.log("1. **Multiple Methods**: Add 2-3 payment methods for flexibility");
    console.log("2. **Popular Methods**: Use widely accepted payment systems");
    console.log("3. **Verification**: Ensure all payment details are accurate");
    console.log("4. **Security**: Never share payment passwords or OTPs");
    console.log("5. **Documentation**: Keep transaction receipts");
    
    console.log("\n\n🛡️ Security Tips:\n");
    console.log("• Only trade with verified users");
    console.log("• Check user ratings and completed orders");
    console.log("• Use Bybit's chat for all communication");
    console.log("• Never release crypto before confirming payment");
    console.log("• Report suspicious activity immediately");
    
  } catch (error: any) {
    console.error("\nUnexpected error:", error.message);
  }
}

// Example: Creating ad with specific payment methods
async function createAdWithPaymentMethods() {
  console.log("\n\n=== Creating Ad with Payment Methods Example ===\n");
  
  const client = new BybitClient();
  
  try {
    const accountId = await client.addAccount(
      "ysfXg4bN0vRMwlwYuI",
      "aIxbRqs8oqoDoqwGjEQTFsjDg68WsAxOns4n",
      false,
    );
    
    // Get payment methods
    const methods = await client.getP2PPaymentMethods(accountId);
    
    if (methods.length === 0) {
      console.log("❌ No payment methods available");
      console.log("   Please add payment methods first");
      return;
    }
    
    // Example: Select specific payment types
    const bankTransfers = methods.filter(m => 
      m.payType.toLowerCase().includes("bank") || 
      m.bankName !== undefined
    );
    
    const eWallets = methods.filter(m => 
      m.payType.toLowerCase().includes("wallet") ||
      m.payType.toLowerCase().includes("yoomoney") ||
      m.payType.toLowerCase().includes("qiwi")
    );
    
    console.log("Available payment methods by type:");
    if (bankTransfers.length > 0) {
      console.log(`\n💳 Bank Transfers (${bankTransfers.length}):`);
      bankTransfers.forEach(m => console.log(`   - ${m.payType}: ${m.account}`));
    }
    
    if (eWallets.length > 0) {
      console.log(`\n💰 E-Wallets (${eWallets.length}):`);
      eWallets.forEach(m => console.log(`   - ${m.payType}: ${m.account}`));
    }
    
    // Create ad with selected payment methods
    const selectedPaymentIds = methods.slice(0, 2).map(m => m.id); // Use first 2 methods
    
    console.log(`\nCreating ad with ${selectedPaymentIds.length} payment methods...`);
    console.log(`Payment IDs: ${selectedPaymentIds.join(", ")}`);
    
    // Ad creation would go here...
    
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

// Run the setup guide
setupPaymentMethods()
  .then(() => createAdWithPaymentMethods())
  .then(() => {
    console.log("\n\n✅ Payment methods guide completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });