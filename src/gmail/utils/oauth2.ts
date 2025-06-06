/**
 * Утилиты для работы с OAuth2 авторизацией Google
 */

import { google, Auth } from "googleapis";
import readline from "readline";
import fs from "fs/promises";
import path from "path";
import {
  type OAuth2Token,
  type OAuth2Credentials,
  type CredentialsFile,
  GmailAuthError,
} from "../types/models";

/**
 * Класс для управления OAuth2 авторизацией
 */
export class OAuth2Manager {
  private oauth2Client: Auth.OAuth2Client;
  private credentials: OAuth2Credentials;
  private scopes: string[];

  /**
   * Создает новый экземпляр OAuth2Manager
   * @param credentials - Учетные данные OAuth2
   * @param scopes - Области доступа
   * @param useOobRedirect - Использовать OOB redirect для показа кода в браузере
   */
  constructor(
    credentials: OAuth2Credentials, 
    scopes: string[] = [],
    useOobRedirect: boolean = true
  ) {
    this.credentials = credentials;
    this.scopes = scopes.length > 0 ? scopes : [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
    ];

    // Используем OOB redirect URI для показа кода в браузере или берем из credentials
    const redirectUri = useOobRedirect 
      ? "urn:ietf:wg:oauth:2.0:oob"
      : credentials.redirect_uris[0];

    // Создаем OAuth2 клиент
    this.oauth2Client = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      redirectUri,
    );
  }

  /**
   * Создает OAuth2Manager из файла credentials
   * @param credentialsPath - Путь к файлу credentials.json
   * @param scopes - Области доступа
   * @param useOobRedirect - Использовать OOB redirect для показа кода
   */
  static async fromCredentialsFile(
    credentialsPath: string,
    scopes?: string[],
    useOobRedirect: boolean = true,
  ): Promise<OAuth2Manager> {
    const content = await fs.readFile(credentialsPath, "utf-8");
    const credentials = JSON.parse(content) as CredentialsFile;

    const oauth2Credentials = credentials.installed || credentials.web;
    if (!oauth2Credentials) {
      throw new GmailAuthError(
        "Неверный формат файла credentials.json",
      );
    }

    return new OAuth2Manager(oauth2Credentials, scopes, useOobRedirect);
  }

  /**
   * Создает OAuth2Manager из JSON строки или объекта
   * @param credentialsJson - JSON строка или объект с credentials
   * @param scopes - Области доступа
   * @param useOobRedirect - Использовать OOB redirect для показа кода
   */
  static fromCredentialsJson(
    credentialsJson: string | CredentialsFile,
    scopes?: string[],
    useOobRedirect: boolean = true,
  ): OAuth2Manager {
    const credentials =
      typeof credentialsJson === "string"
        ? (JSON.parse(credentialsJson) as CredentialsFile)
        : credentialsJson;

    const oauth2Credentials = credentials.installed || credentials.web;
    if (!oauth2Credentials) {
      throw new GmailAuthError(
        "Неверный формат credentials",
      );
    }

    return new OAuth2Manager(oauth2Credentials, scopes, useOobRedirect);
  }

  /**
   * Получает URL для авторизации
   * @param state - Дополнительный state параметр
   * @returns URL для авторизации
   */
  getAuthUrl(state?: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: this.scopes,
      state,
    });
  }

  /**
   * Авторизует пользователя интерактивно через консоль
   * @returns Токены авторизации
   */
  async authorizeInteractive(): Promise<OAuth2Token> {
    const authUrl = this.getAuthUrl();

    console.log("Авторизация Gmail:");
    console.log("1. Откройте следующую ссылку в браузере:");
    console.log(authUrl);
    console.log("2. Разрешите доступ к вашей учетной записи");
    console.log("3. Скопируйте код авторизации");

    const code = await this.promptForCode();
    return await this.getTokenFromCode(code);
  }

  /**
   * Авторизует пользователя с помощью помощника
   * @returns Токены авторизации
   */
  async authorizeWithHelper(): Promise<OAuth2Token> {
    const { promptForRedirectUrl } = await import("./authHelper");
    const authUrl = this.getAuthUrl();

    console.log("\n🔐 Авторизация Gmail:");
    console.log("Откройте следующую ссылку в браузере:");
    console.log("\n" + authUrl);

    const code = await promptForRedirectUrl();
    return await this.getTokenFromCode(code);
  }

  /**
   * Получает токены по коду авторизации
   * @param code - Код авторизации
   * @returns Токены
   */
  async getTokenFromCode(code: string): Promise<OAuth2Token> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      
      if (!tokens.access_token) {
        throw new GmailAuthError("Не удалось получить access token");
      }

      // Устанавливаем токены в клиент
      this.oauth2Client.setCredentials(tokens);

      return tokens as OAuth2Token;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new GmailAuthError(
          `Ошибка получения токена: ${error.message}`,
        );
      }
      throw new GmailAuthError("Неизвестная ошибка при получении токена");
    }
  }

  /**
   * Устанавливает токены в OAuth2 клиент
   * @param tokens - Токены
   */
  setTokens(tokens: OAuth2Token): void {
    this.oauth2Client.setCredentials(tokens);
  }

  /**
   * Обновляет access token используя refresh token
   * @returns Обновленные токены
   */
  async refreshTokens(): Promise<OAuth2Token> {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      return credentials as OAuth2Token;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new GmailAuthError(
          `Ошибка обновления токена: ${error.message}`,
        );
      }
      throw new GmailAuthError("Неизвестная ошибка при обновлении токена");
    }
  }

  /**
   * Проверяет, истек ли токен
   * @param tokens - Токены для проверки
   * @returns true если токен истек
   */
  isTokenExpired(tokens: OAuth2Token): boolean {
    if (!tokens.expiry_date) {
      return false;
    }
    return Date.now() >= tokens.expiry_date;
  }

  /**
   * Получает OAuth2 клиент
   * @returns OAuth2Client
   */
  getOAuth2Client(): Auth.OAuth2Client {
    return this.oauth2Client;
  }

  /**
   * Запрашивает код авторизации у пользователя
   * @returns Код авторизации
   */
  private promptForCode(): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question("Введите код авторизации: ", (code) => {
        rl.close();
        resolve(code.trim());
      });
    });
  }
}

/**
 * Сохраняет токены в файл
 * @param tokens - Токены
 * @param filePath - Путь к файлу
 */
export async function saveTokensToFile(
  tokens: OAuth2Token,
  filePath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(tokens, null, 2));
  console.log(`[OAuth2] Токены сохранены в ${filePath}`);
}

/**
 * Загружает токены из файла
 * @param filePath - Путь к файлу
 * @returns Токены или null
 */
export async function loadTokensFromFile(
  filePath: string,
): Promise<OAuth2Token | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as OAuth2Token;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Проверяет, содержат ли токены все необходимые scopes
 * @param tokens - Токены
 * @param requiredScopes - Требуемые scopes
 * @returns true если все scopes присутствуют
 */
export function hasRequiredScopes(
  tokens: OAuth2Token,
  requiredScopes: string[],
): boolean {
  if (!tokens.scope) {
    return false;
  }

  const tokenScopes = tokens.scope.split(" ");
  return requiredScopes.every((scope) => tokenScopes.includes(scope));
}