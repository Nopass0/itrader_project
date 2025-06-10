#!/usr/bin/env bun
import { BybitP2PManagerService } from './src/services/bybitP2PManager';
import { TimeSync } from './src/bybit/utils/timeSync';

async function main() {
  console.log('🔍 Finding active orders...\n');

  try {
    // Force time sync
    console.log('🕐 Synchronizing time...');
    await TimeSync.forceSync(false);
    console.log(`Time offset: ${TimeSync.getOffset()}ms\n`);

    // Initialize services
    const bybitManager = new BybitP2PManagerService();
    await bybitManager.initialize();
    
    const accounts = await bybitManager.getActiveAccounts();
    console.log(`Found ${accounts.length} active Bybit accounts\n`);

    for (const account of accounts) {
      console.log(`\n📋 Checking account: ${account.accountId}`);
      
      try {
        const client = bybitManager.getClient(account.accountId);
        const httpClient = (client as any).httpClient;
        
        // Method 1: Get all orders
        console.log('\n🔄 Method 1: Getting all orders...');
        try {
          const allOrdersResponse = await httpClient.post('/v5/p2p/order/simplifyList', {
            status: null,
            beginTime: null,
            endTime: null,
            tokenId: null,
            side: null,
            page: 1,
            size: 50
          });
          
          console.log(`Response:`, JSON.stringify(allOrdersResponse.result, null, 2));
          
          if (allOrdersResponse.result?.items && allOrdersResponse.result.items.length > 0) {
            console.log(`\nFound ${allOrdersResponse.result.items.length} orders!`);
            
            for (const order of allOrdersResponse.result.items) {
              console.log(`\nOrder ID: ${order.id}`);
              console.log(`Status: ${order.status}`);
              console.log(`Amount: ${order.amount} ${order.currencyId}`);
              console.log(`Side: ${order.side === 0 ? 'BUY' : 'SELL'}`);
              
              if (order.status === 10 || order.status === 20) {
                console.log(`✅ This is an ACTIVE order!`);
              }
            }
          }
        } catch (error) {
          console.error('Method 1 error:', error);
        }
        
        // Method 2: Get pending orders
        console.log('\n\n🔄 Method 2: Getting pending orders...');
        try {
          const pendingResponse = await httpClient.post('/v5/p2p/order/pending/simplifyList', {
            status: null,
            beginTime: null,
            endTime: null,
            tokenId: null,
            side: null,
            page: 1,
            size: 50
          });
          
          console.log(`Response:`, JSON.stringify(pendingResponse.result, null, 2));
          
          if (pendingResponse.result?.items && pendingResponse.result.items.length > 0) {
            console.log(`\nFound ${pendingResponse.result.items.length} pending orders!`);
            
            for (const order of pendingResponse.result.items) {
              console.log(`\nOrder ID: ${order.id}`);
              console.log(`Status: ${order.status}`);
              console.log(`Amount: ${order.amount} ${order.currencyId}`);
            }
          }
        } catch (error) {
          console.error('Method 2 error:', error);
        }
        
        // Method 3: Try with different parameters
        console.log('\n\n🔄 Method 3: Getting orders with status filter...');
        try {
          // Try status 10
          const status10Response = await httpClient.post('/v5/p2p/order/simplifyList', {
            status: 10,
            beginTime: null,
            endTime: null,
            tokenId: null,
            side: null,
            page: 1,
            size: 50
          });
          
          console.log(`Status 10 response:`, JSON.stringify(status10Response.result, null, 2));
        } catch (error) {
          console.error('Status 10 error:', error);
        }
        
      } catch (error: any) {
        console.error(`Error checking account:`, error.message);
      }
    }
    
    console.log('\n✅ Search complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main().catch(console.error);