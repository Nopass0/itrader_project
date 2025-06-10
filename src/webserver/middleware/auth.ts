/**
 * Middleware аутентификации для Socket.IO
 */

import { Socket } from 'socket.io';
import { AuthManager } from '../auth/authManager';
import { AuthenticatedSocket } from '../types';

const authManager = new AuthManager();

/**
 * Middleware для проверки аутентификации
 */
export async function authMiddleware(
  socket: Socket, 
  next: (err?: Error) => void
) {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const account = await authManager.verifyToken(token);
    if (!account) {
      return next(new Error('Invalid or expired token'));
    }

    // Добавляем данные пользователя в socket
    const authSocket = socket as AuthenticatedSocket;
    authSocket.userId = account.id;
    authSocket.accountId = account.id;
    authSocket.role = account.role;

    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
}

/**
 * Проверяет роль пользователя
 */
export function requireRole(roles: string[]) {
  return (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    if (!socket.role || !roles.includes(socket.role)) {
      return next(new Error('Insufficient permissions'));
    }
    next();
  };
}

/**
 * Middleware для отдельных событий - проверяет аутентификацию
 */
export function requireAuth(handler: Function) {
  return async (socket: AuthenticatedSocket, ...args: any[]) => {
    if (!socket.userId) {
      const callback = args[args.length - 1];
      if (typeof callback === 'function') {
        return callback({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
      }
      return;
    }

    return handler(socket, ...args);
  };
}

/**
 * Middleware для отдельных событий - проверяет роль
 */
export function requireEventRole(roles: string[]) {
  return (handler: Function) => {
    return async (socket: AuthenticatedSocket, ...args: any[]) => {
      if (!socket.role || !roles.includes(socket.role)) {
        const callback = args[args.length - 1];
        if (typeof callback === 'function') {
          return callback({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Insufficient permissions'
            }
          });
        }
        return;
      }

      return handler(socket, ...args);
    };
  };
}

/**
 * Обработчик ошибок
 */
export function handleError(error: any, callback?: Function) {
  console.error('[WebServer Error]', error);

  const response = {
    success: false as const,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'An error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }
  };

  if (callback && typeof callback === 'function') {
    callback(response);
  }

  return response;
}

/**
 * Обработчик успешного ответа
 */
export function handleSuccess(data?: any, message?: string, callback?: Function) {
  const response = {
    success: true as const,
    data,
    message
  };

  if (callback && typeof callback === 'function') {
    callback(response);
  }

  return response;
}