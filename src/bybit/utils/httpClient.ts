import axios from "axios";
import crypto from "crypto";
import { TimeSyncManager } from "./timeSync";

export class BybitHttpClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string, isTestnet: boolean = false) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = isTestnet
      ? "https://api-testnet.bybit.com"
      : "https://api.bybit.com";
  }

  private generateSignature(
    timestamp: string,
    apiKey: string,
    recvWindow: string,
    payload: string,
  ): string {
    const message = timestamp + apiKey + recvWindow + payload;
    return crypto.createHmac("sha256", this.apiSecret).update(message).digest("hex");
  }

  private async getServerTime(): Promise<number> {
    try {
      const response = await axios.get(`${this.baseUrl}/v3/public/time`, { timeout: 3000 });
      return parseInt(response.data.result.timeSecond) * 1000;
    } catch (error) {
      // Fallback to adjusted timestamp
      return TimeSyncManager.getAdjustedTimestamp();
    }
  }

  async request(method: string, endpoint: string, params: any = {}): Promise<any> {
    // Get server time first for better accuracy
    const serverTime = await this.getServerTime();
    const timestamp = serverTime.toString();
    const recvWindow = "20000";
    
    let payload = "";
    let url = `${this.baseUrl}${endpoint}`;
    
    if (method === "GET") {
      // For GET requests, build query string for signature
      const queryParams: string[] = [];
      Object.keys(params)
        .sort()
        .forEach(key => {
          if (params[key] !== undefined && params[key] !== null) {
            queryParams.push(`${key}=${params[key]}`);
          }
        });
      
      if (queryParams.length > 0) {
        payload = queryParams.join("&");
        url += `?${payload}`;
      }
    } else {
      // For POST requests, sort parameters alphabetically
      const sortedParams = Object.keys(params)
        .sort()
        .reduce((acc: any, key) => {
          acc[key] = params[key];
          return acc;
        }, {});
      payload = JSON.stringify(sortedParams);
    }
    
    const signature = this.generateSignature(timestamp, this.apiKey, recvWindow, payload);

    const headers: any = {
      "X-BAPI-API-KEY": this.apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-SIGN-TYPE": "2",
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
    };
    
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
    }

    try {
      const response = await axios({
        method,
        url,
        headers,
        data: method !== "GET" ? payload : undefined,
        timeout: 10000, // 10 second timeout
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        const errorMsg = error.response.data.retMsg || error.response.data.ret_msg || error.response.data.message;
        console.error(`API Error [${method} ${endpoint}]:`, error.response.status, errorMsg || error.response.data);
        throw new Error(errorMsg || `API request failed: ${error.response.status} ${error.response.statusText}`);
      }
      console.error(`Request Error [${method} ${endpoint}]:`, error.message);
      throw error;
    }
  }
}