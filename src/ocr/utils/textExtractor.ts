/**
 * Утилиты для извлечения текста из PDF
 */

import * as pdf from 'pdf-parse';
import * as fs from 'fs/promises';
import { PDFDocument } from 'pdf-lib';
import { exec } from 'child_process';
import { promisify } from 'util';
import { OcrError } from '../types/models';

const execAsync = promisify(exec);

/**
 * Извлекает текст из PDF файла
 * @param filePath - Путь к PDF файлу
 * @returns Извлеченный текст
 */
export async function extractTextFromPdf(filePath: string): Promise<string> {
  try {
    // Читаем файл
    const dataBuffer = await fs.readFile(filePath);
    
    // Пробуем извлечь текст напрямую
    try {
      const data = await pdf(dataBuffer);
      if (data.text && data.text.trim().length > 0) {
        return data.text;
      }
    } catch (error: unknown) {
      console.warn('Direct text extraction failed, trying alternative method:', error);
    }
    
    // Альтернативный метод с pdf-lib
    try {
      const pdfDoc = await PDFDocument.load(dataBuffer);
      const pages = pdfDoc.getPages();
      let text = '';
      
      // pdf-lib не поддерживает извлечение текста напрямую
      // Используем pdftotext если доступен
      try {
        const { stdout } = await execAsync(`pdftotext "${filePath}" -`);
        if (stdout && stdout.trim().length > 0) {
          return stdout;
        }
      } catch (error: unknown) {
        console.warn('pdftotext not available:', error);
      }
      
      // Если ничего не работает, возвращаем пустую строку
      // В реальном приложении здесь можно использовать OCR
      return text;
    } catch (error: unknown) {
      console.error('pdf-lib failed:', error);
    }
    
    throw new OcrError('Не удалось извлечь текст из PDF');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OcrError(`Ошибка при извлечении текста из PDF: ${message}`);
  }
}

/**
 * Извлекает текст из PDF буфера
 * @param pdfBuffer - Буфер с PDF данными
 * @returns Извлеченный текст
 */
export async function extractTextFromPdfBuffer(pdfBuffer: Buffer): Promise<string> {
  try {
    const data = await pdf(pdfBuffer);
    if (data.text && data.text.trim().length > 0) {
      return data.text;
    }
    
    throw new OcrError('PDF не содержит текста');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OcrError(`Ошибка при извлечении текста из PDF буфера: ${message}`);
  }
}