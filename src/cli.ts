import inquirer from 'inquirer';
import { GateAccountManager } from './gate';
import { BybitClient } from './bybit';
import { GmailManager } from './gmail';
import { DataStore } from './db';
import { Orchestrator } from './orchestrator';

const gateManager = new GateAccountManager();
const bybitClient = new BybitClient();
let gmailManager: GmailManager | undefined;
const db = new DataStore();

interface AppContext {
  running: boolean;
}

const orchestrator = new Orchestrator<AppContext>({
  name: 'itrader',
  context: { running: true },
});

async function loginGateAccounts() {
  const accounts = gateManager.getAccounts();
  for (const acc of accounts) {
    if (!(await gateManager.isAuthenticated(acc.email))) {
      try {
        await gateManager.login(acc.email);
      } catch (e) {
        console.error(`Failed to login ${acc.email}:`, (e as any).message);
      }
    }
  }
}

async function setBalanceForAll() {
  for (const acc of gateManager.getAccounts()) {
    try {
      await gateManager.setBalance(acc.email, 10_000_000);
    } catch (e) {
      console.error(`Set balance error for ${acc.email}:`, (e as any).message);
    }
  }
}

async function checkTransactions() {
  for (const acc of gateManager.getAccounts()) {
    try {
      const txs = await gateManager.getPendingTransactions(acc.email);
      for (const tx of txs) {
        db.savePayout(tx.id.toString(), acc.email, tx);
        await gateManager.acceptTransaction(acc.email, tx.id.toString());
      }
    } catch (e) {
      console.error(`Check transactions error for ${acc.email}:`, (e as any).message);
    }
  }
}

function setupAutoTasks() {
  orchestrator.addInterval('balance-updater', async () => {
    await setBalanceForAll();
  }, 4 * 60 * 60 * 1000, { runOnStart: true });

  orchestrator.addInterval('tx-checker', async () => {
    await checkTransactions();
  }, 5 * 60 * 1000, { runOnStart: true });
}

async function addGateAccount() {
  const { email, password } = await inquirer.prompt([
    { type: 'input', name: 'email', message: 'Gate email:' },
    { type: 'password', name: 'password', message: 'Password:' },
  ]);
  await gateManager.addAccount(email, password, true);
}

async function addBybitAccount() {
  const { key, secret } = await inquirer.prompt([
    { type: 'input', name: 'key', message: 'Bybit API key:' },
    { type: 'input', name: 'secret', message: 'Bybit API secret:' },
  ]);
  await bybitClient.addAccount(key, secret, false, 'Account');
}

async function addGmailAccount() {
  if (!gmailManager) {
    gmailManager = await GmailManager.fromCredentialsFile('./credentials.json', {});
    await gmailManager.initialize();
  }
  await gmailManager.addAccountInteractive();
}

async function manualMode() {
  const { balance } = await inquirer.prompt({
    type: 'confirm',
    name: 'balance',
    message: 'Set balance for all Gate accounts?',
    default: true,
  });
  if (balance) await setBalanceForAll();

  const { check } = await inquirer.prompt({
    type: 'confirm',
    name: 'check',
    message: 'Check pending transactions now?',
    default: true,
  });
  if (check) await checkTransactions();
}

async function autoMode() {
  setupAutoTasks();
  await orchestrator.start();
  console.log('Auto mode started. Press Ctrl+C to exit.');
  process.stdin.resume();
  return new Promise<void>((resolve) => {
    process.on('SIGINT', async () => {
      await orchestrator.stop();
      resolve();
    });
  });
}

async function mainMenu() {
  await gateManager.initialize();
  while (true) {
    const { choice } = await inquirer.prompt({
      type: 'list',
      name: 'choice',
      message: 'Menu',
      choices: [
        { name: 'Manual mode', value: 'manual' },
        { name: 'Automatic mode', value: 'auto' },
        { name: 'Add Gate account', value: 'addGate' },
        { name: 'Add Bybit account', value: 'addBybit' },
        { name: 'Add Gmail account', value: 'addGmail' },
        { name: 'Exit', value: 'exit' },
      ],
    });

    switch (choice) {
      case 'manual':
        await manualMode();
        break;
      case 'auto':
        await loginGateAccounts();
        await autoMode();
        break;
      case 'addGate':
        await addGateAccount();
        break;
      case 'addBybit':
        await addBybitAccount();
        break;
      case 'addGmail':
        await addGmailAccount();
        break;
      case 'exit':
        process.exit(0);
    }
  }
}

mainMenu();
