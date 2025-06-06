/**
 * HTTP client for Bybit API requests
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { P2PConfig, ApiResponse, P2PError } from '../types/p2p';
import { SignatureUtils } from './signature';

export class HttpClient {
  private axios: AxiosInstance;
  private config: P2PConfig;
  private baseUrl: string;

  constructor(config: P2PConfig) {
    this.config = config;
    this.baseUrl = config.testnet 
      ? 'https://api-testnet.bybit.com'
      : 'https://api.bybit.com';

    this.axios = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-BAPI-API-KEY': config.apiKey,
      },
    });

    // Add request interceptor for authentication
    this.axios.interceptors.request.use(
      (config) => this.addAuthHeaders(config),
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.axios.interceptors.response.use(
      (response) => this.handleResponse(response),
      (error) => this.handleError(error)
    );
  }

  /**
   * Add authentication headers to request
   */
  private addAuthHeaders(config: AxiosRequestConfig): AxiosRequestConfig {
    const timestamp = SignatureUtils.getTimestamp();
    const recvWindow = this.config.recvWindow?.toString() || '5000';
    
    // Prepare query string
    let queryString = '';
    
    if (config.method?.toUpperCase() === 'GET' && config.params) {
      queryString = SignatureUtils.generateQueryString(config.params);
    } else if (config.method?.toUpperCase() === 'POST' && config.data) {
      queryString = SignatureUtils.generateQueryString(config.data);
    }

    // Generate signature
    const signature = SignatureUtils.generateSignature(
      timestamp,
      this.config.apiKey,
      recvWindow,
      queryString,
      this.config.apiSecret
    );

    // Add headers
    if (!config.headers) {
      config.headers = {};
    }
    
    config.headers['X-BAPI-TIMESTAMP'] = timestamp;
    config.headers['X-BAPI-RECV-WINDOW'] = recvWindow;
    config.headers['X-BAPI-SIGN'] = signature;

    if (this.config.debugMode) {
      console.log('Request Headers:', config.headers);
      console.log('Query String:', queryString);
    }

    return config;
  }

  /**
   * Handle successful response
   */
  private handleResponse<T>(response: AxiosResponse<ApiResponse<T>>): ApiResponse<T> {
    const data = response.data;
    
    if (data.retCode !== 0) {
      throw this.createError(data.retMsg, data.retCode, data);
    }
    
    return data;
  }

  /**
   * Handle error response
   */
  private handleError(error: any): never {
    if (error.response?.data) {
      const errorData = error.response.data;
      throw this.createError(
        errorData.retMsg || error.message,
        errorData.retCode || error.response.status,
        errorData
      );
    }
    
    throw this.createError(error.message, 'NETWORK_ERROR', error);
  }

  /**
   * Create P2P error
   */
  private createError(message: string, code: string | number, details?: any): P2PError {
    const error = new Error(message) as P2PError;
    error.code = code.toString();
    error.retCode = typeof code === 'number' ? code : undefined;
    error.details = details;
    return error;
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, params?: any): Promise<ApiResponse<T>> {
    const response = await this.axios.get<ApiResponse<T>>(endpoint, { params });
    return response as any;
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    const response = await this.axios.post<ApiResponse<T>>(endpoint, data);
    return response as any;
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    const response = await this.axios.delete<ApiResponse<T>>(endpoint, { data });
    return response as any;
  }
}