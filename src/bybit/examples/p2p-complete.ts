import { BybitClient } from "../client";
import type { CreateAdParams, AdSearchParams } from "../types/p2p";

async function p2pCompleteExample() {
  const client = new BybitClient();

  // Add your account
  const accountId = await client.addAccount(
    "your-api-key",
    "your-api-secret",
    false, // mainnet
    "P2P Trading Account",
  );

  console.log("=== P2P Complete Example ===\n");

  try {
    // 1. Get P2P balances
    console.log("1. Getting P2P balances...");
    const balances = await client.getP2PBalances(accountId);
    console.log("P2P Balances:");
    balances.forEach(balance => {
      console.log(`  ${balance.coin}: ${balance.free} (locked: ${balance.locked})`);
    });

    // 2. Get user info
    console.log("\n2. Getting user info...");
    const userInfo = await client.getP2PUserInfo(accountId);
    console.log("User Info:");
    console.log(`  Nickname: ${userInfo.nickName}`);
    console.log(`  Completed orders: ${userInfo.completedOrderCount}/${userInfo.totalOrderCount}`);
    console.log(`  Completion rate: ${userInfo.completedOrderRate}%`);
    console.log(`  Avg release time: ${userInfo.avgReleaseTime}min`);

    // 3. Get payment methods
    console.log("\n3. Getting payment methods...");
    const paymentMethods = await client.getP2PPaymentMethods(accountId);
    console.log("Payment Methods:");
    paymentMethods.forEach(method => {
      console.log(`  ${method.payType}: ${method.account} (${method.realName})`);
    });

    // 4. Search for ads (looking for USDT sellers in RUB)
    console.log("\n4. Searching for USDT sellers...");
    const searchParams: AdSearchParams = {
      tokenId: "USDT",
      fiat: "RUB",
      side: "1", // sell orders
      page: 1,
      limit: 5,
    };
    const searchResult = await client.searchP2PAds(accountId, searchParams);
    console.log(`Found ${searchResult.count} ads:`);
    searchResult.list.forEach(ad => {
      console.log(`  Price: ${ad.price} ${ad.fiatSymbol}, Amount: ${ad.quantity} ${ad.tokenName}`);
      console.log(`  Limits: ${ad.minAmount}-${ad.maxAmount} ${ad.fiatSymbol}`);
      console.log(`  Seller: ${ad.nickName} (${ad.completedOrderCount} orders, ${ad.completedRate}%)`);
      console.log("  ---");
    });

    // 5. Create a new sell ad
    console.log("\n5. Creating a new sell ad...");
    const createAdParams: CreateAdParams = {
      tokenId: "USDT",
      fiat: "RUB",
      side: "1", // sell
      priceType: "1", // fixed price
      price: "95.50",
      quantity: "100",
      minAmount: "1000",
      maxAmount: "10000",
      payTimeLimit: 15,
      payments: paymentMethods.map(m => m.id).slice(0, 2), // Use first 2 payment methods
      remarks: "Fast and reliable P2P trading",
      autoRepost: 1,
    };
    const newAd = await client.createP2PAd(accountId, createAdParams);
    console.log(`Created ad with ID: ${newAd.itemId}`);

    // 6. Get my ads
    console.log("\n6. Getting my ads...");
    const myAds = await client.getMyP2PAds(accountId, "USDT", "RUB");
    console.log(`My ads (${myAds.length}):`);
    myAds.forEach(ad => {
      console.log(`  Ad ${ad.id}: ${ad.side === "1" ? "SELL" : "BUY"} ${ad.quantity} ${ad.tokenName}`);
      console.log(`  Price: ${ad.price} ${ad.fiatSymbol}, Status: ${ad.status === "1" ? "Online" : "Offline"}`);
    });

    // 7. Get pending orders
    console.log("\n7. Checking pending orders...");
    const pendingOrders = await client.getPendingP2POrders(accountId);
    console.log(`Pending orders: ${pendingOrders.length}`);
    
    if (pendingOrders.length > 0) {
      const order = pendingOrders[0];
      console.log(`\n  Order ${order.orderId}:`);
      console.log(`  ${order.side === "1" ? "Selling" : "Buying"} ${order.quantity} ${order.tokenName}`);
      console.log(`  Amount: ${order.amount} ${order.fiatSymbol}`);
      console.log(`  Status: ${order.orderStatus}`);

      // 8. Get order detail
      console.log("\n8. Getting order detail...");
      const orderDetail = await client.getP2POrderDetail(accountId, order.orderId);
      console.log("Order Detail:");
      console.log(`  Maker: ${orderDetail.makerNickName} (${orderDetail.makerIsOnline ? "Online" : "Offline"})`);
      console.log(`  Taker: ${orderDetail.takerNickName} (${orderDetail.takerIsOnline ? "Online" : "Offline"})`);
      console.log(`  Payment methods:`);
      orderDetail.payments.forEach(payment => {
        console.log(`    ${payment.payType}: ${payment.account} (${payment.realName})`);
      });

      // 9. Send chat message
      console.log("\n9. Sending chat message...");
      await client.sendP2PChatMessage(
        accountId,
        order.orderId,
        "Hello! I'm ready to proceed with the transaction.",
      );
      console.log("Message sent!");

      // 10. Get chat messages
      console.log("\n10. Getting chat messages...");
      const chatMessages = await client.getP2PChatMessages(accountId, order.orderId);
      console.log(`Chat messages (${chatMessages.count}):`);
      chatMessages.list.forEach(msg => {
        console.log(`  [${new Date(msg.createTime).toLocaleTimeString()}] ${msg.userId}: ${msg.message}`);
      });
    }

    // 11. Update ad status (take offline)
    if (myAds.length > 0) {
      console.log("\n11. Taking ad offline...");
      await client.updateP2PAd(accountId, {
        itemId: myAds[0].id,
        status: "2", // offline
      });
      console.log("Ad taken offline!");
    }

    // 12. Get counterparty info (if we have an order)
    if (pendingOrders.length > 0) {
      const order = pendingOrders[0];
      const otherUserId = order.isMaker ? order.userId : order.userId; // This would be the other party's ID
      console.log("\n12. Getting counterparty info...");
      const counterpartyInfo = await client.getCounterpartyInfo(accountId, otherUserId);
      console.log("Counterparty Info:");
      console.log(`  Nickname: ${counterpartyInfo.nickName}`);
      console.log(`  Completed orders: ${counterpartyInfo.completedOrderCount}`);
      console.log(`  Recent execute rate: ${counterpartyInfo.recentExecuteRate}%`);
      console.log("  Payment history:");
      counterpartyInfo.paymentHistory.forEach(history => {
        console.log(`    ${history.payType}: ${history.paymentCount} times, ${history.successRate}% success`);
      });
    }

  } catch (error) {
    console.error("Error:", error);
  }
}

// Helper function to demonstrate order flow
async function handleP2POrderFlow(client: BybitClient, accountId: string, orderId: string) {
  console.log("\n=== P2P Order Flow Example ===");
  
  try {
    // 1. Get order details
    const order = await client.getP2POrderDetail(accountId, orderId);
    console.log(`Order ${orderId}: ${order.side === "1" ? "Selling" : "Buying"} ${order.quantity} ${order.tokenName}`);
    
    // 2. For buyer: Mark as paid
    if (order.side === "0" && order.orderStatus === "10") { // Buyer, waiting for payment
      console.log("Marking order as paid...");
      await client.markP2POrderAsPaid(accountId, orderId);
      console.log("Order marked as paid!");
      
      // Send confirmation message
      await client.sendP2PChatMessage(
        accountId,
        orderId,
        "Payment sent! Please check and release the crypto.",
      );
    }
    
    // 3. For seller: Release crypto
    if (order.side === "1" && order.orderStatus === "20") { // Seller, payment made
      console.log("Releasing crypto...");
      await client.releaseP2POrder(accountId, orderId);
      console.log("Crypto released!");
      
      // Send thank you message
      await client.sendP2PChatMessage(
        accountId,
        orderId,
        "Thank you for the smooth transaction!",
      );
    }
    
    // 4. Check final order status
    const updatedOrder = await client.getP2POrderDetail(accountId, orderId);
    console.log(`Order status: ${updatedOrder.orderStatus}`);
    
  } catch (error) {
    console.error("Error in order flow:", error);
  }
}

// Run the example
if (require.main === module) {
  p2pCompleteExample()
    .then(() => console.log("\nExample completed!"))
    .catch(console.error);
}