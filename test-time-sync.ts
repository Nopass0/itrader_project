import { TimeSync } from './src/bybit/utils/timeSync';

async function main() {
  console.log('🕐 Testing time synchronization with Bybit...\n');

  try {
    // Get current local time
    const localTime = new Date();
    console.log(`Local time: ${localTime.toISOString()}`);
    console.log(`Local timestamp: ${Date.now()}`);

    // Force time sync
    console.log('\n🔄 Forcing time synchronization...');
    await TimeSync.forceSync(false);

    // Check sync status
    console.log('\nSync status:', {
      isSynchronized: TimeSync.isSynchronized(),
      offset: TimeSync.getOffset(),
      lastSync: TimeSync.getLastSyncTime()
    });

    // Test synchronized time
    const syncedTime = TimeSync.getSynchronizedTimestamp();
    console.log(`\nSynchronized timestamp: ${syncedTime}`);
    console.log(`Difference from local: ${syncedTime - Date.now()}ms`);

    // Get server time directly
    console.log('\n📡 Getting server time from Bybit...');
    const response = await fetch('https://api.bybit.com/v5/market/time');
    const data = await response.json();
    
    if (data.result) {
      const serverTime = parseInt(data.result.timeSecond) * 1000;
      console.log(`Server timestamp: ${serverTime}`);
      console.log(`Server time: ${new Date(serverTime).toISOString()}`);
      console.log(`Local vs Server difference: ${Date.now() - serverTime}ms`);
    }

    console.log('\n✅ Time sync test complete!');
    console.log('\nIf the difference is more than 5000ms, you may need to:');
    console.log('1. Sync your system clock with an NTP server');
    console.log('2. Check your timezone settings');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main().catch(console.error);