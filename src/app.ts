import { db } from "./db";
import { Orchestrator } from "./orchestrator";
import { GateAccountManager } from "./gate";
import { BybitP2PManagerService } from "./services/bybitP2PManager";
import { ChatAutomationService } from "./services/chatAutomation";
import { CheckVerificationService } from "./services/checkVerification";
import { GmailClient } from "./gmail";
import inquirer from "inquirer";
import fs from "fs/promises";
import path from "path";

interface AppContext {
  db: typeof db;
  gateAccountManager: GateAccountManager;
  bybitManager: BybitP2PManagerService;
  chatService: ChatAutomationService;
  checkService: CheckVerificationService;
  gmailClient: GmailClient | null;
  isManualMode: boolean;
}

async function promptUser(message: string): Promise<boolean> {
  const mode = await db.getSetting("mode");
  if (mode !== "manual") return true;

  const response = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message,
      default: true,
    },
  ]);

  return response.proceed;
}

async function main() {
  try {
    console.log("Starting Itrader...");

    // Initialize services
    const gateAccountManager = new GateAccountManager();
    const bybitManager = new BybitP2PManagerService();
    const chatService = new ChatAutomationService(bybitManager);
    
    // Gmail client will be initialized later
    let gmailClient: any = null;
    const checkService = new CheckVerificationService(
      null as any, // Will be set after Gmail initialization
      chatService
    );
    
    console.log("Services initialized successfully");

  const orchestrator = new Orchestrator({
    name: "Itrader",
    context: {
      db,
      gateAccountManager,
      bybitManager,
      chatService,
      checkService,
      gmailClient,
      isManualMode: false,
    } as AppContext,
  });

  // One-time initialization
  orchestrator.addOneTime("init", async (context: AppContext) => {
    console.log("Initializing all accounts...");

    // Initialize Gate accounts
    const gateAccounts = await context.db.getActiveGateAccounts();
    for (const account of gateAccounts) {
      try {
        await context.gateAccountManager.addAccount(
          account.accountId,
          account.email,
          "",
          {
            apiKey: account.apiKey,
            apiSecret: account.apiSecret,
          }
        );
        console.log(`[Init] Added Gate account ${account.accountId}`);
      } catch (error) {
        console.error(`[Init] Failed to add Gate account ${account.accountId}:`, error);
      }
    }

    // Initialize Bybit accounts
    await context.bybitManager.initialize();

    // Initialize Gmail
    const gmailAccount = await context.db.getActiveGmailAccount();
    if (gmailAccount) {
      try {
        // Load credentials
        const credentialsPath = path.join("data", "gmail-credentials.json");
        
        // Check if credentials file exists
        try {
          await fs.access(credentialsPath);
        } catch {
          console.log("[Init] Gmail credentials file not found. Skipping Gmail initialization.");
          return;
        }
        
        const credentialsContent = JSON.parse(await fs.readFile(credentialsPath, 'utf-8'));
        
        // Extract OAuth2 credentials (could be under 'installed' or 'web' key)
        const credentials = credentialsContent.installed || credentialsContent.web || credentialsContent;
        
        // Create OAuth2Manager and client
        const { OAuth2Manager } = await import("./gmail/utils/oauth2");
        const oauth2Manager = new OAuth2Manager(credentials);
        const client = new GmailClient(oauth2Manager);
        
        // Set tokens
        await client.setTokens({ refresh_token: gmailAccount.refreshToken });
        context.gmailClient = client;
        
        // Update check service with Gmail client
        (context.checkService as any).gmailClient = client;
        
        console.log(`[Init] Added Gmail account ${gmailAccount.email}`);
      } catch (error) {
        console.error(`[Init] Failed to initialize Gmail:`, error);
      }
    } else {
      console.log("[Init] No Gmail account configured. Gmail features will be disabled.");
    }

    // Check mode
    const mode = await context.db.getSetting("mode");
    context.isManualMode = mode === "manual";
    console.log(`[Init] Running in ${context.isManualMode ? "manual" : "automatic"} mode`);
  });

  // Task 1: Accept available transactions from Gate
  orchestrator.addTask({
    id: "work_acceptor",
    name: "Accept available transactions with status 4",
    fn: async (context: AppContext) => {
      console.log("[WorkAcceptor] Checking for new payouts...");

      const accounts = await context.gateAccountManager.getAccounts();
      
      for (const account of accounts) {
        const client = context.gateAccountManager.getClient(account.id);
        if (!client) continue;

        try {
          // Get pending transactions (status 4)
          const payouts = await client.getPendingTransactions();
          console.log(`[WorkAcceptor] Found ${payouts.length} pending payouts for ${account.id}`);

          for (const payout of payouts) {
            // Check if already in database
            const existing = await context.db.getPayoutByGatePayoutId(payout.id);
            if (existing) continue;

            if (await promptUser(`Accept payout ${payout.id} for ${payout.totalTrader['643']} RUB?`)) {
              // Accept transaction to show details
              await client.acceptTransaction(payout.id.toString());

              // Save to database
              await context.db.upsertPayoutFromGate(payout as any, account.id);
              console.log(`[WorkAcceptor] Saved payout ${payout.id} to database`);
            }
          }
        } catch (error) {
          console.error(`[WorkAcceptor] Error for account ${account.id}:`, error);
        }
      }
    },
    runOnStart: true,
    interval: 5 * 60 * 1000, // 5 minutes
  });

  // Task 2: Create Bybit advertisements for payouts
  orchestrator.addTask({
    id: "ad_creator",
    name: "Create Bybit advertisements for pending payouts",
    fn: async (context: AppContext) => {
      // Check if there are any pending payouts
      const pendingPayouts = await context.db.getPayoutsWithoutTransaction(4);
      
      if (pendingPayouts.length === 0) {
        return;
      }

      console.log(`[AdCreator] Found ${pendingPayouts.length} payouts without ads`);

      for (const payout of pendingPayouts) {
        try {
          // Check if blacklisted
          if (await context.db.isBlacklisted(payout.wallet)) {
            console.log(`[AdCreator] Wallet ${payout.wallet} is blacklisted, skipping`);
            continue;
          }

          const amount = payout.totalTrader['643'] || 0;
          if (amount <= 0) continue;

          if (await promptUser(`Create ad for payout ${payout.gatePayoutId} (${amount} RUB)?`)) {
            // Determine payment method based on existing ads
            const paymentMethod = Math.random() > 0.5 ? 'SBP' : 'Tinkoff';
            
            // Create advertisement
            const { advertisementId, bybitAccountId } = await context.bybitManager
              .createAdvertisementWithAutoAccount(
                payout.id,
                amount.toString(),
                'RUB',
                paymentMethod
              );

            // Create transaction
            await context.db.createTransaction({
              payoutId: payout.id,
              advertisementId,
              status: 'pending',
            });

            console.log(`[AdCreator] Created ad ${advertisementId} on account ${bybitAccountId}`);
          }
        } catch (error) {
          console.error(`[AdCreator] Error creating ad for payout ${payout.id}:`, error);
        }
      }
    },
    interval: 10 * 1000, // 10 seconds
  });

  // Task 3: Handle chat automation
  orchestrator.addTask({
    id: "ad_listener",
    name: "Process chat messages and automate responses",
    fn: async (context: AppContext) => {
      try {
        // Get active transactions
        const activeTransactions = await context.db.getActiveTransactions();
        
        // Start chat polling for transactions with orders
        for (const transaction of activeTransactions) {
          if (transaction.orderId && transaction.status === 'chat_started') {
            await context.bybitManager.startChatPolling(transaction.id);
          }
        }

        // Process unprocessed messages
        await context.chatService.processUnprocessedMessages();
      } catch (error) {
        console.error("[AdListener] Error:", error);
      }
    },
    interval: 1000, // 1 second
  });

  // Task 4: Check Gmail for payment receipts
  orchestrator.addTask({
    id: "gmail_listener",
    name: "Check Gmail for payment receipts",
    fn: async (context: AppContext) => {
      try {
        await context.checkService.processNewChecks();
      } catch (error) {
        console.error("[GmailListener] Error:", error);
      }
    },
    interval: 10 * 1000, // 10 seconds
  });

  // Task 5: Release funds after 2 minutes
  orchestrator.addTask({
    id: "successer",
    name: "Release funds for completed transactions",
    fn: async (context: AppContext) => {
      try {
        const transactionsToRelease = await context.db.getSuccessfulTransactionsForRelease();
        
        for (const transaction of transactionsToRelease) {
          if (await promptUser(`Release funds for transaction ${transaction.id}?`)) {
            await context.bybitManager.releaseAssets(transaction.id);
            console.log(`[Successer] Released funds for transaction ${transaction.id}`);
          }
        }
      } catch (error) {
        console.error("[Successer] Error:", error);
      }
    },
    interval: 10 * 1000, // 10 seconds
  });

  // Initialize and start orchestrator
  await orchestrator.initialize();
  await orchestrator.start();

  console.log("Orchestrator started successfully!");
  console.log("Press Ctrl+C to stop");

  // Keep the process alive
  const keepAlive = setInterval(() => {
    // This keeps the event loop active
  }, 1000);

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    clearInterval(keepAlive);
    await orchestrator.stop();
    await db.disconnect();
    process.exit(0);
  });

  // Also handle uncaught errors
  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled rejection at:", promise, "reason:", reason);
    process.exit(1);
  });
  } catch (error) {
    console.error("Failed to start Itrader:", error);
    process.exit(1);
  }
}

// Export main for CLI
export default main;

// Check if running directly
if (require.main === module) {
  if (process.argv.includes("--cli")) {
    // Import and run CLI
    import("./cli").then((cli) => {
      cli.runCLI();
    }).catch((error) => {
      console.error("CLI error:", error);
      process.exit(1);
    });
  } else {
    // Run main application
    main().catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
  }
}