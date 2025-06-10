/**
 * WebSocket сервер для управления системой
 */

import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { authMiddleware, requireAuth } from './middleware/auth';
import { AuthManager } from './auth/authManager';

// Импорт контроллеров
import { AccountController } from './controllers/accountController';
import { TransactionController } from './controllers/transactionController';
import { PayoutController } from './controllers/payoutController';
import { AdvertisementController } from './controllers/advertisementController';
import { ExchangeRateController } from './controllers/exchangeRateController';
import { ChatController } from './controllers/chatController';
import { TemplateController } from './controllers/templateController';
import { OrchestratorController } from './controllers/orchestratorController';
import { PlatformAccountController } from './controllers/platformAccountController';

const authManager = new AuthManager();

export class WebSocketServer {
  private io: Server;
  private httpServer: any;
  private port: number;

  constructor(port: number = 3001) {
    this.port = port;
    this.httpServer = createServer();
    this.io = new Server(this.httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:3001'],
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  /**
   * Настройка middleware
   */
  private setupMiddleware() {
    // Allow all connections, auth will be checked per event
    // this.io.use(authMiddleware);
  }

  /**
   * Настройка обработчиков событий
   */
  private setupEventHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[WebServer] Client connected: ${socket.id}`);

      // Аутентификация
      socket.on('auth:login', async (data, callback) => {
        try {
          const result = await authManager.login(data);
          callback({
            success: true,
            data: {
              token: result.token,
              user: {
                id: result.user.id,
                username: result.user.username,
                role: result.user.role
              }
            }
          });
        } catch (error) {
          callback({
            success: false,
            error: {
              code: 'AUTH_FAILED',
              message: error.message
            }
          });
        }
      });

      socket.on('auth:logout', requireAuth(async (socket, callback) => {
        try {
          await authManager.logout(socket.handshake.auth?.token);
          callback({ success: true });
        } catch (error) {
          callback({
            success: false,
            error: { message: error.message }
          });
        }
      }));

      // Health check endpoint (no auth required)
      socket.on('health:check', async (callback) => {
        console.log('[WebSocketServer] Health check requested from socket:', socket.id);
        
        if (typeof callback !== 'function') {
          console.error('[WebSocketServer] Health check callback is not a function:', typeof callback);
          return;
        }
        
        const response = {
          success: true,
          data: {
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
          }
        };
        
        console.log('[WebSocketServer] Sending health check response:', response);
        callback(response);
      });

      // Управление аккаунтами системы
      socket.on('accounts:create', requireAuth(AccountController.create));
      socket.on('accounts:update', requireAuth(AccountController.update));
      socket.on('accounts:delete', requireAuth(AccountController.delete));
      socket.on('accounts:list', requireAuth(AccountController.list));
      socket.on('accounts:resetPassword', requireAuth(AccountController.resetPassword));
      socket.on('accounts:getCurrentUser', requireAuth(AccountController.getCurrentUser));
      socket.on('accounts:changePassword', requireAuth(AccountController.changePassword));

      // Управление платформенными аккаунтами (Gate, Bybit)
      socket.on('accounts:listGateAccounts', requireAuth(PlatformAccountController.listGateAccounts));
      socket.on('accounts:createGateAccount', requireAuth(PlatformAccountController.createGateAccount));
      socket.on('accounts:updateGateAccount', requireAuth(PlatformAccountController.updateGateAccount));
      socket.on('accounts:deleteGateAccount', requireAuth(PlatformAccountController.deleteGateAccount));
      socket.on('accounts:getGateAccountStats', requireAuth(PlatformAccountController.getGateAccountStats));
      socket.on('accounts:listBybitAccounts', requireAuth(PlatformAccountController.listBybitAccounts));
      socket.on('accounts:createBybitAccount', requireAuth(PlatformAccountController.createBybitAccount));
      socket.on('accounts:updateBybitAccount', requireAuth(PlatformAccountController.updateBybitAccount));
      socket.on('accounts:deleteBybitAccount', requireAuth(PlatformAccountController.deleteBybitAccount));
      socket.on('accounts:getBybitAccountStats', requireAuth(PlatformAccountController.getBybitAccountStats));

      // Управление транзакциями
      socket.on('transactions:list', requireAuth(TransactionController.list));
      socket.on('transactions:get', requireAuth(TransactionController.get));
      socket.on('transactions:updateStatus', requireAuth(TransactionController.updateStatus));
      socket.on('transactions:addCustomStatus', requireAuth(TransactionController.addCustomStatus));
      socket.on('transactions:updateCustomStatus', requireAuth(TransactionController.updateCustomStatus));
      socket.on('transactions:deleteCustomStatus', requireAuth(TransactionController.deleteCustomStatus));
      socket.on('transactions:listStatuses', requireAuth(TransactionController.listStatuses));
      socket.on('transactions:getStatistics', requireAuth(TransactionController.getStatistics));

      // Управление выплатами
      socket.on('payouts:list', requireAuth(PayoutController.list));
      socket.on('payouts:get', requireAuth(PayoutController.get));
      socket.on('payouts:create', requireAuth(PayoutController.create));
      socket.on('payouts:updateStatus', requireAuth(PayoutController.updateStatus));
      socket.on('payouts:linkToTransaction', requireAuth(PayoutController.linkToTransaction));
      socket.on('payouts:cancel', requireAuth(PayoutController.cancel));
      socket.on('payouts:retry', requireAuth(PayoutController.retry));
      socket.on('payouts:getStatistics', requireAuth(PayoutController.getStatistics));
      socket.on('payouts:export', requireAuth(PayoutController.export));

      // Управление объявлениями
      socket.on('advertisements:list', requireAuth(AdvertisementController.list));
      socket.on('advertisements:get', requireAuth(AdvertisementController.get));
      socket.on('advertisements:create', requireAuth(AdvertisementController.create));
      socket.on('advertisements:update', requireAuth(AdvertisementController.update));
      socket.on('advertisements:toggle', requireAuth(AdvertisementController.toggle));
      socket.on('advertisements:delete', requireAuth(AdvertisementController.delete));
      socket.on('advertisements:bulkUpdatePrices', requireAuth(AdvertisementController.bulkUpdatePrices));
      socket.on('advertisements:getStatistics', requireAuth(AdvertisementController.getStatistics));
      socket.on('advertisements:clone', requireAuth(AdvertisementController.clone));

      // Управление курсами валют
      socket.on('rates:get', requireAuth(ExchangeRateController.get));
      socket.on('rates:setConstant', requireAuth(ExchangeRateController.setConstant));
      socket.on('rates:toggleMode', requireAuth(ExchangeRateController.toggleMode));
      socket.on('rates:history', requireAuth(ExchangeRateController.history));
      socket.on('rates:setMarkup', requireAuth(ExchangeRateController.setMarkup));
      socket.on('rates:forceUpdate', requireAuth(ExchangeRateController.forceUpdate));
      socket.on('rates:getStatistics', requireAuth(ExchangeRateController.getStatistics));

      // Управление чатами
      socket.on('chats:list', requireAuth(ChatController.listChats));
      socket.on('chats:getMessages', requireAuth(ChatController.getMessages));
      socket.on('chats:sendMessage', requireAuth(ChatController.sendMessage));
      socket.on('chats:markAsRead', requireAuth(ChatController.markAsRead));
      socket.on('chats:getUnread', requireAuth(ChatController.getUnread));
      socket.on('chats:syncMessages', requireAuth(ChatController.syncMessages));
      socket.on('chats:getStatistics', requireAuth(ChatController.getChatStatistics));
      socket.on('chats:export', requireAuth(ChatController.exportChat));

      // Управление шаблонами
      socket.on('templates:list', requireAuth(TemplateController.list));
      socket.on('templates:get', requireAuth(TemplateController.get));
      socket.on('templates:create', requireAuth(TemplateController.create));
      socket.on('templates:update', requireAuth(TemplateController.update));
      socket.on('templates:delete', requireAuth(TemplateController.delete));
      socket.on('templates:listGroups', requireAuth(TemplateController.listGroups));
      socket.on('templates:createGroup', requireAuth(TemplateController.createGroup));
      socket.on('templates:updateGroup', requireAuth(TemplateController.updateGroup));
      socket.on('templates:deleteGroup', requireAuth(TemplateController.deleteGroup));
      socket.on('templates:findMatch', requireAuth(TemplateController.findMatch));
      socket.on('templates:test', requireAuth(TemplateController.test));
      socket.on('templates:bulkImport', requireAuth(TemplateController.bulkImport));
      socket.on('templates:export', requireAuth(TemplateController.export));

      // Управление оркестратором
      // getStatus doesn't require auth - used for health checks
      socket.on('orchestrator:getStatus', async (callback) => {
        await OrchestratorController.getStatus(socket as any, callback);
      });
      socket.on('orchestrator:start', requireAuth(OrchestratorController.start));
      socket.on('orchestrator:stop', requireAuth(OrchestratorController.stop));
      socket.on('orchestrator:restart', requireAuth(OrchestratorController.restart));
      socket.on('orchestrator:getConfig', requireAuth(OrchestratorController.getConfig));
      socket.on('orchestrator:updateConfig', requireAuth(OrchestratorController.updateConfig));
      socket.on('orchestrator:getLogs', requireAuth(OrchestratorController.getLogs));
      socket.on('orchestrator:clearLogs', requireAuth(OrchestratorController.clearLogs));
      socket.on('orchestrator:runTask', requireAuth(OrchestratorController.runTask));
      socket.on('orchestrator:getStatistics', requireAuth(OrchestratorController.getStatistics));
      socket.on('orchestrator:test', requireAuth(OrchestratorController.test));

      // Отключение
      socket.on('disconnect', () => {
        console.log(`[WebServer] Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Запуск сервера
   */
  async start() {
    // Очищаем просроченные токены при запуске
    const cleaned = await authManager.cleanupExpiredTokens();
    console.log(`[WebServer] Cleaned ${cleaned} expired tokens`);

    // Запускаем периодическую очистку токенов
    setInterval(async () => {
      await authManager.cleanupExpiredTokens();
    }, 60 * 60 * 1000); // Каждый час

    return new Promise((resolve) => {
      this.httpServer.listen(this.port, () => {
        console.log(`[WebServer] Socket.IO server listening on port ${this.port}`);
        resolve(undefined);
      });
    });
  }

  /**
   * Остановка сервера
   */
  async stop() {
    return new Promise((resolve) => {
      this.io.close(() => {
        console.log('[WebServer] Socket.IO server stopped');
        resolve(undefined);
      });
    });
  }

  /**
   * Получение экземпляра Socket.IO
   */
  getIO() {
    return this.io;
  }
}