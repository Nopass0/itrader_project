/**
 * CLI for Itrader account management
 */

import inquirer from "inquirer";
import { db } from "./db";
import { GateClient } from "./gate/client";
import { RateLimiter } from "./gate/utils/rateLimiter";
import { P2PClient } from "./bybit";
import { GmailClient } from "./gmail";
import fs from "fs/promises";
import path from "path";

interface CLIContext {
  running: boolean;
}

export async function runCLI() {
  console.log("Welcome to Itrader CLI");
  console.log("=".repeat(50));

  const context: CLIContext = { running: true };

  while (context.running) {
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "Manage Gate accounts", value: "gate" },
          { name: "Manage Bybit accounts", value: "bybit" },
          { name: "Manage Gmail account", value: "gmail" },
          { name: "Switch mode (Manual/Automatic)", value: "mode" },
          { name: "Database management", value: "database" },
          { name: "Start application", value: "start" },
          { name: "Exit", value: "exit" },
        ],
      },
    ]);

    switch (action) {
      case "gate":
        await manageGateAccounts();
        break;
      case "bybit":
        await manageBybitAccounts();
        break;
      case "gmail":
        await manageGmailAccount();
        break;
      case "mode":
        await switchMode();
        break;
      case "database":
        await manageDatabase();
        break;
      case "start":
        await startApplication();
        context.running = false;
        break;
      case "exit":
        context.running = false;
        break;
    }
  }

  console.log("Goodbye!");
  process.exit(0);
}

async function manageGateAccounts() {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Gate account management:",
      choices: [
        "List accounts",
        "Add account",
        "Remove account",
        "Test account",
        "Back",
      ],
    },
  ]);

  switch (action) {
    case "List accounts":
      await listGateAccounts();
      break;
    case "Add account":
      await addGateAccount();
      break;
    case "Remove account":
      await removeGateAccount();
      break;
    case "Test account":
      await testGateAccount();
      break;
  }
}

async function listGateAccounts() {
  const accounts = await db.getActiveGateAccounts();
  
  if (accounts.length === 0) {
    console.log("No Gate accounts configured");
  } else {
    console.log("\nGate accounts:");
    accounts.forEach((acc, i) => {
      console.log(`${i + 1}. ${acc.accountId} - ${acc.email}`);
    });
  }
  
  await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
}

async function addGateAccount() {
  const { email, password, accountId } = await inquirer.prompt([
    {
      type: "input",
      name: "accountId",
      message: "Account ID (unique identifier):",
      validate: (input) => input.length > 0,
    },
    {
      type: "input",
      name: "email",
      message: "Email:",
      validate: (input) => /\S+@\S+\.\S+/.test(input),
    },
    {
      type: "password",
      name: "password",
      message: "Password:",
      validate: (input) => input.length > 0,
    },
  ]);

  console.log("Attempting to login...");

  try {
    const rateLimiter = new RateLimiter();
    const client = new GateClient(rateLimiter);
    
    await client.login(email, password);
    
    // Save cookies
    const cookiePath = path.join("data", "cookies", `${accountId}.json`);
    await fs.mkdir(path.dirname(cookiePath), { recursive: true });
    await client.saveCookies(cookiePath);
    
    // Save to database
    await db.upsertGateAccount({
      accountId,
      email,
      apiKey: "", // Gate doesn't use API keys for panel access
      apiSecret: "",
    });
    
    console.log("✓ Gate account added successfully!");
  } catch (error) {
    console.error("✗ Failed to add Gate account:", error);
  }
  
  await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
}

async function removeGateAccount() {
  const accounts = await db.getActiveGateAccounts();
  
  if (accounts.length === 0) {
    console.log("No Gate accounts to remove");
    return;
  }

  const { accountId } = await inquirer.prompt([
    {
      type: "list",
      name: "accountId",
      message: "Select account to remove:",
      choices: accounts.map((acc) => ({
        name: `${acc.accountId} - ${acc.email}`,
        value: acc.accountId,
      })),
    },
  ]);

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Are you sure you want to remove account ${accountId}?`,
      default: false,
    },
  ]);

  if (confirm) {
    await db.client.gateAccount.update({
      where: { accountId },
      data: { isActive: false },
    });
    console.log("✓ Account removed");
  }
}

async function testGateAccount() {
  const accounts = await db.getActiveGateAccounts();
  
  if (accounts.length === 0) {
    console.log("No Gate accounts to test");
    return;
  }

  const { accountId } = await inquirer.prompt([
    {
      type: "list",
      name: "accountId",
      message: "Select account to test:",
      choices: accounts.map((acc) => ({
        name: `${acc.accountId} - ${acc.email}`,
        value: acc.accountId,
      })),
    },
  ]);

  try {
    const rateLimiter = new RateLimiter();
    const client = new GateClient(rateLimiter);
    
    const cookiePath = path.join("data", "cookies", `${accountId}.json`);
    await client.loadCookies(cookiePath);
    
    const balance = await client.getBalance("RUB");
    console.log(`✓ Account is working! Balance: ${balance.balance} RUB`);
  } catch (error) {
    console.error("✗ Account test failed:", error);
  }
  
  await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
}

async function manageBybitAccounts() {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Bybit account management:",
      choices: [
        "List accounts",
        "Add account",
        "Remove account",
        "Test account",
        "Back",
      ],
    },
  ]);

  switch (action) {
    case "List accounts":
      await listBybitAccounts();
      break;
    case "Add account":
      await addBybitAccount();
      break;
    case "Remove account":
      await removeBybitAccount();
      break;
    case "Test account":
      await testBybitAccount();
      break;
  }
}

async function listBybitAccounts() {
  const accounts = await db.getActiveBybitAccounts();
  
  if (accounts.length === 0) {
    console.log("No Bybit accounts configured");
  } else {
    console.log("\nBybit accounts:");
    accounts.forEach((acc, i) => {
      console.log(`${i + 1}. ${acc.accountId}`);
    });
  }
  
  await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
}

async function addBybitAccount() {
  const { accountId, apiKey, apiSecret } = await inquirer.prompt([
    {
      type: "input",
      name: "accountId",
      message: "Account ID (unique identifier):",
      validate: (input) => input.length > 0,
    },
    {
      type: "input",
      name: "apiKey",
      message: "API Key:",
      validate: (input) => input.length > 0,
    },
    {
      type: "password",
      name: "apiSecret",
      message: "API Secret:",
      validate: (input) => input.length > 0,
    },
  ]);

  console.log("Saving Bybit account...");

  try {
    // Save to database without testing connection
    // P2P API requires special permissions that may not be available
    await db.upsertBybitAccount({
      accountId,
      apiKey,
      apiSecret,
    });
    
    console.log("✓ Bybit account added successfully!");
    console.log("\n⚠️  Note: P2P features require:");
    console.log("- Verified P2P trader status on Bybit");
    console.log("- KYC verification completed");
    console.log("- P2P API permissions enabled for your API key");
    console.log("- Access from supported regions");
    console.log("\nIf you haven't enabled P2P trading on Bybit, the automation may not work.");
  } catch (error) {
    console.error("✗ Failed to add Bybit account:", error);
  }
  
  await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
}

async function removeBybitAccount() {
  const accounts = await db.getActiveBybitAccounts();
  
  if (accounts.length === 0) {
    console.log("No Bybit accounts to remove");
    return;
  }

  const { accountId } = await inquirer.prompt([
    {
      type: "list",
      name: "accountId",
      message: "Select account to remove:",
      choices: accounts.map((acc) => ({
        name: acc.accountId,
        value: acc.accountId,
      })),
    },
  ]);

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Are you sure you want to remove account ${accountId}?`,
      default: false,
    },
  ]);

  if (confirm) {
    await db.client.bybitAccount.update({
      where: { accountId },
      data: { isActive: false },
    });
    console.log("✓ Account removed");
  }
}

async function testBybitAccount() {
  const accounts = await db.getActiveBybitAccounts();
  
  if (accounts.length === 0) {
    console.log("No Bybit accounts to test");
    return;
  }

  const { accountId } = await inquirer.prompt([
    {
      type: "list",
      name: "accountId",
      message: "Select account to test:",
      choices: accounts.map((acc) => ({
        name: acc.accountId,
        value: acc.accountId,
      })),
    },
  ]);

  const account = accounts.find((acc) => acc.accountId === accountId);
  if (!account) return;

  try {
    const client = new P2PClient({
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
      testnet: false,
    });
    
    await client.connect();
    const info = await client.getAccountInfo();
    console.log("✓ Account is working!");
    console.log("Account info:", JSON.stringify(info, null, 2));
  } catch (error) {
    console.error("✗ Account test failed:", error);
  }
  
  await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
}

async function manageGmailAccount() {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Gmail account management:",
      choices: [
        "Show current account",
        "Setup account",
        "Remove account",
        "Test account",
        "Back",
      ],
    },
  ]);

  switch (action) {
    case "Show current account":
      await showGmailAccount();
      break;
    case "Setup account":
      await setupGmailAccount();
      break;
    case "Remove account":
      await removeGmailAccount();
      break;
    case "Test account":
      await testGmailAccount();
      break;
  }
}

async function showGmailAccount() {
  const account = await db.getActiveGmailAccount();
  
  if (!account) {
    console.log("No Gmail account configured");
  } else {
    console.log(`\nGmail account: ${account.email}`);
  }
  
  await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
}

async function setupGmailAccount() {
  console.log("\nGmail OAuth Setup");
  console.log("This will use manual code entry for authorization.");
  console.log("1. You will be redirected to Google to authorize the application");
  console.log("2. After authorization, you'll see a URL with a code");
  console.log("3. Copy the code or entire URL and paste it here\n");

  const { proceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "Proceed with Gmail setup?",
      default: true,
    },
  ]);

  if (!proceed) return;

  try {
    // First check if we have credentials file
    const credentialsPath = path.join("data", "gmail-credentials.json");
    try {
      await fs.access(credentialsPath);
    } catch {
      console.error("\nError: Gmail credentials file not found!");
      console.log(`Please place your Google OAuth2 credentials at: ${credentialsPath}`);
      console.log("\nTo get credentials:");
      console.log("1. Go to https://console.cloud.google.com/");
      console.log("2. Create a new project or select existing");
      console.log("3. Enable Gmail API");
      console.log("4. Create credentials (OAuth 2.0 Client ID)");
      console.log("5. Select 'Desktop app' as application type");
      console.log("6. Download the credentials JSON file");
      console.log(`7. Save it as: ${credentialsPath}\n`);
      
      await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
      return;
    }

    // Load credentials
    const credentialsContent = JSON.parse(await fs.readFile(credentialsPath, 'utf-8'));
    
    // Extract OAuth2 credentials (could be under 'installed' or 'web' key)
    const credentials = credentialsContent.installed || credentialsContent.web || credentialsContent;
    
    if (!credentials.client_id || !credentials.client_secret) {
      console.error("\nError: Invalid credentials file!");
      console.log("The credentials file must contain client_id and client_secret.");
      console.log("\nMake sure you:");
      console.log("1. Created OAuth 2.0 Client ID (not API key)");
      console.log("2. Selected 'Desktop app' as application type");
      console.log("3. Downloaded the correct JSON file");
      
      await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
      return;
    }
    
    // Import necessary utilities
    const { createOAuth2Manager, extractCodeFromUrl } = await import("./gmail/utils/oauth2Fix");
    
    // Create OAuth2Manager with proper configuration
    const oauth2Manager = createOAuth2Manager(credentials);
    const authUrl = oauth2Manager.getAuthUrl();
    
    console.log("\n🌐 Authorization Required");
    console.log("========================");
    console.log("\nOpen this URL in your browser (preferably in incognito mode):");
    console.log(`\n${authUrl}\n`);
    
    console.log("After authorization, you'll be redirected to a URL like:");
    console.log("http://localhost/?code=4/0AX4XfWh...&scope=...\n");
    
    console.log("Copy either:");
    console.log("- The ENTIRE redirect URL, or");
    console.log("- Just the code part (between 'code=' and '&scope')\n");
    
    // Try to open browser automatically
    try {
      const open = await import("open");
      await open.default(authUrl);
      console.log("Browser opened automatically. Complete the authorization there.\n");
    } catch {
      // Ignore if can't open
    }
    
    const { input } = await inquirer.prompt([
      {
        type: "input",
        name: "input",
        message: "Paste the authorization code or full redirect URL:",
        validate: (input) => input.trim().length > 0,
      },
    ]);
    
    // Extract code from input (could be full URL or just the code)
    let code = input.trim();
    
    // Check if input looks like a URL
    if (input.includes("http") || input.includes("code=")) {
      const extracted = extractCodeFromUrl(input);
      if (extracted) {
        code = extracted;
        console.log("\n✅ Code extracted from URL");
      }
    }
    
    console.log("\nExchanging code for tokens...");
    
    try {
      const tokens = await oauth2Manager.getTokenFromCode(code);
      
      if (!tokens.refresh_token) {
        console.warn("\n⚠️  Warning: No refresh token received.");
        console.log("This might happen if you've authorized this app before.");
        console.log("You may need to revoke access and try again:");
        console.log("https://myaccount.google.com/permissions\n");
      }
      
      // Create client and get profile
      const client = new GmailClient(oauth2Manager);
      await client.setTokens(tokens);
      const profile = await client.getUserProfile();
      
      // Save to database
      await db.upsertGmailAccount({
        email: profile.emailAddress || "unknown",
        refreshToken: tokens.refresh_token || "",
      });
      
      console.log(`\n✓ Gmail account ${profile.emailAddress} setup successfully!`);
      
      // Test the connection
      console.log("\nTesting email access...");
      try {
        const emails = await client.getEmailsFromSender("noreply@tinkoff.ru", 1);
        console.log(`✓ Test passed! Found ${emails.length} email(s) from Tinkoff.`);
      } catch (testError) {
        console.warn("⚠️  Could not fetch test emails, but setup completed.");
      }
      
    } catch (error: any) {
      console.error("\n✗ Failed to exchange code for tokens!");
      
      if (error.message?.includes("invalid_grant")) {
        console.log("\n💡 Common causes and solutions:");
        console.log("1. Code already used - Get a FRESH code");
        console.log("2. Code expired - Complete the process quickly (within 1-2 minutes)");
        console.log("3. Wrong code copied - Copy ONLY the code part or the entire URL");
        console.log("4. Previous authorization - Revoke access at https://myaccount.google.com/permissions");
        console.log("\nTry the setup again with a fresh authorization!");
      } else {
        console.log(`\nError details: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error("✗ Failed to setup Gmail account:", error);
  }
  
  await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
}

async function removeGmailAccount() {
  const account = await db.getActiveGmailAccount();
  
  if (!account) {
    console.log("No Gmail account to remove");
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Are you sure you want to remove Gmail account ${account.email}?`,
      default: false,
    },
  ]);

  if (confirm) {
    await db.client.gmailAccount.update({
      where: { id: account.id },
      data: { isActive: false },
    });
    console.log("✓ Gmail account removed");
  }
}

async function testGmailAccount() {
  const account = await db.getActiveGmailAccount();
  
  if (!account) {
    console.log("No Gmail account to test");
    return;
  }

  try {
    // Load credentials
    const credentialsPath = path.join("data", "gmail-credentials.json");
    const credentialsContent = JSON.parse(await fs.readFile(credentialsPath, 'utf-8'));
    
    // Extract OAuth2 credentials (could be under 'installed' or 'web' key)
    const credentials = credentialsContent.installed || credentialsContent.web || credentialsContent;
    
    // Create OAuth2Manager and client
    const { OAuth2Manager } = await import("./gmail/utils/oauth2");
    const oauth2Manager = new OAuth2Manager(credentials);
    const client = new GmailClient(oauth2Manager);
    
    // Set tokens
    await client.setTokens({ refresh_token: account.refreshToken });
    
    const emails = await client.getEmailsFromSender("noreply@tinkoff.ru", 1);
    console.log(`✓ Gmail account is working! Found ${emails.length} emails from Tinkoff`);
  } catch (error) {
    console.error("✗ Gmail test failed:", error);
  }
  
  await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
}

async function switchMode() {
  const currentMode = await db.getSetting("mode");
  
  console.log(`\nCurrent mode: ${currentMode === "manual" ? "Manual" : "Automatic"}`);
  
  const { mode } = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "Select mode:",
      choices: [
        { name: "Manual - Confirm each action", value: "manual" },
        { name: "Automatic - Run without confirmations", value: "automatic" },
      ],
    },
  ]);

  await db.setSetting("mode", mode);
  console.log(`✓ Mode switched to ${mode}`);
  
  await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
}

async function manageDatabase() {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Database management:",
      choices: [
        "View statistics",
        "Clear transaction history",
        "Clear blacklist",
        "Reset all data",
        "Backup database",
        "Back",
      ],
    },
  ]);

  switch (action) {
    case "View statistics":
      await viewDatabaseStats();
      break;
    case "Clear transaction history":
      await clearTransactionHistory();
      break;
    case "Clear blacklist":
      await clearBlacklist();
      break;
    case "Reset all data":
      await resetDatabase();
      break;
    case "Backup database":
      await backupDatabase();
      break;
  }
}

async function viewDatabaseStats() {
  const stats = {
    payouts: await db.client.payout.count(),
    transactions: await db.client.transaction.count(),
    advertisements: await db.client.bybitAdvertisement.count(),
    blacklisted: await db.client.blacklistedTransaction.count(),
    gateAccounts: await db.client.gateAccount.count({ where: { isActive: true } }),
    bybitAccounts: await db.client.bybitAccount.count({ where: { isActive: true } }),
  };

  console.log("\nDatabase Statistics:");
  console.log("===================");
  console.log(`Payouts: ${stats.payouts}`);
  console.log(`Transactions: ${stats.transactions}`);
  console.log(`Advertisements: ${stats.advertisements}`);
  console.log(`Blacklisted: ${stats.blacklisted}`);
  console.log(`Active Gate accounts: ${stats.gateAccounts}`);
  console.log(`Active Bybit accounts: ${stats.bybitAccounts}`);
  
  await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
}

async function clearTransactionHistory() {
  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "This will delete all transactions, advertisements, and chat messages. Continue?",
      default: false,
    },
  ]);

  if (confirm) {
    console.log("Clearing transaction history...");
    
    // Delete in correct order due to foreign keys
    await db.client.chatMessage.deleteMany({});
    await db.client.transaction.deleteMany({});
    await db.client.bybitAdvertisement.deleteMany({});
    await db.client.payout.deleteMany({});
    
    console.log("✓ Transaction history cleared");
  }
}

async function clearBlacklist() {
  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "This will remove all blacklisted transactions. Continue?",
      default: false,
    },
  ]);

  if (confirm) {
    await db.client.blacklistedTransaction.deleteMany({});
    console.log("✓ Blacklist cleared");
  }
}

async function resetDatabase() {
  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "⚠️  WARNING: This will delete ALL data including accounts! Continue?",
      default: false,
    },
  ]);

  if (confirm) {
    const { doubleConfirm } = await inquirer.prompt([
      {
        type: "input",
        name: "doubleConfirm",
        message: "Type 'DELETE ALL' to confirm:",
      },
    ]);

    if (doubleConfirm === "DELETE ALL") {
      console.log("Resetting database...");
      
      // Delete all data
      await db.client.chatMessage.deleteMany({});
      await db.client.transaction.deleteMany({});
      await db.client.bybitAdvertisement.deleteMany({});
      await db.client.payout.deleteMany({});
      await db.client.blacklistedTransaction.deleteMany({});
      await db.client.systemSettings.deleteMany({});
      await db.client.gateAccount.deleteMany({});
      await db.client.bybitAccount.deleteMany({});
      await db.client.gmailAccount.deleteMany({});
      
      console.log("✓ Database reset complete");
    } else {
      console.log("Reset cancelled");
    }
  }
}

async function backupDatabase() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join("data", "backups", `backup_${timestamp}.db`);
    
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.copyFile(path.join("data", "database.db"), backupPath);
    
    console.log(`✓ Database backed up to: ${backupPath}`);
  } catch (error) {
    console.error("✗ Backup failed:", error);
  }
  
  await inquirer.prompt([{ type: "input", name: "continue", message: "Press Enter to continue..." }]);
}

async function startApplication() {
  const { mode } = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "Start in which mode?",
      choices: [
        { name: "Manual - Confirm each action", value: "manual" },
        { name: "Automatic - Run without confirmations", value: "automatic" },
      ],
    },
  ]);

  await db.setSetting("mode", mode);
  
  console.log(`\nStarting Itrader in ${mode} mode...\n`);
  
  // Import and run main
  const { default: main } = await import("./app");
  await main();
}

// Export is already done on line 18