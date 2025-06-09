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
        'X-BAPI-SIGN-TYPE': 2,
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

    config.headers['X-BAPI-API-KEY'] = this.config.apiKey;
    config.headers['X-BAPI-SIGN-TYPE'] = 2;
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
      const statusCode = error.response.status;
      
      // Enhanced error messages for common P2P API errors
      let errorMessage = errorData.retMsg || error.message;
      
      if (statusCode === 404) {
        errorMessage = `Endpoint not found: ${error.config?.url}. This might indicate that P2P API permissions are not enabled for this API key or the endpoint has changed.`;
      } else if (statusCode === 403) {
        errorMessage = `Access forbidden: ${errorMessage}. Please ensure your API key has P2P permissions enabled and you are a verified P2P advertiser.`;
      } else if (statusCode === 401) {
        errorMessage = `Authentication failed: ${errorMessage}. Please check your API key and secret.`;
      }
      
      throw this.createError(
        errorMessage,
        errorData.retCode || statusCode,
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