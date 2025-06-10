import { db } from "./db";
import { Orchestrator } from "./orchestrator";
import { GateAccountManager } from "./gate";
import { BybitP2PManagerService } from "./services/bybitP2PManager";
import { ChatAutomationService } from "./services/chatAutomation";
import { CheckVerificationService } from "./services/checkVerification";
import { P2POrderProcessor } from "./services/p2pOrderProcessor";
import { ReceiptProcessorService } from "./services/receiptProcessor";
import { ActiveOrdersMonitorService } from "./services/activeOrdersMonitor";
import { InstantOrderMonitorService } from "./services/instantOrderMonitor";
import { GmailClient, GmailManager } from "./gmail";
import { WebSocketServer } from "./webserver";
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
  gmailManager: GmailManager | null;
  orderProcessor: P2POrderProcessor | null;
  receiptProcessor: ReceiptProcessorService | null;
  activeOrdersMonitor: ActiveOrdersMonitorService | null;
  instantOrderMonitor: InstantOrderMonitorService | null;
  isManualMode: boolean;
}

async function promptUser(message: string): Promise<boolean> {
  // Check environment variable first
  if (process.env.MODE === "auto") {
    console.log(
      `[promptUser] Auto mode (env) - automatically accepting: ${message}`,
    );
    return true;
  }

  const mode = await db.getSetting("mode");
  console.log(`[promptUser] Current mode: ${mode}`);

  if (mode !== "manual") {
    console.log(`[promptUser] Auto mode - automatically accepting: ${message}`);
    return true;
  }

  console.log("\n" + "=".repeat(60));
  console.log("🤖 MANUAL MODE - ACTION REQUIRED");
  console.log("=".repeat(60));
  console.log(`\n${message}\n`);

  const response = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "Do you want to proceed?",
      default: true,
    },
  ]);

  console.log("=".repeat(60) + "\n");

  if (!response.proceed) {
    console.log("❌ Action cancelled by user");
  }

  return response.proceed;
}

// Helper to extract context from task context
function getContext(taskContext: any): AppContext {
  return taskContext.shared || taskContext;
}

async function main() {
  try {
    console.log("Starting Itrader...");

    // Initialize services
    const gateAccountManager = new GateAccountManager({
      cookiesDir: "./data/cookies",
    });
    const bybitManager = new BybitP2PManagerService();
    const chatService = new ChatAutomationService(bybitManager);
    // Don't start instantOrderMonitoring here - it will be started after initialization
    // Sync time with Bybit server on startup
    console.log("Synchronizing time with Bybit server...");
    try {
      const { TimeSync } = await import("./bybit/utils/timeSync");
      await TimeSync.forceSync();
      console.log("✓ Time synchronized successfully");
    } catch (error) {
      console.error("⚠️  Time sync failed, continuing anyway:", error);
    }

    // Gmail will be initialized later
    let gmailClient: any = null;
    let gmailManager: any = null;
    let orderProcessor: any = null;
    let receiptProcessor: any = null;
    let activeOrdersMonitor: any = null;
    let instantOrderMonitor: any = null;

    const checkService = new CheckVerificationService(
      null as any, // Will be set after Gmail initialization
      chatService,
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
        gmailManager,
        orderProcessor,
        receiptProcessor,
        activeOrdersMonitor,
        instantOrderMonitor,
        isManualMode: false,
      } as AppContext,
    });

    // One-time initialization
    orchestrator.addOneTime("init", async (taskContext: any) => {
      const context = getContext(taskContext);
      console.log("Initializing all accounts...");

      // Initialize GateAccountManager
      await context.gateAccountManager.initialize();

      // Initialize Gate accounts
      const gateAccounts = await context.db.getActiveGateAccounts();
      for (const account of gateAccounts) {
        try {
          await context.gateAccountManager.addAccount(
            account.email,
            "", // password not needed when using cookies
            false, // don't auto-login
            account.accountId, // pass accountId for cookie lookup
          );
          console.log(`[Init] Added Gate account ${account.accountId}`);

          // Set balance to 10 million RUB on initialization
          try {
            const client = context.gateAccountManager.getClient(account.email);
            if (client) {
              await client.setBalance(10_000_000);
              console.log(
                `[Init] Set balance to 10,000,000 RUB for Gate account ${account.accountId}`,
              );
            }
          } catch (balanceError) {
            console.error(
              `[Init] Failed to set balance for Gate account ${account.accountId}:`,
              balanceError,
            );
          }
        } catch (error) {
          console.error(
            `[Init] Failed to add Gate account ${account.accountId}:`,
            error,
          );
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
            console.log(
              "[Init] Gmail credentials file not found. Skipping Gmail initialization.",
            );
            return;
          }

          const credentialsContent = JSON.parse(
            await fs.readFile(credentialsPath, "utf-8"),
          );

          // Extract OAuth2 credentials (could be under 'installed' or 'web' key)
          const credentials =
            credentialsContent.installed ||
            credentialsContent.web ||
            credentialsContent;

          // Create OAuth2Manager and client
          const { OAuth2Manager } = await import("./gmail/utils/oauth2");
          const oauth2Manager = new OAuth2Manager(credentials);
          const client = new GmailClient(oauth2Manager);

          // Set tokens
          await client.setTokens({ refresh_token: gmailAccount.refreshToken });
          context.gmailClient = client;

          // Create Gmail manager with credentials
          context.gmailManager = new GmailManager({
            tokensDir: "./data/gmail-tokens",
            credentials: credentials,
          });
          await context.gmailManager.initialize();

          // Update check service with Gmail client
          (context.checkService as any).gmailClient = client;

          // Initialize order processor
          context.orderProcessor = new P2POrderProcessor(
            context.bybitManager,
            context.chatService,
            {
              pollingInterval: 10000, // 10 seconds
              maxRetries: 3,
              retryDelay: 5000,
            },
          );

          // Initialize active orders monitor
          context.activeOrdersMonitor = new ActiveOrdersMonitorService(
            context.bybitManager,
          );
          
          // Start active orders monitoring with 10 second interval
          await context.activeOrdersMonitor.startMonitoring(10000);
          console.log("[Init] ActiveOrdersMonitor started with 10s interval");

          // Initialize instant order monitor
          context.instantOrderMonitor = new InstantOrderMonitorService(
            context.bybitManager,
            context.chatService,
          );
          // Start instant monitoring
          await context.instantOrderMonitor.start();
          console.log("[Init] InstantOrderMonitor started");

          // Initialize receipt processor
          // Get first active gate account client
          let gateClient = null;
          if (gateAccounts.length > 0) {
            gateClient = context.gateAccountManager.getClient(
              gateAccounts[0].accountId,
            );
          }

          if (gateClient) {
            context.receiptProcessor = new ReceiptProcessorService(
              context.gmailManager,
              gateClient,
              context.bybitManager,
              {
                checkInterval: 30000, // 30 seconds
                pdfStoragePath: "data/receipts",
              },
            );
          } else {
            console.log(
              "[Init] No Gate client available for receipt processor",
            );
          }

          console.log(`[Init] Added Gmail account ${gmailAccount.email}`);
        } catch (error) {
          console.error(`[Init] Failed to initialize Gmail:`, error);
        }
      } else {
        console.log(
          "[Init] No Gmail account configured. Gmail features will be disabled.",
        );
      }

      // Check mode
      const mode = await context.db.getSetting("mode");
      context.isManualMode = mode === "manual";
      console.log(
        `[Init] Running in ${context.isManualMode ? "manual" : "automatic"} mode`,
      );

      // Mark initialization as complete
      console.log("[Init] Initialization complete!");

      // Now manually trigger the work acceptor for the first time
      console.log("[Init] Triggering initial work acceptor check...");
      try {
        const workAcceptorTask = orchestrator.getTask("work_acceptor");
        if (workAcceptorTask) {
          await workAcceptorTask.fn({
            shared: context,
            taskId: "work_acceptor",
            executionCount: 0,
          });
        }
      } catch (error) {
        console.error("[Init] Error running initial work acceptor:", error);
      }

      // Also trigger ad creator to check for any payouts that need ads
      console.log("[Init] Triggering initial ad creator check...");
      try {
        const adCreatorTask = orchestrator.getTask("ad_creator");
        if (adCreatorTask) {
          await adCreatorTask.fn({
            shared: context,
            taskId: "ad_creator",
            executionCount: 0,
          });
        }
      } catch (error) {
        console.error("[Init] Error running initial ad creator:", error);
      }
    });

    // Task 1: Accept available transactions from Gate
    orchestrator.addTask({
      id: "work_acceptor",
      name: "Accept available transactions with status 4",
      fn: async (taskContext: any) => {
        const context = getContext(taskContext);
        console.log("[WorkAcceptor] Checking for new payouts...");

        const accounts = await context.gateAccountManager.getAccounts();
        console.log(
          `[WorkAcceptor] Found ${accounts.length} Gate accounts to check`,
        );

        for (const account of accounts) {
          console.log(
            `[WorkAcceptor] Processing account ${account.email} (ID: ${account.id})`,
          );
          const client = context.gateAccountManager.getClient(account.id);
          if (!client) {
            console.log(
              `[WorkAcceptor] No client found for account ${account.id}, skipping`,
            );
            continue;
          }

          try {
            // Get pending transactions (status 4)
            console.log(
              `[WorkAcceptor] Fetching pending transactions for ${account.email}...`,
            );
            const payouts = await client.getPendingTransactions();
            console.log(
              `[WorkAcceptor] Found ${payouts.length} pending payouts for ${account.email}`,
            );

            for (const payout of payouts) {
              // For pending transactions, amount is empty array until accepted
              const isAmountHidden =
                Array.isArray(payout.amount) && payout.amount.length === 0;
              const displayAmount = isAmountHidden
                ? "HIDDEN"
                : payout.amount?.trader?.["643"] || "0";

              console.log(
                `[WorkAcceptor] Processing payout ${payout.id} with amount: ${displayAmount} RUB (hidden until accepted: ${isAmountHidden})`,
              );

              // Check if already in database
              const existing = await context.db.getPayoutByGatePayoutId(
                payout.id,
              );
              if (existing) {
                console.log(
                  `[WorkAcceptor] Payout ${payout.id} already exists in database, skipping`,
                );
                continue;
              }

              console.log(`[WorkAcceptor] Payout ${payout.id} is new`);

              // For automatic mode or manual approval
              const shouldAccept = await promptUser(
                `Accept payout ${payout.id}? (Amount will be revealed after accepting)`,
              );

              if (shouldAccept) {
                console.log(
                  `[WorkAcceptor] Accepting transaction ${payout.id} to reveal details...`,
                );

                try {
                  // Accept transaction to reveal full details
                  await client.acceptTransaction(payout.id.toString());
                  console.log(
                    `[WorkAcceptor] Transaction ${payout.id} accepted, fetching updated details...`,
                  );

                  // Get the updated transaction details with revealed amount
                  const updatedPayout = await client.searchTransactionById(
                    payout.id.toString(),
                  );

                  if (updatedPayout) {
                    const revealedAmount =
                      updatedPayout.amount?.trader?.["643"] || 0;
                    console.log(
                      `[WorkAcceptor] Revealed amount for payout ${payout.id}: ${revealedAmount} RUB`,
                    );

                    // Save to database with revealed details
                    await context.db.upsertPayoutFromGate(
                      updatedPayout as any,
                      account.email,
                    );
                    console.log(
                      `[WorkAcceptor] Saved payout ${payout.id} to database with amount ${revealedAmount} RUB`,
                    );
                  } else {
                    console.error(
                      `[WorkAcceptor] Could not fetch updated details for payout ${payout.id}`,
                    );
                    // Still save the original payout data
                    await context.db.upsertPayoutFromGate(
                      payout as any,
                      account.email,
                    );
                  }
                } catch (acceptError) {
                  console.error(
                    `[WorkAcceptor] Error accepting payout ${payout.id}:`,
                    acceptError,
                  );
                }
              } else {
                console.log(`[WorkAcceptor] User rejected payout ${payout.id}`);
              }
            }
          } catch (error) {
            console.error(
              `[WorkAcceptor] Error for account ${account.email}:`,
              error,
            );
            // Log the full error stack trace
            if (error instanceof Error) {
              console.error(`[WorkAcceptor] Error details:`, error.message);
              console.error(`[WorkAcceptor] Stack trace:`, error.stack);
            }
          }
        }
      },
      runOnStart: false, // Don't run immediately, will be triggered after init
      interval: 5 * 60 * 1000, // 5 minutes
    });

    // Task 2: Create Bybit advertisements for payouts
    orchestrator.addTask({
      id: "ad_creator",
      name: "Create Bybit advertisements for accepted payouts",
      fn: async (taskContext: any) => {
        const context = getContext(taskContext);
        console.log(
          "[AdCreator] Checking for payouts without advertisements...",
        );

        // Check if there are any accepted payouts without transactions
        // Gate.io status codes: 4 = pending/accepted, 5 = in progress/accepted, 7 = completed

        const acceptedPayouts =
          await context.db.getPayoutsWithoutTransaction(5);

        console.log(
          `[AdCreator] Found ${acceptedPayouts.length} payouts with status 5 without ads`,
        );

        if (acceptedPayouts.length === 0) {
          // Also check other statuses
          const status5Payouts =
            await context.db.getPayoutsWithoutTransaction(5);
          if (status5Payouts.length > 0) {
            console.log(
              `[AdCreator] Note: Found ${status5Payouts.length} payouts with status 5`,
            );
          }
          return;
        }

        console.log(
          `[AdCreator] Processing ${acceptedPayouts.length} payouts for advertisement creation`,
        );

        for (const payout of acceptedPayouts) {
          try {
            // Check if blacklisted
            if (await context.db.isBlacklisted(payout.wallet)) {
              console.log(
                `[AdCreator] Wallet ${payout.wallet} is blacklisted, skipping`,
              );
              continue;
            }

            const amount = payout.amountTrader["643"] || 0;
            console.log(
              `[AdCreator] Processing payout ${payout.gatePayoutId} with amount ${amount} RUB, wallet: ${payout.wallet}`,
            );

            if (amount <= 0) {
              console.log(
                `[AdCreator] Skipping payout ${payout.gatePayoutId} - amount is zero or negative`,
              );
              continue;
            }

            const shouldCreate = await promptUser(
              `Create ad for payout ${payout.gatePayoutId} (${amount} RUB)?`,
            );

            if (shouldCreate) {
              console.log(
                `[AdCreator] Creating advertisement for payout ${payout.gatePayoutId}...`,
              );

              // Determine payment method based on existing ads
              const paymentMethod = Math.random() > 0.5 ? "SBP" : "Tinkoff";
              console.log(
                `[AdCreator] Selected payment method: ${paymentMethod}`,
              );

              // Create advertisement
              const { advertisementId, bybitAccountId } =
                await context.bybitManager.createAdvertisementWithAutoAccount(
                  payout.id,
                  amount.toString(),
                  "RUB",
                  paymentMethod,
                );

              // Check if we're waiting for accounts to free up
              if (
                advertisementId === "WAITING" &&
                bybitAccountId === "WAITING"
              ) {
                console.log(
                  `[AdCreator] All accounts are full. Waiting for free slots for payout ${payout.gatePayoutId}...`,
                );
                // Don't create a transaction yet, will retry on next iteration
              } else {
                // Create transaction
                await context.db.createTransaction({
                  payoutId: payout.id,
                  advertisementId,
                  status: "pending",
                });

                console.log(
                  `[AdCreator] ✓ Created ad ${advertisementId} on account ${bybitAccountId} for payout ${payout.gatePayoutId}`,
                );
              }
            } else {
              console.log(
                `[AdCreator] User declined to create ad for payout ${payout.gatePayoutId}`,
              );
            }
          } catch (error) {
            console.error(
              `[AdCreator] Error creating ad for payout ${payout.id}:`,
              error,
            );
          }
        }
      },
      interval: 10 * 1000, // 10 seconds
    });

    // Task 3.5: Process receipts
    orchestrator.addTask({
      id: "receipt_processor",
      name: "Process email receipts",
      fn: async (taskContext: any) => {
        const context = getContext(taskContext);
        if (!context.receiptProcessor) {
          return;
        }

        try {
          // Receipt processor runs its own polling loop
          if (!context.receiptProcessor.isRunning) {
            await context.receiptProcessor.start();
          }
        } catch (error) {
          console.error("[ReceiptProcessor] Error:", error);
        }
      },
      runOnStart: true,
      interval: 60 * 60 * 1000, // Check every hour if still running
    });

    // Task 3.6: Process chat messages - handled by instant monitor now
    orchestrator.addTask({
      id: "chat_processor",
      name: "Process chat messages",
      fn: async (taskContext: any) => {
        const context = getContext(taskContext);

        try {
          // Still process unprocessed messages in case instant monitor misses any
          await context.chatService.processUnprocessedMessages();
        } catch (error) {
          console.error("[ChatProcessor] Error:", error);
        }
      },
      runOnStart: true,
      interval: 5 * 1000, // Process every 5 seconds as backup
    });

    // Task 3.7: Check for active orders periodically
    orchestrator.addTask({
      id: "order_checker",
      name: "Check for active Bybit orders",
      fn: async (taskContext: any) => {
        const context = getContext(taskContext);
        
        // Skip if bybitManager is not initialized
        if (!context.bybitManager) {
          return;
        }
        
        console.log("\n[OrderChecker] ========= CHECKING ORDERS =========");
        console.log(`[OrderChecker] Time: ${new Date().toLocaleString()}`);

        try {
          const accounts = await context.bybitManager.getActiveAccounts();
          
          // Skip if no accounts
          if (accounts.length === 0) {
            console.log("[OrderChecker] No Bybit accounts available yet");
            return;
          }
          let totalActiveOrders = 0;
          
          for (const account of accounts) {
            const client = context.bybitManager.getClient(account.accountId);
            if (!client) continue;
            
            console.log(`\n[OrderChecker] 📋 Checking account: ${account.accountId}`);
            
            // Get all orders
            const ordersResult = await client.getOrdersSimplified({
              page: 1,
              size: 20,
            });
            
            console.log(`   Found ${ordersResult.count} total orders`);
            
            if (ordersResult.items && ordersResult.items.length > 0) {
              // Count active orders
              const activeOrders = ordersResult.items.filter(
                (order: any) => order.status === 10 || order.status === 20
              );
              
              totalActiveOrders += activeOrders.length;
              
              if (activeOrders.length > 0) {
                console.log(`   ✅ Active orders: ${activeOrders.length}`);
                
                // Process each active order
                for (const order of activeOrders) {
                  console.log(`\n   📦 Order: ${order.id}`);
                  console.log(`      Status: ${order.status} (${order.status === 10 ? 'Payment in processing' : 'Waiting for coin transfer'})`);
                  console.log(`      Amount: ${order.amount} ${order.currencyId}`);
                  console.log(`      Counterparty: ${order.targetNickName}`);
                  
                  // Get chat messages for this order
                  const chatResponse = await client.getChatMessages(order.id, 1, 10);
                  
                  let messages = [];
                  if (Array.isArray(chatResponse)) {
                    messages = chatResponse;
                  } else if (chatResponse && chatResponse.list) {
                    messages = chatResponse.list;
                  } else if (chatResponse && chatResponse.result) {
                    messages = chatResponse.result;
                  }
                  
                  console.log(`      📨 Found ${messages.length} chat messages`);
                  
                  // Check who sent messages
                  const ourMessages = messages.filter((msg: any) => msg.userId === order.userId);
                  const theirMessages = messages.filter((msg: any) => msg.userId !== order.userId);
                  
                  console.log(`      📊 Our: ${ourMessages.length}, Their: ${theirMessages.length}`);
                  
                  // Debug: show message details
                  if (messages.length > 0) {
                    console.log(`      🔍 Order userId: ${order.userId}`);
                    messages.slice(0, 3).forEach((msg: any, idx: number) => {
                      console.log(`      Message ${idx + 1}: userId=${msg.userId}, nickName=${msg.nickName}, text="${msg.message?.substring(0, 50)}..."`);
                    });
                  }
                  
                  if (messages.length > 0) {
                    const latestMsg = messages[0];
                    console.log(`      💬 Latest: "${latestMsg.message?.substring(0, 60)}..."`);
                  }
                  
                  // Check if we have a transaction for this order
                  let transaction = await context.db.getTransactionByOrderId(order.id);
                  
                  if (!transaction) {
                    console.log(`      ⚠️ No transaction found - creating...`);
                    
                    // Try to find advertisement
                    const ads = await context.db.getAdvertisements();
                    let ad = ads.find(a => a.bybitAdId === order.itemId);
                    
                    if (!ad) {
                      // Create minimal advertisement
                      ad = await context.db.createAdvertisement({
                        bybitAdId: order.itemId || `temp_${order.id}`,
                        bybitAccountId: account.id,
                        side: order.side === 1 ? "SELL" : "BUY",
                        asset: order.tokenId || "USDT",
                        fiatCurrency: order.currencyId || "RUB",
                        price: order.price || "0",
                        quantity: order.notifyTokenQuantity || "0",
                        minOrderAmount: "100",
                        maxOrderAmount: order.amount || "10000",
                        paymentMethod: "Bank Transfer",
                        status: "ONLINE",
                      });
                      console.log(`      ✅ Created advertisement ${ad.id}`);
                    }
                    
                    // Find or create payout
                    let payout = await context.db.prisma.payout.findFirst({
                      where: { status: 5 },
                      orderBy: { createdAt: 'desc' },
                    });
                    
                    if (!payout) {
                      const amount = parseFloat(order.amount || "0");
                      payout = await context.db.prisma.payout.create({
                        data: {
                          status: 5,
                          amount: amount,
                          amountTrader: JSON.stringify({ "643": amount }),
                          totalTrader: JSON.stringify({ "643": amount }),
                          wallet: order.targetNickName || "temp",
                          recipientCard: order.targetNickName || "temp",
                          gateAccount: account.accountId,
                        },
                      });
                    }
                    
                    // Create transaction
                    transaction = await context.db.createTransaction({
                      payoutId: payout.id,
                      advertisementId: ad.id,
                      status: order.status === 10 ? "chat_started" : "waiting_payment",
                    });
                    
                    await context.db.updateTransaction(transaction.id, {
                      orderId: order.id,
                    });
                    
                    console.log(`      ✅ Created transaction ${transaction.id}`);
                  } else {
                    console.log(`      ✅ Transaction exists: ${transaction.id}`);
                  }
                  
                  // Skip if transaction is marked as stupid
                  if (transaction.status === "stupid") {
                    console.log(`      ⚠️ Skipping order - marked as stupid`);
                    continue;
                  }
                  
                  // Check if we already have messages in database
                  const dbMessages = await context.db.getChatMessages(transaction.id);
                  const ourDbMessages = dbMessages.filter(msg => msg.sender === "us");
                  
                  // Save their messages to database
                  for (const msg of theirMessages) {
                    const existingMsg = await context.db.getChatMessageByMessageId(msg.id);
                    if (!existingMsg) {
                      await context.db.createChatMessage({
                        transactionId: transaction.id,
                        messageId: msg.id,
                        sender: "them",
                        content: msg.message || "",
                        messageType: msg.contentType === "pic" ? "IMAGE" : "TEXT",
                        sentAt: new Date(parseInt(msg.createDate)),
                        isProcessed: false,
                      });
                      console.log(`      💾 Saved their message: "${msg.message?.substring(0, 50)}..."`);
                    }
                  }
                  
                  // If no messages from us (both API and DB) and order is active, send initial message
                  if (ourMessages.length === 0 && ourDbMessages.length === 0 && order.status === 10) {
                    console.log(`      🤖 No messages from us - sending initial message...`);
                    
                    try {
                      await context.chatService.startAutomation(transaction.id);
                      console.log(`      ✅ Chat automation started!`);
                    } catch (error) {
                      console.error(`      ❌ Failed to start chat automation:`, error);
                    }
                  } else if (ourMessages.length > 0 || ourDbMessages.length > 0) {
                    console.log(`      ✅ We already sent messages (API: ${ourMessages.length}, DB: ${ourDbMessages.length})`);
                  }
                }
              }
            }
          }
          
          console.log(`\n[OrderChecker] Total active orders found: ${totalActiveOrders}`);
          console.log("[OrderChecker] ==========================================\n");
          
        } catch (error) {
          console.error("[OrderChecker] Error:", error);
        }
      },
      runOnStart: true,
      interval: 3 * 1000, // Check every 3 seconds for faster response
    });

    // Task 3.8: Aggressive chat monitor for active orders
    orchestrator.addTask({
      id: "chat_monitor",
      name: "Monitor chats for active orders",
      fn: async (taskContext: any) => {
        const context = getContext(taskContext);
        
        // Skip if not initialized
        if (!context.bybitManager || !context.db) {
          return;
        }
        
        try {
          const accounts = await context.bybitManager.getActiveAccounts();
          
          if (accounts.length === 0) {
            return;
          }
          
          for (const account of accounts) {
            const client = context.bybitManager.getClient(account.accountId);
            if (!client) continue;
            
            // Get active orders
            const ordersResult = await client.getOrdersSimplified({
              page: 1,
              size: 20,
              status: 10, // Only payment in processing
            });
            
            if (ordersResult.items && ordersResult.items.length > 0) {
              for (const order of ordersResult.items) {
                // Get chat messages
                try {
                  const chatResponse = await client.getChatMessages(order.id, 1, 5);
                  
                  let messages = [];
                  if (Array.isArray(chatResponse)) {
                    messages = chatResponse;
                  } else if (chatResponse && chatResponse.list) {
                    messages = chatResponse.list;
                  } else if (chatResponse && chatResponse.result) {
                    messages = chatResponse.result;
                  }
                  
                  // Check if we sent any messages
                  const ourMessages = messages.filter((msg: any) => msg.userId === order.userId);
                  
                  // Also check database for sent messages
                  let existingTransaction = await context.db.getTransactionByOrderId(order.id);
                  if (existingTransaction) {
                    // Skip if transaction is marked as stupid
                    if (existingTransaction.status === "stupid") {
                      continue;
                    }
                    
                    const dbMessages = await context.db.getChatMessages(existingTransaction.id);
                    const ourDbMessages = dbMessages.filter(msg => msg.sender === "us");
                    if (ourDbMessages.length > 0) {
                      continue; // Skip if we already sent messages
                    }
                  }
                  
                  if (ourMessages.length === 0 && order.status === 10) {
                    console.log(`\n[ChatMonitor] 🆕 Order ${order.id} needs initial message`);
                    console.log(`[ChatMonitor] Amount: ${order.amount} ${order.currencyId}`);
                    console.log(`[ChatMonitor] Counterparty: ${order.targetNickName}`);
                    
                    // Create minimal transaction if needed
                    let transaction = existingTransaction;
                    
                    if (!transaction) {
                      // Quick create transaction
                      const ads = await context.db.getAdvertisements();
                      let ad = ads.find(a => a.bybitAdId === order.itemId);
                      
                      if (!ad) {
                        ad = await context.db.createAdvertisement({
                          bybitAdId: order.itemId || `temp_${order.id}`,
                          bybitAccountId: account.id,
                          side: "SELL",
                          asset: "USDT",
                          fiatCurrency: "RUB",
                          price: order.price || "0",
                          quantity: order.notifyTokenQuantity || "0",
                          minOrderAmount: "100",
                          maxOrderAmount: order.amount || "10000",
                          paymentMethod: "Bank Transfer",
                          status: "ONLINE",
                        });
                      }
                      
                      // Get any payout
                      const payouts = await context.db.prisma.payout.findFirst({
                        where: { status: 5 },
                      });
                      
                      let payoutId = payouts?.id;
                      if (!payoutId) {
                        const amount = parseFloat(order.amount || "0");
                        const payout = await context.db.prisma.payout.create({
                          data: {
                            status: 5,
                            amount: amount,
                            amountTrader: JSON.stringify({ "643": amount }),
                            totalTrader: JSON.stringify({ "643": amount }),
                            wallet: order.targetNickName || "temp",
                            recipientCard: order.targetNickName || "temp",
                            gateAccount: account.accountId,
                          },
                        });
                        payoutId = payout.id;
                      }
                      
                      transaction = await context.db.createTransaction({
                        payoutId: payoutId,
                        advertisementId: ad.id,
                        status: "chat_started",
                      });
                      
                      await context.db.updateTransaction(transaction.id, {
                        orderId: order.id,
                      });
                    }
                    
                    // Start chat automation instead of sending directly
                    try {
                      await context.chatService.startAutomation(transaction.id);
                      console.log(`[ChatMonitor] ✅ Started chat automation for order ${order.id}`);
                    } catch (error) {
                      console.error(`[ChatMonitor] Failed to start automation:`, error);
                    }
                  }
                } catch (error) {
                  // Silent fail for individual orders
                }
              }
            }
          }
        } catch (error) {
          // Silent fail
        }
      },
      runOnStart: true,
      interval: 1 * 1000, // Check every second
    });

    // Task 4.5: Process incoming chat messages
    orchestrator.addTask({
      id: "chat_processor",
      name: "Process incoming chat messages",
      fn: async (taskContext: any) => {
        const context = getContext(taskContext);
        try {
          // Process unprocessed messages
          await context.chatService.processUnprocessedMessages();
        } catch (error) {
          console.error("[ChatProcessor] Error:", error);
        }
      },
      runOnStart: true,
      interval: 2 * 1000, // Check every 2 seconds
    });

    // Task 5: Handle failed/stuck transactions
    orchestrator.addTask({
      id: "successer",
      name: "Handle failed or stuck transactions",
      fn: async (taskContext: any) => {
        const context = getContext(taskContext);
        try {
          // Check for stuck transactions (no activity for 30 minutes)
          const stuckTransactions = await context.db.getStuckTransactions();

          for (const transaction of stuckTransactions) {
            console.log(
              `[Successer] Found stuck transaction ${transaction.id}`,
            );

            if (
              await promptUser(`Mark transaction ${transaction.id} as failed?`)
            ) {
              await context.db.updateTransaction(transaction.id, {
                status: "failed",
                failureReason: "Transaction stuck - no activity for 30 minutes",
              });
            }
          }
        } catch (error) {
          console.error("[Successer] Error:", error);
        }
      },
      interval: 5 * 60 * 1000, // 5 minutes
    });

    // Task 6: set gate balance 10m every 4 hours and from started
    orchestrator.addTask({
      id: "gate_balance_setter",
      name: "Set Gate balance to 10m every 4 hours",
      fn: async (taskContext: any) => {
        const context = getContext(taskContext);
        console.log(
          "[GateBalanceSetter] Setting balance to 10m for all Gate accounts...",
        );

        const accounts = await context.gateAccountManager.getAccounts();

        for (const account of accounts) {
          const client = context.gateAccountManager.getClient(account.id);
          if (!client) continue;

          try {
            if (
              await promptUser(
                `Set balance to 10,000,000 for Gate account ${account.id}?`,
              )
            ) {
              await client.setBalance(10_000_000);
              console.log(
                `[GateBalanceSetter] Set balance to 10m for account ${account.id}`,
              );
            }
          } catch (error) {
            console.error(
              `[GateBalanceSetter] Error setting balance for account ${account.email}:`,
              error,
            );
          }
        }
      },
      runOnStart: true,
      interval: 4 * 60 * 60 * 1000, // 4 hours
    });

    // Initialize and start orchestrator
    await orchestrator.initialize();
    await orchestrator.start();

    console.log("Orchestrator started successfully!");

    // Start WebSocket server
    const webSocketPort = parseInt(process.env.WEBSOCKET_PORT || "3001");
    const webSocketServer = new WebSocketServer(webSocketPort);
    await webSocketServer.start();
    console.log(`WebSocket server started on port ${webSocketPort}`);

    console.log("Press Ctrl+C to stop");

    // Keep the process alive
    const keepAlive = setInterval(() => {
      // This keeps the event loop active
    }, 1000);

    // Handle graceful shutdown
    let isShuttingDown = false;
    const shutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`\nReceived ${signal}, shutting down gracefully...`);
      clearInterval(keepAlive);

      try {
        await orchestrator.stop();

        // Stop order processor
        if (orchestrator.context.orderProcessor) {
          orchestrator.context.orderProcessor.stop();
        }

        // Stop receipt processor
        if (orchestrator.context.receiptProcessor) {
          orchestrator.context.receiptProcessor.stop();
        }

        // Stop active orders monitor
        if (orchestrator.context.activeOrdersMonitor) {
          await orchestrator.context.activeOrdersMonitor.cleanup();
        }

        // Stop instant order monitor
        if (orchestrator.context.instantOrderMonitor) {
          orchestrator.context.instantOrderMonitor.stop();
        }

        // Stop WebSocket server
        await webSocketServer.stop();

        await db.disconnect();
        console.log("Shutdown complete");
        process.exit(0);
      } catch (error) {
        console.error("Error during shutdown:", error);
        process.exit(1);
      }
    };

    // Ensure proper signal handling
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    // Handle Windows CTRL+C
    if (process.platform === "win32") {
      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.on("SIGINT", () => {
        process.emit("SIGINT" as any);
      });
    }

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
    import("./cli")
      .then((cli) => {
        cli.runCLI();
      })
      .catch((error) => {
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
