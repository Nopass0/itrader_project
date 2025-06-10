/**
 * Chat Automation Service
 * Handles automated chat communication with counterparties
 */

import { db, type Transaction, type ChatMessage } from "../db";
import { BybitP2PManagerService } from "./bybitP2PManager";
import { EventEmitter } from "events";

export class ChatAutomationService extends EventEmitter {
  private bybitManager: BybitP2PManagerService;

  private initialQuestion = `Здравствуйте!

Для быстрого проведения сделки, пожалуйста, ответьте на следующие вопросы:

1. Оплата будет с Т банка?
2. Чек в формате PDF с официальной почты Т банка сможете отправить?

Просто напишите "Да" если согласны со всеми условиями, или "Нет" если что-то не подходит.`;

  private finalMessage = `Переходи в закрытый чат https://t.me/+nIB6kP22KmhlMmQy

Всегда есть большой объем ЮСДТ по хорошему курсу, работаем оперативно.`;

  constructor(bybitManager: BybitP2PManagerService) {
    super();
    this.bybitManager = bybitManager;
  }

  /**
   * Start automation for a transaction
   */
  async startAutomation(transactionId: string): Promise<void> {
    try {
      // Check if we already sent messages
      const messages = await db.getChatMessages(transactionId);
      const ourMessages = messages.filter(msg => msg.sender === "us");
      
      if (ourMessages.length > 0) {
        console.log(
          `[ChatAutomation] Already sent ${ourMessages.length} messages for transaction ${transactionId}, skipping`,
        );
        return;
      }
      
      // Send initial question message
      await this.sendMessage(transactionId, this.initialQuestion);
      await db.updateTransaction(transactionId, { chatStep: 1 });
      console.log(
        `[ChatAutomation] Started automation for transaction ${transactionId}`,
      );
    } catch (error) {
      console.error(
        `[ChatAutomation] Error starting automation for ${transactionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process unprocessed chat messages
   */
  async processUnprocessedMessages(): Promise<void> {
    const messages = await db.getUnprocessedChatMessages();

    if (messages.length > 0) {
      console.log(`[ChatAutomation] Processing ${messages.length} unprocessed messages`);
    }

    for (const message of messages) {
      try {
        console.log(`[ChatAutomation] Processing message from ${message.sender}: "${(message.content || (message as any).message || "").substring(0, 50)}..."`);
        await this.processMessage(message);
        await db.markChatMessageProcessed(message.id);
      } catch (error) {
        console.error(
          `[ChatAutomation] Error processing message ${message.id}:`,
          error,
        );
      }
    }
  }

  /**
   * Process a single chat message
   */
  private async processMessage(
    message: ChatMessage & { transaction: Transaction },
  ): Promise<void> {
    // Skip if message is from us
    if (message.sender === "us") return;

    const transaction = message.transaction;
    const currentStep = transaction.chatStep;

    // If we haven't started the conversation, send first message
    if (currentStep === 0) {
      await this.startAutomation(transaction.id);
      return;
    }

    // Check response to our initial question
    if (currentStep === 1) {
      const messageText = message.content || (message as any).message || "";
      const answer = messageText.toLowerCase().trim();
      
      // Check for positive answer
      if (this.isPositiveAnswer(answer)) {
        // Send payment details
        await this.sendPaymentDetails(transaction.id);
        await db.updateTransaction(transaction.id, {
          status: "waiting_payment",
          paymentSentAt: new Date(),
        });
      } 
      // Check for negative answer
      else if (this.isNegativeAnswer(answer)) {
        // Mark as stupid and forget about the order
        await db.updateTransaction(transaction.id, {
          status: "stupid",
          failureReason: `Negative response: ${message.content}`,
        });
        console.log(`[ChatAutomation] Transaction ${transaction.id} marked as stupid due to negative response`);
      } 
      // Any other answer - repeat the question
      else {
        await this.sendMessage(
          transaction.id,
          this.initialQuestion,
        );
        console.log(`[ChatAutomation] Repeating question for transaction ${transaction.id}`);
      }
    }
  }


  /**
   * Send payment details
   */
  private async sendPaymentDetails(transactionId: string): Promise<void> {
    const transaction = await db.getTransactionWithDetails(transactionId);
    if (!transaction) return;

    // Get order details for amount
    const orderId = transaction.orderId;
    let orderAmount = 0;
    if (orderId) {
      // Get the order from Bybit to get exact amount
      const bybitAccount = (transaction.advertisement as any).bybitAccount;
      if (bybitAccount) {
        const client = this.bybitManager.getClient(bybitAccount.accountId);
        if (client) {
          try {
            const order = await client.getOrderDetails(orderId);
            orderAmount = parseFloat(order.amount || "0");
          } catch (error) {
            console.error(`[ChatAutomation] Failed to get order details:`, error);
          }
        }
      }
    }
    
    const payout = transaction.payout;
    if (!payout) {
      console.error(`[ChatAutomation] No payout found for transaction ${transactionId}`);
      // Use order amount if available
      const amount = orderAmount || transaction.advertisement?.price || 0;
      
      // Get payment method from advertisement
      const paymentMethod = transaction.advertisement?.paymentMethod || "Bank Transfer";
      let bankName = "Банк";
      
      // Determine bank name from payment method
      if (paymentMethod.toLowerCase().includes("tinkoff")) {
        bankName = "Тинькофф";
      } else if (paymentMethod.toLowerCase().includes("sbp")) {
        bankName = "СБП";
      } else if (paymentMethod.toLowerCase().includes("sber")) {
        bankName = "Сбербанк";
      }
      
      // Send basic payment details without payout info
      const paymentDetails = `Реквизиты для оплаты:
Банк: ${bankName}
Счет: По запросу

Сумма: ${amount} RUB

Email для чека: ${(await db.getActiveGmailAccount())?.email || 'support@example.com'}

После оплаты отправьте чек в формате PDF на указанный email.`;
      
      await this.sendMessage(transactionId, paymentDetails);
      await db.updateTransaction(transactionId, {
        chatStep: 999,
        status: "waiting_payment",
        paymentSentAt: new Date(),
      });
      return;
    }
    
    // Handle both amountTrader and totalTrader fields
    let amount = 0;
    if (payout.amountTrader) {
      const amountTrader = typeof payout.amountTrader === "string"
        ? JSON.parse(payout.amountTrader)
        : payout.amountTrader;
      amount = amountTrader["643"] || 0; // RUB amount
    } else if (payout.totalTrader) {
      const totalTrader = typeof payout.totalTrader === "string"
        ? JSON.parse(payout.totalTrader)
        : payout.totalTrader;
      amount = totalTrader["643"] || 0; // RUB amount
    } else if (payout.amount) {
      amount = payout.amount;
    }
    
    const bankInfo = payout.bank
      ? (typeof payout.bank === "string" ? JSON.parse(payout.bank) : payout.bank)
      : null;
    const wallet = payout.wallet;

    // Use order amount if available, otherwise use payout amount
    const finalAmount = orderAmount || amount;
    
    // Get payment method from advertisement
    const paymentMethod = transaction.advertisement.paymentMethod || "";
    
    // Determine bank name
    let bankName = bankInfo?.name || "";
    if (!bankName && paymentMethod) {
      if (paymentMethod.toLowerCase().includes("tinkoff")) {
        bankName = "Тинькофф";
      } else if (paymentMethod.toLowerCase().includes("sbp")) {
        bankName = "СБП";
      } else if (paymentMethod.toLowerCase().includes("sber")) {
        bankName = "Сбербанк";
      } else {
        bankName = paymentMethod;
      }
    }

    // Get Gmail account for receiving checks
    const gmailAccount = await db.getActiveGmailAccount();
    if (!gmailAccount) {
      throw new Error("No active Gmail account configured");
    }

    const paymentDetails = `Реквизиты для оплаты:
Банк: ${bankName}
Счет: ${wallet || "По запросу"}

Сумма: ${finalAmount} RUB

Email для чека: ${gmailAccount.email}

После оплаты отправьте чек в формате PDF на указанный email.`;

    await this.sendMessage(transactionId, paymentDetails);
    await db.updateTransaction(transactionId, {
      chatStep: 999, // Special step indicating payment details sent
      status: "waiting_payment",
      paymentSentAt: new Date(),
    });
  }

  /**
   * Send final message after check verification
   */
  async sendFinalMessage(transactionId: string): Promise<void> {
    await this.sendMessage(transactionId, this.finalMessage);
  }

  /**
   * Send message with proper parameters
   */
  private async sendMessage(transactionId: string, message: string): Promise<void> {
    const transaction = await db.getTransactionWithDetails(transactionId);
    if (!transaction || !transaction.orderId) {
      throw new Error("Transaction not found or no order ID");
    }

    const bybitAccount = (transaction.advertisement as any).bybitAccount;
    if (!bybitAccount) {
      throw new Error("Bybit account not found for advertisement");
    }
    
    const client = this.bybitManager.getClient(bybitAccount.accountId);
    if (!client) {
      throw new Error(`No client found for account ${bybitAccount.accountId}`);
    }

    console.log(`[ChatAutomation] Sending message to order ${transaction.orderId}`);
    console.log(`[ChatAutomation] Message preview: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
    
    try {
      // Send message using client method
      const response = await client.sendChatMessage({
        orderId: transaction.orderId,
        message: message,
        messageType: "TEXT",
      });
      
      console.log(`[ChatAutomation] ✅ Message sent successfully!`);

      // Save message to database
      await db.createChatMessage({
        transactionId: transaction.id,
        messageId: response?.msgUuid || `sent_${Date.now()}`,
        sender: "us",
        content: message,
        messageType: "TEXT",
        isProcessed: true,
      });
    } catch (error) {
      console.error(`[ChatAutomation] ❌ Failed to send message:`, error);
      throw error;
    }
  }

  /**
   * Check if answer is positive
   */
  private isPositiveAnswer(answer: string): boolean {
    const positiveAnswers = [
      "да",
      "yes",
      "ок",
      "ok",
      "норм",
      "хорошо",
      "конечно",
      "разумеется",
      "согласен",
      "согласна",
      "подтверждаю",
      "подтвержаю",
    ];
    
    return positiveAnswers.some((positive) => 
      answer.includes(positive)
    );
  }

  /**
   * Check if answer is negative
   */
  private isNegativeAnswer(answer: string): boolean {
    const negativeAnswers = [
      "нет",
      "no",
      "не",
      "не подтверждаю",
      "отказываюсь",
      "не согласен",
      "не согласна",
      "отказ",
      "не могу",
      "не буду",
    ];
    
    return negativeAnswers.some((negative) => 
      answer.includes(negative)
    );
  }

}
