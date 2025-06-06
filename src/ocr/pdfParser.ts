/**
 * Парсер PDF чеков
 */

import { Decimal } from "decimal.js";
import {
  extractTextFromPdf,
  extractTextFromPdfBuffer,
} from "./utils/textExtractor";
import { type ReceiptInfo, OcrError } from "./types/models";

/**
 * Класс для парсинга PDF чеков
 */
export class PdfReceiptParser {
  // Паттерны для извлечения данных
  private patterns = {
    amount: [
      /(?:сумма|amount|итого|total)[:\s]*([0-9\s]+[,.]?[0-9]*)\s*(?:руб|rub|₽)?/i,
      /(\d{1,3}(?:\s?\d{3})*(?:[,.]\d{2})?)\s*(?:руб|rub|₽)/i,
      /(?:₽|rub)\s*([\d\s,]+)\.?(\d{0,2})/i,
    ],
    date: /(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2})/,
    time: /(\d{1,2}:\d{2}(?::\d{2})?)/,
    reference:
      /(?:номер операции|transaction|операция|reference|ref)[:\s]*([A-Za-z0-9\-]+)/i,
    bank: /(?:сбербанк|sberbank|тинькофф|tinkoff|т-банк|t-bank|альфа-банк|alfa-bank|втб|vtb|райффайзен|raiffeisen)/i,
    recipient: /(?:получатель|recipient|кому)[:\s]*([А-Яа-яA-Za-z\s]+)/i,
    sender: /(?:отправитель|sender|от кого)[:\s]*([А-Яа-яA-Za-z\s]+)/i,
    card: /(?:\*{4}\s*\d{4}|\d{4}\s*\*{4}\s*\*{4}\s*\d{4})/,
    phone:
      /(?:\+7|8)?[\s\-]?\(?(\d{3})\)?[\s\-]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})/,
    status:
      /(?:статус|status)[:\s]*([А-Яа-яA-Za-z\s]+)|(?:выполнен|completed|успешно|successful|исполнен|executed|завершен|finished)/i,
  };

  /**
   * Парсит чек из PDF файла
   * @param pdfPath - Путь к PDF файлу
   * @returns Информация о чеке
   */
  async parseReceipt(pdfPath: string): Promise<ReceiptInfo> {
    const text = await extractTextFromPdf(pdfPath);
    return this.parseReceiptText(text);
  }

  /**
   * Парсит чек из буфера PDF
   * @param pdfBuffer - Буфер с PDF данными
   * @returns Информация о чеке
   */
  async parseReceiptFromBuffer(pdfBuffer: Buffer): Promise<ReceiptInfo> {
    const text = await extractTextFromPdfBuffer(pdfBuffer);
    return this.parseReceiptText(text);
  }

  /**
   * Парсит текст чека
   * @param text - Текст чека
   * @returns Информация о чеке
   */
  private parseReceiptText(text: string): ReceiptInfo {
    const normalized = this.normalizeText(text);

    const amount = this.extractAmount(normalized);
    if (!amount) {
      throw new OcrError("Не удалось извлечь сумму из чека");
    }

    const dateTime = this.extractDateTime(normalized) || new Date();
    const transactionId = this.extractTransactionId(normalized);
    const bankName = this.extractBankName(normalized);
    const recipient = this.extractRecipient(normalized);
    const sender = this.extractSender(normalized);
    const cardNumber = this.extractCardNumber(normalized);
    const phoneNumber = this.extractPhoneNumber(normalized);
    const status = this.extractStatus(normalized);

    return {
      dateTime,
      amount,
      recipient,
      sender,
      transactionId,
      bankName,
      cardNumber,
      phoneNumber,
      status,
      rawText: text,
    };
  }

  /**
   * Нормализует текст
   */
  private normalizeText(text: string): string {
    return text
      .replace(/\u00a0/g, " ") // Non-breaking spaces
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(" ");
  }

  /**
   * Извлекает сумму
   */
  private extractAmount(text: string): Decimal | null {
    for (const pattern of this.patterns.amount) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const amountStr = match[1].replace(/\s/g, "").replace(",", ".");

        try {
          return new Decimal(amountStr);
        } catch {
          // Намеренно игнорируем ошибку парсинга и продолжаем поиск
          continue;
        }
      }
    }

    // Пробуем найти любое число, похожее на сумму
    const amountPattern =
      /(\d{1,3}(?:\s?\d{3})*(?:[,.]\d{2})?)\s*(?:руб|rub|₽)/;
    const match = text.match(amountPattern);
    if (match && match[1]) {
      const amountStr = match[1].replace(/\s/g, "").replace(",", ".");

      try {
        return new Decimal(amountStr);
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Извлекает дату и время
   */
  private extractDateTime(text: string): Date | null {
    const dateMatch = text.match(this.patterns.date);
    const timeMatch = text.match(this.patterns.time);

    if (!dateMatch) return null;

    const dateStr = dateMatch[1];
    const timeStr = timeMatch ? timeMatch[1] : "00:00";

    const formats = [
      { regex: /(\d{2})\.(\d{2})\.(\d{4})/, format: "DD.MM.YYYY" },
      { regex: /(\d{2})\/(\d{2})\/(\d{4})/, format: "DD/MM/YYYY" },
      { regex: /(\d{4})-(\d{2})-(\d{2})/, format: "YYYY-MM-DD" },
      { regex: /(\d{2})\.(\d{2})\.(\d{2})/, format: "DD.MM.YY" },
    ];

    for (const { regex } of formats) {
      const match = dateStr.match(regex);
      if (match) {
        try {
          // Простой парсинг даты
          const [, p1, p2, p3] = match;
          let year = parseInt(p3);
          let month = parseInt(p2);
          let day = parseInt(p1);

          // Если год двузначный
          if (year < 100) {
            year += 2000;
          }

          // Для формата YYYY-MM-DD
          if (p1.length === 4) {
            year = parseInt(p1);
            month = parseInt(p2);
            day = parseInt(p3);
          }

          const [hours, minutes, seconds = 0] = timeStr.split(":").map(Number);

          return new Date(year, month - 1, day, hours, minutes, seconds);
        } catch {
          // Намеренно игнорируем ошибку парсинга и продолжаем поиск
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Извлекает ID транзакции
   */
  private extractTransactionId(text: string): string | undefined {
    const match = text.match(this.patterns.reference);
    return match ? match[1].trim() : undefined;
  }

  /**
   * Извлекает название банка
   */
  private extractBankName(text: string): string | undefined {
    // Специальный случай для T-Bank
    if (text.includes("fb@tbank.ru") && !text.includes("Банк получателя")) {
      return "T-Банк (Тинькофф)";
    }

    // Ищем банк получателя
    const bankPatterns = [
      /Банк\s*получателя\s*([А-ЯA-Z][А-Яа-яёЁA-Za-z\-]*(?:\s+[А-Яа-яёЁA-Za-z\-]+)?)/,
      /банк[:?\s]+([А-Яа-яёЁA-Za-z][А-Яа-яёЁA-Za-z\s\-\.]+?)(?=\s*\n|\s*$)/i,
    ];

    for (const pattern of bankPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return this.normalizeBankName(match[1].trim());
      }
    }

    // Используем общий паттерн
    const match = text.match(this.patterns.bank);
    return match ? this.normalizeBankName(match[0]) : undefined;
  }

  /**
   * Извлекает получателя
   */
  private extractRecipient(text: string): string | undefined {
    const match = text.match(this.patterns.recipient);
    return match ? match[1].trim() : undefined;
  }

  /**
   * Извлекает отправителя
   */
  private extractSender(text: string): string | undefined {
    const match = text.match(this.patterns.sender);
    return match ? match[1].trim() : undefined;
  }

  /**
   * Извлекает номер карты
   */
  private extractCardNumber(text: string): string | undefined {
    const match = text.match(this.patterns.card);
    return match ? match[0].trim() : undefined;
  }

  /**
   * Извлекает номер телефона
   */
  private extractPhoneNumber(text: string): string | undefined {
    const match = text.match(this.patterns.phone);
    if (match) {
      const [, area, prefix, line1, line2] = match;
      return `+7 ${area} ${prefix}-${line1}-${line2}`;
    }
    return undefined;
  }

  /**
   * Извлекает статус
   */
  private extractStatus(text: string): string | undefined {
    const match = text.match(this.patterns.status);
    if (match) {
      return match[1] ? match[1].trim() : "Выполнен";
    }
    return undefined;
  }

  /**
   * Нормализует название банка
   */
  private normalizeBankName(bank: string): string {
    const bankMap: { [key: string]: string } = {
      СБЕРБАНК: "Сбербанк",
      СБЕР: "Сбербанк",
      SBERBANK: "Сбербанк",
      "Т-БАНК": "T-Банк (Тинькофф)",
      "T-BANK": "T-Банк (Тинькофф)",
      ТИНЬКОФФ: "T-Банк (Тинькофф)",
      TINKOFF: "T-Банк (Тинькофф)",
      "АЛЬФА-БАНК": "АЛЬФА-БАНК",
      АЛЬФА: "АЛЬФА-БАНК",
      "ALFA-BANK": "АЛЬФА-БАНК",
      ВТБ: "Банк ВТБ",
      VTB: "Банк ВТБ",
      РАЙФФАЙЗЕН: "Райффайзенбанк",
      RAIFFEISEN: "Райффайзенбанк",
    };

    const upperBank = bank.toUpperCase().trim();
    return bankMap[upperBank] || bank;
  }
}
