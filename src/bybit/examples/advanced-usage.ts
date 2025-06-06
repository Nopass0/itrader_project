import { BybitClient } from '../client';

async function advancedExample() {
  const client = new BybitClient();

  const testAccount = client.addAccount(
    process.env.BYBIT_TEST_API_KEY!,
    process.env.BYBIT_TEST_API_SECRET!,
    true,
    'Testnet Account'
  );

  const mainAccount = client.addAccount(
    process.env.BYBIT_API_KEY!,
    process.env.BYBIT_API_SECRET!,
    false,
    'Production Account'
  );

  try {
    const allActiveAds = await client.getAllActiveAdvertisements();
    
    for (const [accountId, ads] of allActiveAds) {
      console.log(`\nAccount ${accountId} has ${ads.length} advertisements:`);
      
      for (const ad of ads) {
        console.log(`- Ad ${ad.advId}: ${ad.status}, Has Orders: ${ad.hasOrders}`);
        
        if (ad.hasOrders) {
          const orders = await client.getOrders(accountId, '10,20,30');
          
          for (const order of orders.filter(o => o.advId === ad.advId)) {
            console.log(`  Order ${order.orderId}: ${order.status}`);
            
            const messages = await client.getOrderMessages(accountId, order.orderId);
            console.log(`  Messages: ${messages.length}`);
            
            if (order.status === 'Processing') {
              await client.sendOrderMessage(
                accountId, 
                order.orderId, 
                'Payment received, will release soon'
              );
              
              await client.releaseOrder(accountId, order.orderId);
              console.log(`  Released order ${order.orderId}`);
            }
          }
        }
      }
    }

    const canCreateAd = async (accountId: string) => {
      const ads = await client.getActiveAdvertisements(accountId);
      const activeCount = ads.filter(ad => ad.status === 'Active').length;
      return activeCount < 2;
    };

    for (const account of client.getAllAccounts()) {
      if (await canCreateAd(account.id)) {
        try {
          const newAd = await client.createSellAdvertisement({
            accountId: account.id,
            price: '98.75',
            minTransactionAmount: 15000
          });
          console.log(`\nCreated new ad for account ${account.label}:`, newAd.advId);
        } catch (error) {
          console.error(`Failed to create ad for ${account.label}:`, error);
        }
      } else {
        console.log(`\nAccount ${account.label} already has 2 active advertisements`);
      }
    }

    const allOrders = await client.getAllOrders();
    console.log('\nAll orders summary:');
    for (const [accountId, orders] of allOrders) {
      const account = client.getAccount(accountId);
      console.log(`${account?.label}: ${orders.length} orders`);
    }

  } catch (error) {
    console.error('Error in advanced example:', error);
  }
}

advancedExample();