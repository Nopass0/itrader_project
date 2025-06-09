#!/usr/bin/env bun
import { PrismaClient } from './generated/prisma';
import { BybitP2PManagerService } from './src/services/bybitP2PManager';
import { ChatAutomationService } from './src/services/chatAutomation';
import { ActiveOrdersMonitorService } from './src/services/activeOrdersMonitor';
import { TimeSync } from './src/bybit/utils/timeSync';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting P2P automation...\n');

  try {
    // Force time sync
    console.log('🕐 Synchronizing time...');
    await TimeSync.forceSync(false);
    console.log(`Time offset: ${TimeSync.getOffset()}ms\n`);

    // Initialize services
    const bybitManager = new BybitP2PManagerService();
    await bybitManager.initialize();
    
    const activeOrdersMonitor = new ActiveOrdersMonitorService(bybitManager);
    
    console.log('✅ Services initialized successfully\n');
    
    // Set up event listeners
    activeOrdersMonitor.on('orderProcessed', (data) => {
      console.log(`\n✅ Order processed: ${data.orderId} (Status: ${data.status})`);
    });
    
    activeOrdersMonitor.on('error', (error) => {
      console.error('\n❌ Monitor error:', error);
    });
    
    // Start monitoring
    console.log('🔄 Starting active orders monitoring...');
    console.log('   - Checking for active orders every 30 seconds');
    console.log('   - Syncing chat messages automatically');
    console.log('   - Processing unprocessed messages');
    console.log('   - Sending automated responses\n');
    
    await activeOrdersMonitor.startMonitoring(30000); // Check every 30 seconds
    
    console.log('✅ Monitoring started successfully!');
    console.log('Press Ctrl+C to stop\n');
    
    // Keep the process alive
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Stopping automation...');
      await activeOrdersMonitor.cleanup();
      await prisma.$disconnect();
      console.log('✅ Shutdown complete');
      process.exit(0);
    });
    
    // Keep running
    await new Promise(() => {});
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main().catch(console.error);