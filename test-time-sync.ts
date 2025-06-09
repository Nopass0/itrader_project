#!/usr/bin/env bun

import { TimeSync } from "./src/bybit/utils/timeSync";

async function testTimeSync() {
  console.log("Testing Bybit Time Synchronization...\n");
  
  // Show current system time
  const localTime = new Date();
  console.log(`Local system time: ${localTime.toISOString()}`);
  console.log(`Local timestamp: ${Date.now()}`);
  
  try {
    // Sync with Bybit server
    console.log("\nSynchronizing with Bybit server...");
    await TimeSync.forceSync();
    
    // Show synchronized time
    const syncedTimestamp = TimeSync.getTimestamp();
    const syncedTime = new Date(parseInt(syncedTimestamp));
    console.log(`\nSynchronized timestamp: ${syncedTimestamp}`);
    console.log(`Synchronized time: ${syncedTime.toISOString()}`);
    
    // Show offset
    const offset = TimeSync.getOffset();
    console.log(`\nTime offset: ${offset}ms`);
    console.log(`Time offset: ${(offset / 1000 / 60).toFixed(2)} minutes`);
    console.log(`Time offset: ${(offset / 1000 / 60 / 60).toFixed(2)} hours`);
    
    if (Math.abs(offset) > 60000) {
      console.log("\n⚠️  WARNING: Large time offset detected!");
      console.log("Your system time appears to be significantly different from the server time.");
    } else {
      console.log("\n✅ Time synchronization successful!");
    }
    
  } catch (error) {
    console.error("\n❌ Time synchronization failed:", error);
  }
}

testTimeSync();