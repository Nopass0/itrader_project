/**
 * Chat Automation Service
 * Handles automated chat communication with counterparties
 */

import { db, type Transaction, type ChatMessage } from '../db';
import { BybitP2PManagerService } from './bybitP2PManager';

interface ChatStep {
  step: number;
  question: string;
  expectedAnswers: string[];
  failureAction?: 'repeat' | 'blacklist';
}

export class ChatAutomationService {
  private bybitManager: BybitP2PManagerService;
  
  private chatSteps: ChatStep[] = [
    {
      step: 1,
      question: `Здравствуйте!
Оплата будет с Т банка?
( просто напишите да/нет)`,
      expectedAnswers: ['да', 'yes', 'ок', 'ok', 'норм', 'хорошо', 'конечно', 'разумеется'],
      failureAction: 'blacklist'
    },
    {
      step: 2,
      question: `Чек в формате пдф с официальной почты Т банка сможете отправить ?
( просто напишите да/нет)`,
      expectedAnswers: ['да', 'yes', 'ок', 'ok', 'норм', 'хорошо', 'конечно', 'разумеется', 'смогу', 'могу'],
      failureAction: 'blacklist'
    },
    {
      step: 3,
      question: `При СБП, если оплата будет на неверный банк, деньги потеряны.
( просто напишите подтверждаю/ не подтверждаю)`,
      expectedAnswers: ['подтверждаю', 'подтвержаю', 'да', 'yes', 'ок', 'ok', 'понял', 'понятно', 'ясно'],
      failureAction: 'blacklist'
    }
  ];

  private finalMessage = `Переходи в закрытый чат https://t.me/+nIB6kP22KmhlMmQy

Всегда есть большой объем ЮСДТ по хорошему курсу, работаем оперативно.`;

  constructor(bybitManager: BybitP2PManagerService) {
    this.bybitManager = bybitManager;
  }

  /**
   * Process unprocessed chat messages
   */
  async processUnprocessedMessages(): Promise<void> {
    const messages = await db.getUnprocessedChatMessages();
    
    for (const message of messages) {
      try {
        await this.processMessage(message);
        await db.markChatMessageProcessed(message.id);
      } catch (error) {
        console.error(`[ChatAutomation] Error processing message ${message.id}:`, error);
      }
    }
  }

  /**
   * Process a single chat message
   */
  private async processMessage(message: ChatMessage & { transaction: Transaction }): Promise<void> {
    // Skip if message is from us
    if (message.sender === 'us') return;

    const transaction = message.transaction;
    const currentStep = transaction.chatStep;

    // If we haven't started the conversation, send first message
    if (currentStep === 0) {
      await this.sendStepMessage(transaction.id, 1);
      return;
    }

    // Check if this is a response to our question
    if (currentStep > 0 && currentStep <= this.chatSteps.length) {
      const step = this.chatSteps[currentStep - 1];
      const isValidAnswer = this.checkAnswer(message.content, step.expectedAnswers);

      if (isValidAnswer) {
        // Move to next step
        if (currentStep < this.chatSteps.length) {
          await this.sendStepMessage(transaction.id, currentStep + 1);
        } else {
          // All questions answered correctly, send payment details
          await this.sendPaymentDetails(transaction.id);
        }
      } else {
        // Invalid answer
        if (step.failureAction === 'blacklist') {
          await this.blacklistTransaction(transaction.id, `Failed at step ${currentStep}: ${message.content}`);
        } else {
          // Repeat the question
          await this.sendStepMessage(transaction.id, currentStep);
        }
      }
    }
  }

  /**
   * Send a step message
   */
  private async sendStepMessage(transactionId: string, step: number): Promise<void> {
    const stepData = this.chatSteps[step - 1];
    if (!stepData) return;

    await this.bybitManager.sendChatMessage(transactionId, stepData.question);
    await db.updateTransaction(transactionId, { chatStep: step });
  }

  /**
   * Send payment details
   */
  private async sendPaymentDetails(transactionId: string): Promise<void> {
    const transaction = await db.getTransactionWithDetails(transactionId);
    if (!transaction) return;

    const payout = transaction.payout;
    const amount = payout.totalTrader['643'] || 0; // RUB amount
    const bankInfo = payout.bank;
    const wallet = payout.wallet;
    
    // Get payment method from advertisement
    const paymentMethod = transaction.advertisement.paymentMethod;
    
    // Get Gmail account for receiving checks
    const gmailAccount = await db.getActiveGmailAccount();
    if (!gmailAccount) {
      throw new Error('No active Gmail account configured');
    }

    const paymentDetails = `Реквизиты для оплаты:
Банк: ${bankInfo?.name || paymentMethod}
${paymentMethod === 'SBP' ? 'Телефон' : 'Карта'}: ${wallet}
Сумма: ${amount} RUB
Email для чека: ${gmailAccount.email}

После оплаты отправьте чек в формате PDF на указанный email.`;

    await this.bybitManager.sendChatMessage(transactionId, paymentDetails);
    await db.updateTransaction(transactionId, {
      chatStep: 999, // Special step indicating payment details sent
      status: 'waiting_payment',
      paymentSentAt: new Date(),
    });
  }

  /**
   * Send final message after check verification
   */
  async sendFinalMessage(transactionId: string): Promise<void> {
    await this.bybitManager.sendChatMessage(transactionId, this.finalMessage);
  }

  /**
   * Check if answer matches expected answers
   */
  private checkAnswer(answer: string, expectedAnswers: string[]): boolean {
    const normalizedAnswer = answer.toLowerCase().trim();
    
    // Check for negative answers
    const negativeAnswers = ['нет', 'no', 'не', 'не подтверждаю', 'отказываюсь'];
    if (negativeAnswers.some(neg => normalizedAnswer.includes(neg))) {
      return false;
    }

    // Check for positive answers
    return expectedAnswers.some(expected => 
      normalizedAnswer.includes(expected.toLowerCase())
    );
  }

  /**
   * Blacklist a transaction
   */
  private async blacklistTransaction(transactionId: string, reason: string): Promise<void> {
    const transaction = await db.getTransactionWithDetails(transactionId);
    if (!transaction) return;

    // Add to blacklist
    await db.addToBlacklist({
      payoutId: transaction.payoutId,
      reason,
      wallet: transaction.payout.wallet,
      amount: transaction.payout.totalTrader['643']?.toString(),
    });

    // Update transaction status
    await db.updateTransaction(transactionId, {
      status: 'blacklisted',
      failureReason: reason,
    });

    // Send rejection message
    await this.bybitManager.sendChatMessage(
      transactionId, 
      'К сожалению, мы не можем продолжить эту сделку. Удачи!'
    );
  }
}