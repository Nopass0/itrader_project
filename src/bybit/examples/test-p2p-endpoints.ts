import { BybitClient } from '../client';

async function testP2PEndpoints() {
  try {
    // Initialize client with your credentials
    const client = new BybitClient({
      accounts: [
        {
          id: 'testAccount',
          apiKey: process.env.BYBIT_API_KEY || '',
          apiSecret: process.env.BYBIT_API_SECRET || '',
          isTestnet: false,
        },
      ],
    });

    console.log('Testing Bybit P2P Endpoints...\n');

    // Test 1: Get Account Info
    console.log('1. Testing Account Info endpoint...');
    try {
      const accountInfo = await client.p2p.getAccountInfo('testAccount');
      console.log('✓ Account Info retrieved successfully');
      console.log(`  - Nickname: ${accountInfo.nickName}`);
      console.log(`  - KYC Level: ${accountInfo.kycLevel}`);
      console.log(`  - User ID: ${accountInfo.userId}\n`);
    } catch (error: any) {
      console.error('✗ Account Info failed:', error.message, '\n');
    }

    // Test 2: Get P2P Balance
    console.log('2. Testing P2P Balance endpoint...');
    try {
      const balances = await client.p2p.getP2PBalance('testAccount');
      console.log('✓ P2P Balance retrieved successfully');
      if (balances.length > 0) {
        balances.forEach(balance => {
          console.log(`  - ${balance.coin}: ${balance.free} (available)`);
        });
      } else {
        console.log('  - No balances found');
      }
      console.log('');
    } catch (error: any) {
      console.error('✗ P2P Balance failed:', error.message, '\n');
    }

    // Test 3: Get Online Ads
    console.log('3. Testing Online Ads endpoint...');
    try {
      const ads = await client.p2p.getActiveAdvertisements('testAccount');
      console.log('✓ Online Ads retrieved successfully');
      console.log(`  - Found ${ads.length} ads\n`);
    } catch (error: any) {
      console.error('✗ Online Ads failed:', error.message, '\n');
    }

    // Test 4: Get Orders
    console.log('4. Testing Orders endpoint...');
    try {
      const orders = await client.p2p.getOrders('testAccount');
      console.log('✓ Orders retrieved successfully');
      console.log(`  - Found ${orders.length} orders\n`);
    } catch (error: any) {
      console.error('✗ Orders failed:', error.message, '\n');
    }

    // Test 5: Get Payment Methods
    console.log('5. Testing Payment Methods endpoint...');
    try {
      const paymentMethods = await client.p2p.getPaymentMethods('testAccount');
      console.log('✓ Payment Methods retrieved successfully');
      console.log(`  - Found ${paymentMethods.length} payment methods`);
      paymentMethods.forEach(method => {
        console.log(`    - ${method.type}: ${method.accountName} (${method.accountNumber})`);
      });
    } catch (error: any) {
      console.error('✗ Payment Methods failed:', error.message, '\n');
    }

    console.log('\nTesting completed!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testP2PEndpoints();