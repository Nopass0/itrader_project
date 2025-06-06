import { BybitClient } from '../client';

async function basicExample() {
  const client = new BybitClient();

  const accountId1 = client.addAccount(
    'your-api-key-1',
    'your-api-secret-1',
    true,
    'Test Account 1'
  );

  const accountId2 = client.addAccount(
    'your-api-key-2',
    'your-api-secret-2',
    false,
    'Main Account'
  );

  console.log('Added accounts:', client.getAllAccounts());

  try {
    const balances = await client.getAllBalances();
    console.log('All account balances:', balances);

    const p2pBalance = await client.getP2PBalance(accountId1);
    console.log('P2P Balance for account 1:', p2pBalance);

    const activeAds = await client.getActiveAdvertisements(accountId1);
    console.log('Active advertisements:', activeAds);

    const paymentMethods = await client.getPaymentMethods(accountId1);
    console.log('Payment methods:', paymentMethods);

    const newAd = await client.createSellAdvertisement({
      accountId: accountId1,
      price: '100.50',
      minTransactionAmount: 20000
    });
    console.log('Created new advertisement:', newAd);

    const orders = await client.getOrders(accountId1);
    console.log('Orders:', orders);

  } catch (error) {
    console.error('Error:', error);
  }
}

basicExample();