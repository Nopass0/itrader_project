#!/usr/bin/env bun

import { P2PClient } from "./src/bybit";
import { db } from "./src/db";

async function testBybitConnection() {
  console.log("Testing Bybit connection...\n");
  
  try {
    // Get Bybit account from database
    const accounts = await db.getActiveBybitAccounts();
    if (accounts.length === 0) {
      console.log("No active Bybit accounts found in database");
      return;
    }
    
    const account = accounts[0];
    console.log(`Testing with account: ${account.accountId}`);
    
    // Create client with debug mode
    const client = new P2PClient({
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
      testnet: false,
      debugMode: true
    });
    
    // Test connection
    console.log("\nTesting connection...");
    await client.connect();
    
    console.log("\n✅ Connection successful!");
    
    // Test getting account info
    console.log("\nGetting account info...");
    const info = await client.getAccountInfo();
    console.log("Account info:", JSON.stringify(info, null, 2));
    
  } catch (error) {
    console.error("\n❌ Connection failed:", error);
  } finally {
    await db.disconnect();
  }
}

testBybitConnection();