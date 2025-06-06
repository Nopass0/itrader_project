/**
 * Клиент для работы с Gate.io API
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  AxiosError,
} from "axios";
import { Decimal } from "decimal.js";
import FormData from "form-data";
import fs from "fs";
import {
  type Cookie,
  type GateResponse,
  type LoginResponse,
  type AuthMeResponse,
  type BalanceResponse,
  type GateTransaction,
  type TransactionFilter,
  type Payout,
  type PayoutsResponse,
  type PayoutResponse,
  GateApiError,
  CloudflareError,
  SessionExpiredError,
  RateLimitError,
  type GateClientOptions,
} from "./types/models";
import { RateLimiter } from "./utils/rateLimiter";
import {
  parseCookieString,
  cookiesToString,
  saveCookiesToFile,
  loadCookiesFromFile,
  filterValidCookies,
  mergeCookies,
} from "./utils/cookieUtils";

/**
 * Клиент для работы с Gate.io API
 * Поддерживает авторизацию, управление cookies и rate limiting
 */
export class GateClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private cookies: Cookie[] = [];
  private rateLimiter: RateLimiter;
  private email?: string;

  /**
   * Создает новый экземпляр GateClient
   * @param rateLimiter - RateLimiter для контроля частоты запросов
   * @param options - Дополнительные опции
   */
  constructor(rateLimiter: RateLimiter, options: GateClientOptions = {}) {
    this.baseUrl = options.baseUrl || "https://panel.gate.cx/api/v1";
    this.rateLimiter = rateLimiter;

    this.client = axios.create({
      timeout: options.timeout || 30000,
      maxRedirects: 0,
      validateStatus: () => true, // Обрабатываем все статусы
    });

    // Перехватчик для добавления cookies
    this.client.interceptors.request.use(
      async (config) => {
        // Ждем разрешения от rate limiter
        await this.rateLimiter.checkAndWait("gate");

        // Добавляем cookies
        if (this.cookies.length > 0) {
          config.headers["Cookie"] = cookiesToString(this.cookies);
        }

        return config;
      },
      (error) => Promise.reject(error),
    );

    // Перехватчик для обработки ответов
    this.client.interceptors.response.use(
      (response) => {
        // Сохраняем новые cookies
        const setCookieHeaders = response.headers["set-cookie"];
        if (setCookieHeaders) {
          const newCookies: Cookie[] = [];
          setCookieHeaders.forEach((cookieStr: string) => {
            const cookie = parseCookieString(cookieStr);
            if (cookie) newCookies.push(cookie);
          });

          if (newCookies.length > 0) {
            this.cookies = mergeCookies(this.cookies, newCookies);
            console.log(`[GateClient] Обновлено ${newCookies.length} cookies`);
          }
        }

        return response;
      },
      (error) => Promise.reject(error),
    );
  }

  /**
   * Выполняет авторизацию в Gate.io
   * @param email - Email пользователя
   * @param password - Пароль пользователя
   * @returns Информация о сессии
   * @throws {GateApiError} При ошибке авторизации
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    console.log(`[GateClient] Авторизация для ${email}`);
    this.email = email;

    const response = await this.client.post(
      `${this.baseUrl}/auth/basic/login`,
      { login: email, password },
      this.getRequestConfig(),
    );

    this.checkResponse(response);

    // Если получили cookies, считаем авторизацию успешной
    if (this.cookies.length > 0) {
      console.log(
        `[GateClient] Успешная авторизация для ${email} (получено ${this.cookies.length} cookies)`,
      );
      return {
        userId: "from_cookies",
        sessionId: "from_cookies",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
    }

    const data = response.data as GateResponse<LoginResponse>;
    if (!data.success) {
      throw new GateApiError(data.error || "Ошибка авторизации");
    }

    console.log(`[GateClient] Успешная авторизация для ${email}`);
    return data.response!;
  }

  /**
   * Устанавливает cookies для клиента
   * @param cookies - Массив cookies
   */
  setCookies(cookies: Cookie[]): void {
    this.cookies = filterValidCookies(cookies);
    console.log(`[GateClient] Установлено ${this.cookies.length} cookies`);
  }

  /**
   * Получает текущие cookies
   * @returns Массив cookies
   */
  getCookies(): Cookie[] {
    return this.cookies;
  }

  /**
   * Сохраняет cookies в файл
   * @param filePath - Путь к файлу
   */
  async saveCookies(filePath: string): Promise<void> {
    await saveCookiesToFile(this.cookies, filePath);
  }

  /**
   * Загружает cookies из файла
   * @param filePath - Путь к файлу
   */
  async loadCookies(filePath: string): Promise<void> {
    const cookies = await loadCookiesFromFile(filePath);
    this.setCookies(cookies);
  }

  /**
   * Получает баланс по валюте
   * @param currency - Код валюты (например, RUB)
   * @returns Информация о балансе
   * @throws {SessionExpiredError} При истечении сессии
   */
  async getBalance(currency: string): Promise<BalanceResponse> {
    const response = await this.client.get(
      `${this.baseUrl}/auth/me`,
      this.getRequestConfig(),
    );

    this.checkResponse(response);

    const data = response.data as GateResponse<AuthMeResponse>;
    if (!data.success) {
      throw new GateApiError(data.error || "Ошибка получения баланса");
    }

    const authResponse = data.response!;
    const wallet = authResponse.user.wallets.find(
      (w) =>
        w.currency.code.toUpperCase() === currency.toUpperCase() ||
        (w.currency.code === "643" && currency.toUpperCase() === "RUB"),
    );

    if (!wallet) {
      throw new GateApiError(`Кошелек для валюты ${currency} не найден`);
    }

    const balance = new Decimal(wallet.balance);
    return {
      currency,
      balance,
      available: balance,
      locked: new Decimal(0),
    };
  }

  /**
   * Получает список доступных транзакций (статус 4 или 5)
   * @returns Массив транзакций
   */
  async getAvailableTransactions(): Promise<Payout[]> {
    const url = `${this.baseUrl}/payments/payouts?filters%5Bstatus%5D%5B%5D=4&filters%5Bstatus%5D%5B%5D=5&page=1`;

    const response = await this.client.get(url, this.getRequestConfig());
    this.checkResponse(response);

    const data = response.data as GateResponse<PayoutsResponse>;
    if (!data.success) {
      throw new GateApiError(data.error || "Ошибка получения транзакций");
    }

    const transactions = data.response!.payouts.data;
    console.log(
      `[GateClient] Найдено ${transactions.length} доступных транзакций`,
    );
    return transactions;
  }

  /**
   * Получает транзакции с фильтром
   * @param filter - Фильтр для транзакций
   * @returns Массив транзакций
   */
  async getTransactionsWithFilter(
    filter: TransactionFilter,
  ): Promise<GateTransaction[]> {
    const params = new URLSearchParams();
    if (filter.page) params.append("page", filter.page.toString());
    if (filter.limit) params.append("per_page", filter.limit.toString());
    else params.append("per_page", "30");

    const response = await this.client.get(
      `${this.baseUrl}/payments/payouts?${params}`,
      this.getRequestConfig(),
    );

    this.checkResponse(response);

    const data = response.data as GateResponse<PayoutsResponse>;
    if (!data.success) {
      throw new GateApiError(data.error || "Ошибка получения транзакций");
    }

    const payouts = data.response!.payouts.data;
    return payouts
      .filter((payout) => payout.amount.trader["643"] !== undefined)
      .map((payout) => this.payoutToTransaction(payout));
  }

  /**
   * Получает все транзакции
   * @returns Массив транзакций
   */
  async getTransactions(): Promise<GateTransaction[]> {
    return this.getTransactionsWithFilter({});
  }

  /**
   * Принимает транзакцию в работу (показывает детали)
   * @param transactionId - ID транзакции
   * @throws {GateApiError} При ошибке
   */
  async acceptTransaction(transactionId: string): Promise<void> {
    console.log(`[GateClient] Принятие транзакции ${transactionId}`);

    const response = await this.client.post(
      `${this.baseUrl}/payments/payouts/${transactionId}/show`,
      {},
      this.getRequestConfig(),
    );

    // Проверяем различные статусы ответа
    if (
      response.status === 409 ||
      response.status === 422 ||
      response.status === 400
    ) {
      const data = response.data;
      if (
        data?.response?.error_description?.includes("incorrect_status") ||
        data?.message?.includes("already") ||
        data?.message?.includes("processing")
      ) {
        console.warn(`[GateClient] Транзакция ${transactionId} уже обработана`);
        return;
      }
    }

    this.checkResponse(response);
    console.log(`[GateClient] Транзакция ${transactionId} успешно принята`);
  }

  /**
   * Подтверждает транзакцию с чеком
   * @param transactionId - ID транзакции
   * @param receiptPath - Путь к PDF файлу чека
   * @returns Обновленная транзакция
   */
  async approveTransactionWithReceipt(
    transactionId: string,
    receiptPath: string,
  ): Promise<Payout> {
    console.log(
      `[GateClient] Подтверждение транзакции ${transactionId} с чеком ${receiptPath}`,
    );

    const form = new FormData();
    form.append("attachments[]", fs.createReadStream(receiptPath), {
      filename: "receipt.pdf",
      contentType: "application/pdf",
    });

    const config = this.getRequestConfig();
    config.headers = {
      ...config.headers,
      ...form.getHeaders(),
    };

    const response = await this.client.post(
      `${this.baseUrl}/payments/payouts/${transactionId}/approve`,
      form,
      config,
    );

    this.checkResponse(response);

    const data = response.data as GateResponse<PayoutResponse>;
    if (!data.success) {
      throw new GateApiError(data.error || "Ошибка подтверждения транзакции");
    }

    console.log(
      `[GateClient] Транзакция ${transactionId} успешно подтверждена с чеком`,
    );
    return data.response!.payout;
  }

  /**
   * Подтверждает транзакцию без чека
   * @param transactionId - ID транзакции
   * @returns Обновленная транзакция
   */
  async approveTransaction(transactionId: string): Promise<Payout> {
    console.log(`[GateClient] Подтверждение транзакции ${transactionId}`);

    const response = await this.client.post(
      `${this.baseUrl}/payments/payouts/${transactionId}/approve`,
      {},
      this.getRequestConfig(),
    );

    this.checkResponse(response);

    const data = response.data as GateResponse<PayoutResponse>;
    if (!data.success) {
      throw new GateApiError(data.error || "Ошибка подтверждения транзакции");
    }

    console.log(
      `[GateClient] Транзакция ${transactionId} успешно подтверждена`,
    );
    return data.response!.payout;
  }

  /**
   * Отменяет заказ
   * @param transactionId - ID транзакции
   * @returns Обновленная транзакция
   */
  async cancelOrder(transactionId: string): Promise<Payout> {
    console.log(`[GateClient] Отмена заказа ${transactionId}`);

    const response = await this.client.post(
      `${this.baseUrl}/payments/payouts/${transactionId}/cancel`,
      {},
      this.getRequestConfig(),
    );

    this.checkResponse(response);

    const data = response.data as GateResponse<PayoutResponse>;
    if (!data.success) {
      throw new GateApiError(data.error || "Ошибка отмены заказа");
    }

    console.log(`[GateClient] Заказ ${transactionId} успешно отменен`);
    return data.response!.payout;
  }

  /**
   * Получает детали транзакции
   * @param transactionId - ID транзакции
   * @returns Детали транзакции
   */
  async getTransactionDetails(transactionId: string): Promise<Payout> {
    const response = await this.client.get(
      `${this.baseUrl}/payments/payouts/${transactionId}/`,
      this.getRequestConfig(),
    );

    this.checkResponse(response);

    const data = response.data;

    // Пробуем разные форматы ответа
    if (data.success && data.response?.payout) {
      return data.response.payout;
    } else if (data.success && data.response) {
      return data.response;
    }

    throw new GateApiError("Не удалось получить детали транзакции");
  }

  /**
   * Получает историю транзакций
   * @param page - Номер страницы
   * @returns Массив транзакций
   */
  async getHistoryTransactions(page: number = 1): Promise<Payout[]> {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: "30",
    });

    const response = await this.client.get(
      `${this.baseUrl}/payments/payouts?${params}`,
      this.getRequestConfig(),
    );

    this.checkResponse(response);

    const data = response.data as GateResponse<PayoutsResponse>;
    if (!data.success) {
      throw new GateApiError(data.error || "Ошибка получения истории");
    }

    const transactions = data.response!.payouts.data.filter(
      (payout) =>
        (payout.status === 7 && payout.approvedAt) || payout.status === 9,
    );

    console.log(
      `[GateClient] Найдено ${transactions.length} транзакций в истории (страница ${page})`,
    );
    return transactions;
  }

  /**
   * Устанавливает баланс (для тестирования или специальных операций)
   * @param amount - Сумма для установки
   * @returns Установленная сумма
   */
  async setBalance(amount: number): Promise<number> {
    const response = await this.client.post(
      `${this.baseUrl}/payments/payouts/balance`,
      { amount: amount.toString() },
      this.getRequestConfig()
    );

    const status = response.status;
    const responseText = response.data;

    console.log(`[GateClient] Set balance response (status ${status}):`, responseText);

    if (!response.status || response.status >= 400) {
      throw new GateApiError(
        `Не удалось установить баланс: HTTP ${status} - ${JSON.stringify(responseText)}`
      );
    }

    const data = response.data as GateResponse<any>;
    if (!data.success) {
      throw new GateApiError(
        data.error || 'Ошибка установки баланса'
      );
    }

    console.log(`[GateClient] Баланс успешно установлен: ${amount}`);
    return amount;
  }

  /**
   * Получает транзакции со статусом "ожидание" (статус 4)
   * @returns Массив транзакций в ожидании
   */
  async getPendingTransactions(): Promise<Payout[]> {
    const url = `${this.baseUrl}/payments/payouts?filters%5Bstatus%5D%5B%5D=4&page=1`;
    
    const response = await this.client.get(url, this.getRequestConfig());
    this.checkResponse(response);

    const data = response.data as GateResponse<PayoutsResponse>;
    if (!data.success) {
      throw new GateApiError(data.error || "Ошибка получения ожидающих транзакций");
    }

    const transactions = data.response!.payouts.data;
    console.log(
      `[GateClient] Найдено ${transactions.length} транзакций в ожидании (статус 4)`
    );
    return transactions;
  }

  /**
   * Ищет транзакцию по ID
   * @param transactionId - ID транзакции для поиска
   * @returns Найденная транзакция или undefined
   */
  async searchTransactionById(transactionId: string): Promise<Payout | undefined> {
    const url = `${this.baseUrl}/payments/payouts?search%5Bid%5D=${transactionId}&filters%5Bstatus%5D%5B%5D=4&filters%5Bstatus%5D%5B%5D=5&page=1`;
    
    console.log(`[GateClient] Поиск транзакции ${transactionId}`);
    
    const response = await this.client.get(url, this.getRequestConfig());
    this.checkResponse(response);

    const data = response.data as GateResponse<PayoutsResponse>;
    
    if (data.success && data.response) {
      const payouts = data.response.payouts.data;
      if (payouts.length > 0) {
        const payout = payouts[0];
        console.log(`[GateClient] Найдена транзакция ${transactionId}`);
        return payout;
      }
    }

    console.log(`[GateClient] Транзакция ${transactionId} не найдена`);
    return undefined;
  }

  /**
   * Проверяет, авторизован ли клиент
   * @returns true если авторизован
   */
  async isAuthenticated(): Promise<boolean> {
    if (this.cookies.length === 0) {
      return false;
    }

    try {
      await this.getBalance("RUB");
      return true;
    } catch {
      // Намеренно игнорируем ошибку - клиент не авторизован
      return false;
    }
  }

  /**
   * Получает email текущего пользователя
   * @returns Email или undefined
   */
  getEmail(): string | undefined {
    return this.email;
  }

  /**
   * Преобразует Payout в GateTransaction
   */
  private payoutToTransaction(payout: Payout): GateTransaction {
    const rubAmount = payout.amount.trader["643"] || 0;
    const rubTotal = payout.total.trader["643"] || 0;

    return {
      id: payout.id.toString(),
      orderId: payout.id.toString(),
      amount: new Decimal(rubAmount),
      currency: "RUB",
      fiatCurrency: "RUB",
      fiatAmount: new Decimal(rubTotal),
      rate: new Decimal(1),
      status: payout.status,
      buyerName: payout.user?.name || "Unknown",
      paymentMethod: payout.method.label,
      createdAt: new Date(payout.createdAt),
      updatedAt: payout.updatedAt
        ? new Date(payout.updatedAt)
        : new Date(payout.createdAt),
    };
  }

  /**
   * Получает конфигурацию для запроса
   */
  private getRequestConfig(): AxiosRequestConfig {
    return {
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://panel.gate.cx/",
        Origin: "https://panel.gate.cx",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "identity",
        DNT: "1",
      },
    };
  }

  /**
   * Проверяет ответ на ошибки
   */
  private checkResponse(response: any): void {
    switch (response.status) {
      case 200:
      case 201:
        return;
      case 401:
        throw new SessionExpiredError();
      case 403:
        throw new CloudflareError();
      case 429:
        throw new RateLimitError(60);
      default:
        if (response.status >= 400) {
          throw new GateApiError(
            `HTTP ${response.status}: ${response.statusText}`,
            "HTTP_ERROR",
            response.status,
          );
        }
    }
  }
}
