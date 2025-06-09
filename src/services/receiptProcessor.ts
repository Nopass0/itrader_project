/**
 * Сервис обработки чеков и завершения транзакций
 */

import { EventEmitter } from 'events';
import { PrismaClient } from "../../generated/prisma";
import { GmailManager } from '../gmail';
import { ReceiptMatcher } from './receiptMatcher';
import { GateClient } from '../gate';
import { BybitP2PManagerService } from './bybitP2PManager';
import * as fs from 'fs/promises';
import * as path from 'path';

const prisma = new PrismaClient();

interface ReceiptProcessorConfig {
  checkInterval?: number; // Интервал проверки почты (мс)
  pdfStoragePath?: string; // Путь для сохранения PDF
  maxRetries?: number;
}

interface ProcessedReceipt {
  id: string;
  emailId: string;
  fileName: string;
  transactionId?: string;
  payoutId?: string;
  processedAt: Date;
}

export class ReceiptProcessorService extends EventEmitter {
  private config: Required<ReceiptProcessorConfig>;
  private intervalId?: NodeJS.Timeout;
  private isRunning = false;
  private processedEmails = new Set<string>();
  private receiptMatcher: ReceiptMatcher;

  constructor(
    private gmailManager: GmailManager,
    private gateClient: GateClient,
    private bybitManager: BybitP2PManagerService,
    config: ReceiptProcessorConfig = {}
  ) {
    super();
    
    this.config = {
      checkInterval: config.checkInterval || 30000, // 30 секунд
      pdfStoragePath: config.pdfStoragePath || 'data/receipts',
      maxRetries: config.maxRetries || 3
    };

    this.receiptMatcher = new ReceiptMatcher();
  }

  /**
   * Запускает обработчик чеков
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Receipt processor already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting receipt processor...');

    // Создаем директорию для PDF если не существует
    await this.ensureStorageDirectory();

    // Загружаем обработанные email из БД
    await this.loadProcessedEmails();

    // Проверяем существующие payout со статусом 5
    await this.checkExistingPayouts();

    // Запускаем периодическую проверку
    this.intervalId = setInterval(() => {
      this.processReceipts().catch(error => {
        console.error('Error processing receipts:', error);
      });
    }, this.config.checkInterval);

    // Первая проверка сразу
    await this.processReceipts();
  }

  /**
   * Останавливает обработчик
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    console.log('Receipt processor stopped');
  }

  /**
   * Проверяет существующие payout со статусом 5
   */
  private async checkExistingPayouts(): Promise<void> {
    try {
      const payouts = await prisma.payout.findMany({
        where: { status: 5 },
        include: { transaction: true }
      });

      console.log(`Found ${payouts.length} payouts with status 5`);

      for (const payout of payouts) {
        try {
          // Проверяем текущий статус в Gate.io
          const gatePayouts = await this.gateClient.searchPayouts({
            id: payout.gatePayoutId.toString()
          });

          if (gatePayouts.length > 0) {
            const currentStatus = gatePayouts[0].status;
            
            if (currentStatus !== payout.status) {
              console.log(`Payout ${payout.id} status changed: ${payout.status} -> ${currentStatus}`);
              
              await prisma.payout.update({
                where: { id: payout.id },
                data: { 
                  status: currentStatus,
                  updatedAt: new Date()
                }
              });

              this.emit('payoutStatusChanged', {
                payoutId: payout.id,
                oldStatus: payout.status,
                newStatus: currentStatus
              });
            }
          }
        } catch (error) {
          console.error(`Error checking payout ${payout.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error checking existing payouts:', error);
    }
  }

  /**
   * Основной метод обработки чеков
   */
  private async processReceipts(): Promise<void> {
    try {
      // Получаем активные Gmail аккаунты
      const gmailAccounts = await this.gmailManager.getActiveAccounts();
      
      for (const account of gmailAccounts) {
        await this.processAccountReceipts(account.email);
      }
    } catch (error) {
      console.error('Error in processReceipts:', error);
    }
  }

  /**
   * Обрабатывает чеки для конкретного аккаунта
   */
  private async processAccountReceipts(email: string): Promise<void> {
    try {
      const gmailClient = this.gmailManager.getClient(email);
      if (!gmailClient) {
        console.error(`No Gmail client for ${email}`);
        return;
      }

      // Ищем письма от Тинькофф за последние 2 часа
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const searchResult = await gmailClient.getEmailsFromSender("noreply@tinkoff.ru", {
        after: twoHoursAgo,
        maxResults: 50
      });

      if (!searchResult.messages || searchResult.messages.length === 0) {
        return;
      }

      console.log(`Found ${searchResult.messages.length} emails from Tinkoff for ${email}`);

      for (const message of searchResult.messages) {
        if (this.processedEmails.has(message.id)) {
          continue; // Уже обработано
        }

        try {
          await this.processEmail(gmailClient, message.id);
        } catch (error) {
          console.error(`Error processing email ${message.id}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error processing receipts for ${email}:`, error);
    }
  }

  /**
   * Обрабатывает отдельное письмо
   */
  private async processEmail(gmailClient: any, messageId: string): Promise<void> {
    try {
      const fullMessage = await gmailClient.getEmailById(messageId);
      if (!fullMessage || !fullMessage.payload) {
        return;
      }

      // Проверяем есть ли PDF вложения
      const attachments = this.extractAttachments(fullMessage.payload);
      const pdfAttachments = attachments.filter(att => 
        att.filename?.toLowerCase().endsWith('.pdf')
      );

      if (pdfAttachments.length === 0) {
        return; // Нет PDF чеков
      }

      console.log(`Processing ${pdfAttachments.length} PDF attachments from email ${messageId}`);

      for (const attachment of pdfAttachments) {
        try {
          // Скачиваем PDF
          const pdfData = await gmailClient.downloadAttachment(messageId, attachment);
          
          // Сохраняем PDF
          const savedPath = await this.savePDF(pdfData.data, attachment.filename || 'receipt.pdf');
          
          // Обрабатываем чек
          await this.processReceipt(pdfData.data, savedPath, messageId);
          
        } catch (error) {
          console.error(`Error processing attachment ${attachment.filename}:`, error);
        }
      }

      // Помечаем email как обработанный
      this.processedEmails.add(messageId);
      
      // Сохраняем в БД
      await prisma.processedEmail.create({
        data: {
          emailId: messageId,
          processedAt: new Date()
        }
      }).catch(() => {
        // Игнорируем если уже существует
      });

    } catch (error) {
      console.error(`Error processing email ${messageId}:`, error);
    }
  }

  /**
   * Обрабатывает PDF чек
   */
  private async processReceipt(
    pdfBuffer: Buffer, 
    filePath: string, 
    emailId: string
  ): Promise<void> {
    try {
      // Получаем все активные payout со статусом 5
      const activePayouts = await prisma.transaction.findMany({
        where: {
          payout: {
            status: 5 // Ожидающие подтверждения
          },
          status: {
            in: ['pending', 'chat_started', 'waiting_payment']
          }
        },
        include: {
          payout: true
        }
      });

      console.log(`Checking receipt against ${activePayouts.length} active payouts`);

      // Проверяем чек против каждого payout
      for (const transaction of activePayouts) {
        if (!transaction.payout) continue;

        try {
          const matches = await this.receiptMatcher.matchPayoutWithReceiptBuffer(
            transaction.id,
            pdfBuffer
          );

          if (matches) {
            console.log(`✅ Receipt matches transaction ${transaction.id}`);
            
            // Обрабатываем совпадение
            await this.handleMatchedReceipt(
              transaction.id,
              transaction.payoutId,
              filePath,
              emailId
            );
            
            // Один чек может соответствовать только одной транзакции
            break;
          }
        } catch (error) {
          console.error(`Error matching receipt with transaction ${transaction.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing receipt:', error);
    }
  }

  /**
   * Обрабатывает совпавший чек
   */
  private async handleMatchedReceipt(
    transactionId: string,
    payoutId: string,
    receiptPath: string,
    emailId: string
  ): Promise<void> {
    try {
      console.log(`Processing matched receipt for transaction ${transactionId}`);

      // 1. Апрувим payout на Gate.io с приложением чека
      const payout = await prisma.payout.findUnique({
        where: { id: payoutId }
      });

      if (!payout) {
        throw new Error(`Payout ${payoutId} not found`);
      }

      // Читаем файл чека для отправки
      const receiptData = await fs.readFile(receiptPath);
      
      // Апрувим на Gate.io
      console.log(`Approving payout ${payout.gatePayoutId} on Gate.io...`);
      await this.gateClient.approvePayout(
        payout.gatePayoutId.toString(),
        receiptData
      );

      // 2. Обновляем статус payout
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 10, // Approved
          approvedAt: new Date(),
          attachments: JSON.stringify([{
            type: 'receipt',
            path: receiptPath,
            emailId: emailId
          }])
        }
      });

      // 3. Обновляем транзакцию
      const transaction = await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'payment_received',
          checkReceivedAt: new Date()
        },
        include: {
          payout: true
        }
      });

      // 4. Если есть orderId, отпускаем средства на Bybit
      if (transaction.orderId) {
        console.log(`Releasing assets for order ${transaction.orderId}...`);
        
        try {
          // Находим Bybit аккаунт по объявлению
          const advertisement = await prisma.bybitAdvertisement.findUnique({
            where: { id: transaction.advertisementId }
          });

          if (advertisement) {
            const bybitClient = this.bybitManager.getClient(advertisement.bybitAccountId);
            if (bybitClient) {
              await bybitClient.releaseAssets(transaction.orderId);
              
              // Обновляем статус транзакции
              await prisma.transaction.update({
                where: { id: transactionId },
                data: {
                  status: 'completed',
                  completedAt: new Date()
                }
              });

              console.log(`✅ Transaction ${transactionId} completed successfully`);
            }
          }
        } catch (error) {
          console.error(`Error releasing assets for order ${transaction.orderId}:`, error);
          // Не прерываем процесс, транзакция уже подтверждена
        }
      }

      // 5. Генерируем событие
      this.emit('receiptProcessed', {
        transactionId,
        payoutId,
        receiptPath,
        status: 'success'
      });

    } catch (error) {
      console.error(`Error handling matched receipt:`, error);
      
      // Обновляем статус транзакции на failed
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'failed',
          failureReason: `Receipt processing error: ${error.message}`
        }
      }).catch(() => {});

      this.emit('receiptProcessed', {
        transactionId,
        payoutId,
        receiptPath,
        status: 'failed',
        error: error.message
      });
    }
  }

  /**
   * Сохраняет PDF файл
   */
  private async savePDF(data: Buffer, originalName: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${timestamp}_${originalName}`;
    const filePath = path.join(this.config.pdfStoragePath, fileName);
    
    await fs.writeFile(filePath, data);
    
    return filePath;
  }

  /**
   * Извлекает вложения из payload письма
   */
  private extractAttachments(payload: any): any[] {
    const attachments: any[] = [];

    const processPartRecursive = (part: any) => {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          attachmentId: part.body.attachmentId,
          mimeType: part.mimeType,
          size: part.body.size
        });
      }

      if (part.parts) {
        part.parts.forEach(processPartRecursive);
      }
    };

    processPartRecursive(payload);
    return attachments;
  }

  /**
   * Создает директорию для хранения PDF
   */
  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.pdfStoragePath, { recursive: true });
    } catch (error) {
      console.error('Error creating storage directory:', error);
    }
  }

  /**
   * Загружает обработанные email из БД
   */
  private async loadProcessedEmails(): Promise<void> {
    try {
      const processed = await prisma.processedEmail.findMany({
        where: {
          processedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // За последние 7 дней
          }
        }
      });

      processed.forEach(email => {
        this.processedEmails.add(email.emailId);
      });

      console.log(`Loaded ${processed.length} processed emails`);
    } catch (error) {
      console.error('Error loading processed emails:', error);
    }
  }
}

// Экспортируем для удобства
export async function startReceiptProcessor(
  gmailManager: GmailManager,
  gateClient: GateClient,
  bybitManager: BybitP2PManagerService,
  config?: ReceiptProcessorConfig
): Promise<ReceiptProcessorService> {
  const processor = new ReceiptProcessorService(
    gmailManager,
    gateClient,
    bybitManager,
    config
  );
  
  await processor.start();
  return processor;
}