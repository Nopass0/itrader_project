/**
 * Контроллер управления транзакциями
 */

import { AuthenticatedSocket } from '../types';
import { handleError, handleSuccess } from '../middleware/auth';
import { validatePaginationParams, paginatePrisma } from '../utils/pagination';
import { PrismaClient } from '../../../generated/prisma';

const prisma = new PrismaClient();

export class TransactionController {
  /**
   * Получение списка транзакций
   */
  static async list(
    socket: AuthenticatedSocket,
    data: any,
    callback: Function
  ) {
    try {
      const params = validatePaginationParams(data);
      
      // Формируем where условие
      const where: any = {};
      
      if (data.status) {
        where.status = data.status;
      }
      
      if (data.orderId) {
        where.orderId = data.orderId;
      }
      
      if (data.dateFrom || data.dateTo) {
        where.createdAt = {};
        if (data.dateFrom) {
          where.createdAt.gte = new Date(data.dateFrom);
        }
        if (data.dateTo) {
          where.createdAt.lte = new Date(data.dateTo);
        }
      }

      const response = await paginatePrisma(
        prisma.transaction,
        {
          ...params,
          where,
          sortBy: params.sortBy || 'createdAt'
        },
        {
          payout: true,
          advertisement: true,
          chatMessages: {
            orderBy: { createdAt: 'desc' },
            take: 5 // Последние 5 сообщений
          }
        }
      );

      handleSuccess(response, undefined, callback);
    } catch (error) {
      handleError(error, callback);
    }
  }

  /**
   * Получение детальной информации о транзакции
   */
  static async get(
    socket: AuthenticatedSocket,
    data: { id: string },
    callback: Function
  ) {
    try {
      const transaction = await prisma.transaction.findUnique({
        where: { id: data.id },
        include: {
          payout: {
            include: {
              gateAccount: true
            }
          },
          advertisement: {
            include: {
              bybitAccount: true
            }
          },
          chatMessages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      handleSuccess(transaction, undefined, callback);
    } catch (error) {
      handleError(error, callback);
    }
  }

  /**
   * Обновление статуса транзакции
   */
  static async updateStatus(
    socket: AuthenticatedSocket,
    data: { id: string; status: string; reason?: string },
    callback: Function
  ) {
    try {
      // Проверяем права (только admin и operator)
      if (socket.role === 'viewer') {
        throw new Error('Viewers cannot update transactions');
      }

      // Проверяем существует ли транзакция
      const existing = await prisma.transaction.findUnique({
        where: { id: data.id }
      });

      if (!existing) {
        throw new Error('Transaction not found');
      }

      // Проверяем валидность статуса
      const validStatuses = [
        'pending',
        'chat_started',
        'waiting_payment',
        'payment_received',
        'check_received',
        'completed',
        'failed',
        'cancelled'
      ];

      // Также проверяем кастомные статусы
      const customStatuses = await prisma.customStatus.findMany();
      const allStatuses = [...validStatuses, ...customStatuses.map(s => s.code)];

      if (!allStatuses.includes(data.status)) {
        throw new Error(`Invalid status: ${data.status}`);
      }

      // Обновляем транзакцию
      const transaction = await prisma.transaction.update({
        where: { id: data.id },
        data: {
          status: data.status,
          failureReason: data.reason,
          updatedAt: new Date()
        },
        include: {
          payout: true,
          advertisement: true
        }
      });

      // Emit событие об обновлении
      socket.broadcast.emit('transaction:updated', {
        id: transaction.id,
        transaction
      });

      handleSuccess(transaction, 'Transaction status updated', callback);
    } catch (error) {
      handleError(error, callback);
    }
  }

  /**
   * Добавление кастомного статуса
   */
  static async addCustomStatus(
    socket: AuthenticatedSocket,
    data: { 
      code: string; 
      name: string; 
      description?: string; 
      color?: string;
      isFinal?: boolean;
    },
    callback: Function
  ) {
    try {
      // Только админы могут добавлять статусы
      if (socket.role !== 'admin') {
        throw new Error('Only admins can add custom statuses');
      }

      // Проверяем уникальность кода
      const existing = await prisma.customStatus.findUnique({
        where: { code: data.code }
      });

      if (existing) {
        throw new Error('Status code already exists');
      }

      const status = await prisma.customStatus.create({
        data: {
          code: data.code,
          name: data.name,
          description: data.description,
          color: data.color,
          isFinal: data.isFinal || false
        }
      });

      handleSuccess(status, 'Custom status added', callback);
    } catch (error) {
      handleError(error, callback);
    }
  }

  /**
   * Обновление кастомного статуса
   */
  static async updateCustomStatus(
    socket: AuthenticatedSocket,
    data: { id: string; updates: any },
    callback: Function
  ) {
    try {
      // Только админы могут обновлять статусы
      if (socket.role !== 'admin') {
        throw new Error('Only admins can update custom statuses');
      }

      const status = await prisma.customStatus.update({
        where: { id: data.id },
        data: data.updates
      });

      handleSuccess(status, 'Custom status updated', callback);
    } catch (error) {
      handleError(error, callback);
    }
  }

  /**
   * Удаление кастомного статуса
   */
  static async deleteCustomStatus(
    socket: AuthenticatedSocket,
    data: { id: string },
    callback: Function
  ) {
    try {
      // Только админы могут удалять статусы
      if (socket.role !== 'admin') {
        throw new Error('Only admins can delete custom statuses');
      }

      await prisma.customStatus.delete({
        where: { id: data.id }
      });

      handleSuccess(null, 'Custom status deleted', callback);
    } catch (error) {
      handleError(error, callback);
    }
  }

  /**
   * Получение списка всех статусов (включая кастомные)
   */
  static async listStatuses(
    socket: AuthenticatedSocket,
    callback: Function
  ) {
    try {
      const defaultStatuses = [
        { code: 'pending', name: 'Pending', color: '#FFA500' },
        { code: 'chat_started', name: 'Chat Started', color: '#00CED1' },
        { code: 'waiting_payment', name: 'Waiting Payment', color: '#FFD700' },
        { code: 'payment_received', name: 'Payment Received', color: '#32CD32' },
        { code: 'check_received', name: 'Check Received', color: '#00FF00' },
        { code: 'completed', name: 'Completed', color: '#008000', isFinal: true },
        { code: 'failed', name: 'Failed', color: '#FF0000', isFinal: true },
        { code: 'cancelled', name: 'Cancelled', color: '#808080', isFinal: true }
      ];

      const customStatuses = await prisma.customStatus.findMany({
        orderBy: { createdAt: 'asc' }
      });

      handleSuccess(
        {
          default: defaultStatuses,
          custom: customStatuses,
          all: [...defaultStatuses, ...customStatuses]
        },
        undefined,
        callback
      );
    } catch (error) {
      handleError(error, callback);
    }
  }

  /**
   * Получение статистики по транзакциям
   */
  static async getStatistics(
    socket: AuthenticatedSocket,
    data: { dateFrom?: string; dateTo?: string },
    callback: Function
  ) {
    try {
      const where: any = {};
      
      if (data.dateFrom || data.dateTo) {
        where.createdAt = {};
        if (data.dateFrom) {
          where.createdAt.gte = new Date(data.dateFrom);
        }
        if (data.dateTo) {
          where.createdAt.lte = new Date(data.dateTo);
        }
      }

      // Получаем статистику по статусам
      const statusStats = await prisma.transaction.groupBy({
        by: ['status'],
        where,
        _count: {
          id: true
        }
      });

      // Получаем общую сумму
      const totalAmount = await prisma.transaction.aggregate({
        where: {
          ...where,
          status: 'completed'
        },
        _sum: {
          amount: true
        }
      });

      // Получаем количество по дням
      const dailyStats = await prisma.$queryRaw`
        SELECT 
          DATE(createdAt) as date,
          COUNT(*) as count,
          SUM(amount) as amount
        FROM Transaction
        WHERE createdAt >= ${data.dateFrom ? new Date(data.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
        GROUP BY DATE(createdAt)
        ORDER BY date DESC
      `;

      handleSuccess(
        {
          statusStats,
          totalAmount: totalAmount._sum.amount || 0,
          dailyStats
        },
        undefined,
        callback
      );
    } catch (error) {
      handleError(error, callback);
    }
  }
}