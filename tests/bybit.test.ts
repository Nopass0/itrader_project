import { describe, it, expect } from 'bun:test';
import { P2PClient } from '../src/bybit/p2pClient';
import { TimeSyncManager } from '../src/bybit/utils/timeSync';

// prevent network calls during tests
TimeSyncManager.syncServerTime = async () => {};

class MockHttpClient {
  logs: any[] = [];
  constructor(private responses: Record<string, any> = {}) {}
  async request(method: string, endpoint: string, params: any = {}) {
    this.logs.push({ method, endpoint, params });
    return this.responses[endpoint] || { retCode: 0, result: {} };
  }
}

class MockAccountManager {
  constructor(private httpClient: MockHttpClient) {}
  getHttpClient() { return this.httpClient; }
  getAccount() { return { isTestnet: false }; }
}

describe('P2PClient endpoints', () => {
  const http = new MockHttpClient();
  const am = new MockAccountManager(http) as any;
  const p2p = new P2PClient(am);

  it('balance endpoint', async () => {
    await p2p.getAllBalances('acc');
    const log = http.logs.pop();
    expect(log.endpoint).toBe('/v5/asset/transfer/query-account-coins-balance');
  });

  it('account info endpoint', async () => {
    await p2p.getUserInfo('acc');
    const log = http.logs.pop();
    expect(log.endpoint).toBe('/v5/p2p/user/personal/info');
  });

  it('ads endpoint', async () => {
    await p2p.searchAds('acc', { tokenId: 'USDT', currencyId: 'RUB', side: '1' });
    const log = http.logs.pop();
    expect(log.endpoint).toBe('/v5/p2p/item/online');
  });

  it('payment methods endpoint', async () => {
    await p2p.getUserPaymentMethods('acc');
    const log = http.logs.pop();
    expect(log.endpoint).toBe('/v5/p2p/user/payment/list');
  });

  it('order list endpoint', async () => {
    await p2p.getOrders('acc');
    const log = http.logs.pop();
    expect(log.endpoint).toBe('/v5/p2p/order/simplifyList');
  });

  it('create ad endpoint', async () => {
    await p2p.createAd('acc', { tokenId:'USDT', currencyId:'RUB', side:'1', priceType:'0', price:'1', minAmount:'10', maxAmount:'10', remark:'', tradingPreferenceSet:{}, paymentIds:['1'], quantity:'1', paymentPeriod:'15', itemType:'ORIGIN'});
    const log = http.logs.pop();
    expect(log.endpoint).toBe('/v5/p2p/item/create');
  });

  it('chat message endpoint', async () => {
    await p2p.sendChatMessage('acc', '123', 'hi', 'str', 'uuid');
    const log = http.logs.pop();
    expect(log.endpoint).toBe('/v5/p2p/order/message/send');
  });

  it('chat list endpoint', async () => {
    await p2p.getChatMessages('acc', '123');
    const log = http.logs.pop();
    expect(log.endpoint).toBe('/v5/p2p/order/message/listpage');
  });
});
