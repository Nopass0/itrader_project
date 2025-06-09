/**
 * Типизированный парсер чеков Тинькофф
 */

import { extractTextFromPdfBuffer } from "./utils/textExtractor";
import * as fs from "fs/promises";

// Типы переводов
export enum TransferType {
  BY_PHONE = "BY_PHONE", // По номеру телефона
  TO_TBANK = "TO_TBANK", // Клиенту Т-Банка
  TO_CARD = "TO_CARD" // На карту
}

// Базовый интерфейс чека
export interface BaseReceipt {
  // Общие поля для всех типов чеков
  datetime: Date; // Дата и время из чека
  amount: number; // Сумма (не Итого!)
  status: "SUCCESS"; // Только успешные чеки
  sender: string; // Отправитель
  transferType: TransferType;
  commission?: number; // Комиссия (есть у некоторых типов)
}

// Чек с переводом по номеру телефона
export interface PhoneTransferReceipt extends BaseReceipt {
  transferType: TransferType.BY_PHONE;
  recipientPhone: string; // Телефон получателя
  recipientBank?: string; // Банк получателя (необязательный)
}

// Чек с переводом клиенту Т-Банка
export interface TBankTransferReceipt extends BaseReceipt {
  transferType: TransferType.TO_TBANK;
  recipientName: string; // Имя получателя (вместо отправителя)
  recipientCard: string; // Последние 4 цифры карты (*4207)
}

// Чек с переводом на карту
export interface CardTransferReceipt extends BaseReceipt {
  transferType: TransferType.TO_CARD;
  recipientCard: string; // Маскированный номер карты (220024******2091)
  commission: number; // Обязательная комиссия
}

// Объединенный тип для всех видов чеков
export type ParsedReceipt = PhoneTransferReceipt | TBankTransferReceipt | CardTransferReceipt;

// Ошибка парсинга чека
export class ReceiptParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptParseError";
  }
}

export class TinkoffReceiptParser {
  /**
   * Парсит чек из PDF файла
   */
  async parseReceiptFromFile(filePath: string): Promise<ParsedReceipt> {
    const pdfBuffer = await fs.readFile(filePath);
    return this.parseReceiptFromBuffer(pdfBuffer);
  }

  /**
   * Парсит чек из буфера PDF
   */
  async parseReceiptFromBuffer(pdfBuffer: Buffer): Promise<ParsedReceipt> {
    const text = await extractTextFromPdfBuffer(pdfBuffer);
    return this.parseReceiptText(text);
  }

  /**
   * Парсит текст чека
   */
  private parseReceiptText(text: string): ParsedReceipt {
    // Проверяем статус - обязательно должно быть "Успешно"
    if (!text.includes("Успешно")) {
      throw new ReceiptParseError("Чек бракованный: не найден статус 'Успешно'");
    }

    // Извлекаем дату и время
    const datetime = this.extractDateTime(text);
    if (!datetime) {
      throw new ReceiptParseError("Не удалось извлечь дату и время из чека");
    }

    // Извлекаем сумму (не Итого!)
    const amount = this.extractAmount(text);
    if (!amount) {
      throw new ReceiptParseError("Не удалось извлечь сумму из чека");
    }

    // Извлекаем отправителя
    const sender = this.extractSender(text);
    if (!sender) {
      throw new ReceiptParseError("Не удалось извлечь отправителя из чека");
    }

    // Определяем тип перевода
    const transferType = this.detectTransferType(text);

    // Парсим в зависимости от типа
    switch (transferType) {
      case TransferType.BY_PHONE:
        return this.parsePhoneTransfer(text, datetime, amount, sender);
      case TransferType.TO_TBANK:
        return this.parseTBankTransfer(text, datetime, amount, sender);
      case TransferType.TO_CARD:
        return this.parseCardTransfer(text, datetime, amount, sender);
    }
  }

  private extractDateTime(text: string): Date | null {
    // Ищем дату в формате "09.06.2025 17:10:18"
    const match = text.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return null;

    const [_, day, month, year, hours, minutes, seconds] = match;
    return new Date(
      parseInt(year),
      parseInt(month) - 1, // Месяцы в JS начинаются с 0
      parseInt(day),
      parseInt(hours),
      parseInt(minutes),
      parseInt(seconds)
    );
  }

  private extractAmount(text: string): number | null {
    // Ищем сумму - число перед словом "Сумма" с знаком рубля
    // Формат: "16 000 iСумма" или "2 880 i Сумма"
    const match = text.match(/(\d+(?:\s+\d+)*)\s*[₽i]\s*Сумма/);
    if (!match) return null;

    // Убираем пробелы из числа
    const amountStr = match[1].replace(/\s+/g, "");
    return parseInt(amountStr);
  }

  private extractSender(text: string): string | null {
    // Нормализуем текст для поиска - добавляем пробелы перед заглавными буквами после строчных
    let normalizedText = text.replace(/([а-я])([А-Я])/g, '$1 $2');
    
    // Ищем паттерн "Отправитель <имя>"
    const match = normalizedText.match(/Отправитель\s+([А-Яа-я][А-Яа-яA-Za-z\s]+?)(?=\s*(?:Телефон|Получатель|Карта|Банк|Счет|$))/);
    
    if (match) {
      const sender = match[1].trim();
      if (sender.length > 2) {
        return sender;
      }
    }

    // Если не нашли, пробуем найти в оригинальном тексте для слитных случаев
    const mergedMatch = text.match(/([А-Яа-я][А-Яа-яA-Za-z\s]+?)Отправитель/);
    if (mergedMatch) {
      let sender = mergedMatch[1].trim();
      // Удаляем известные префиксы
      const prefixPattern = /^(?:.*?)(?:Сумма|КомиссияБез комиссии|Комиссия|Без комиссии)\s*/i;
      sender = sender.replace(prefixPattern, '').trim();
      
      if (sender.length > 2 && /^[А-Яа-я]/.test(sender)) {
        return sender;
      }
    }

    return null;
  }

  private detectTransferType(text: string): TransferType {
    if (text.includes("По номеру телефона")) {
      return TransferType.BY_PHONE;
    } else if (text.includes("Клиенту Т-Банка")) {
      return TransferType.TO_TBANK;
    } else if (text.includes("На карту")) {
      return TransferType.TO_CARD;
    }
    
    throw new ReceiptParseError("Не удалось определить тип перевода");
  }

  private parsePhoneTransfer(
    text: string,
    datetime: Date,
    amount: number,
    sender: string
  ): PhoneTransferReceipt {
    // Извлекаем телефон получателя (с учетом разных форматов)
    const phoneMatch = text.match(/Телефон получателя[\s\n]*(\+7\s*\(\d{3}\)\s*\d{3}-\d{2}-\d{2})/);
    if (!phoneMatch) {
      throw new ReceiptParseError("Не найден телефон получателя");
    }

    // Извлекаем банк получателя (может быть на следующей строке)
    const bankMatch = text.match(/Банк получателя[\s\n]*([^\n]+?)(?=\s*Счет|\s*Идентификатор|\s*$)/);

    // Проверяем комиссию
    const commission = this.extractCommission(text);

    const result: PhoneTransferReceipt = {
      datetime,
      amount,
      status: "SUCCESS",
      sender,
      transferType: TransferType.BY_PHONE,
      recipientPhone: phoneMatch[1].trim()
    };

    if (bankMatch) {
      result.recipientBank = bankMatch[1].trim();
    }

    if (commission !== null && commission !== 0) {
      result.commission = commission;
    }

    return result;
  }

  private parseTBankTransfer(
    text: string,
    datetime: Date,
    amount: number,
    sender: string
  ): TBankTransferReceipt {
    // Извлекаем имя получателя
    const recipientMatch = text.match(/Получатель[\s\n]*([^\n]+?)(?=\s*(?:Квитанция|Служба|$))/);
    if (!recipientMatch) {
      throw new ReceiptParseError("Не найден получатель");
    }

    // Извлекаем последние 4 цифры карты
    const cardMatch = text.match(/Карта получателя[\s\n]*\*(\d{4})/);
    if (!cardMatch) {
      throw new ReceiptParseError("Не найдена карта получателя");
    }

    return {
      datetime,
      amount,
      status: "SUCCESS",
      sender,
      transferType: TransferType.TO_TBANK,
      recipientName: recipientMatch[1].trim(),
      recipientCard: `*${cardMatch[1]}`
    };
  }

  private parseCardTransfer(
    text: string,
    datetime: Date,
    amount: number,
    sender: string
  ): CardTransferReceipt {
    // Извлекаем маскированный номер карты
    const cardMatch = text.match(/Карта получателя[\s\n]*(\d{6}\*{6}\d{4})/);
    if (!cardMatch) {
      throw new ReceiptParseError("Не найдена карта получателя");
    }

    // Для переводов на карту комиссия обязательна
    const commission = this.extractCommission(text);
    if (commission === null) {
      throw new ReceiptParseError("Не найдена комиссия для перевода на карту");
    }

    return {
      datetime,
      amount,
      status: "SUCCESS",
      sender,
      transferType: TransferType.TO_CARD,
      recipientCard: cardMatch[1],
      commission
    };
  }

  private extractCommission(text: string): number | null {
    // Ищем комиссию (может быть на следующей строке)
    const match = text.match(/Комиссия[\s\n]*(\d+(?:\s+\d+)*)/);
    if (!match) {
      // Проверяем "Без комиссии"
      if (text.includes("Без комиссии")) {
        return 0;
      }
      return null;
    }

    // Убираем пробелы из числа
    const commissionStr = match[1].replace(/\s+/g, "");
    return parseInt(commissionStr);
  }
}