# Bybit P2P Trading Setup Guide

## Overview

This guide helps you set up and use P2P trading functionality with the Bybit API. The implementation is complete and working - you just need to configure your account properly.

## Prerequisites

1. **Bybit Account**
   - Active Bybit account
   - Completed KYC verification (required for P2P)
   - USDT balance in FUND account

2. **API Keys**
   - API key with P2P permissions
   - Proper IP whitelist configuration

3. **Payment Methods**
   - At least one payment method added in Bybit P2P settings

## Quick Start

### 1. Run Complete P2P Setup

```bash
bun run src/bybit/examples/create-p2p-ad-complete.ts
```

This will:
- Check your account balance
- Verify P2P access
- Create a P2P advertisement
- Handle common errors with solutions

### 2. Setup Payment Methods

```bash
bun run src/bybit/examples/p2p-payment-setup.ts
```

This will:
- Check existing payment methods
- Guide you through adding new methods
- Verify KYC status

### 3. Run P2P Automation

```bash
bun run src/bybit/examples/p2p-ad-automation.ts
```

This will:
- Analyze market prices
- Create optimally priced ads
- Monitor and adjust existing ads

## Common Issues and Solutions

### Issue 1: API Error 912120022 (Price out of range)

**Problem**: Your price is outside the allowed market range

**Solution**: 
- Use prices between 71.28 - 91.09 RUB for USDT/RUB
- Run market analysis first to get optimal pricing
- Use the automation script for dynamic pricing

### Issue 2: API Error 912010001 (Invalid payment method)

**Problem**: No payment methods configured

**Solution**:
1. Open Bybit app/website
2. Go to P2P → Profile → Payment Methods
3. Add your payment methods:
   - Bank accounts
   - E-wallets (YooMoney, QIWI)
   - Payment cards

### Issue 3: 404 Errors on P2P Endpoints

**Problem**: P2P API not enabled for your account

**Solution**:
1. Complete KYC verification
2. Contact Bybit support to enable P2P API
3. Ensure your API key has P2P permissions

### Issue 4: Insufficient Balance

**Problem**: No USDT in FUND account

**Solution**:
1. Transfer USDT to FUND account (not SPOT)
2. Minimum 10 USDT recommended
3. Use internal transfer from SPOT to FUND

## Code Examples

### Basic P2P Ad Creation

```typescript
import { BybitClient } from "@/bybit/client";

const client = new BybitClient();
const accountId = await client.addAccount(apiKey, apiSecret, false);

// Create a sell ad
const result = await client.createP2PAd(accountId, {
  tokenId: "USDT",
  currencyId: "RUB",
  side: "1", // 1 = sell, 0 = buy
  priceType: "0", // 0 = fixed rate
  price: "85.00",
  quantity: "100",
  minAmount: "850",
  maxAmount: "8500",
  paymentPeriod: "15",
  paymentIds: ["payment-method-id"],
  remark: "Fast P2P trading",
  tradingPreferenceSet: {
    isFilterBlockedUser: true,
    completeRatePercent: 80,
  },
  itemType: "ORIGIN",
});

console.log("Ad created:", result.itemId);
```

### Check P2P Balance

```typescript
const balances = await client.getP2PBalances(accountId);
const usdtBalance = balances.find(b => b.coin === "USDT");
console.log("USDT available:", usdtBalance?.free);
```

### Monitor Orders

```typescript
const pendingOrders = await client.getP2PPendingOrders(accountId);
for (const order of pendingOrders) {
  console.log(`Order ${order.orderId}: ${order.quantity} ${order.tokenId}`);
  
  // Mark as paid when buyer confirms
  await client.markP2POrderAsPaid(accountId, order.orderId);
  
  // Release crypto after verifying payment
  await client.releaseP2POrder(accountId, order.orderId);
}
```

## Best Practices

1. **Security**
   - Never share API secrets
   - Use IP whitelist for API keys
   - Verify payments before releasing crypto

2. **Trading**
   - Start with small amounts
   - Build reputation gradually
   - Respond to orders quickly
   - Keep good communication

3. **Pricing**
   - Monitor market prices regularly
   - Use competitive pricing
   - Adjust prices based on demand
   - Consider using automation

4. **Payment Methods**
   - Add multiple payment options
   - Verify all payment details
   - Keep payment proofs
   - Use trusted payment systems

## API Implementation Status

✅ **Fully Implemented**:
- Account balance checking
- User information retrieval
- Advertisement creation
- Advertisement management
- Order processing
- Payment methods
- Chat functionality
- Market search

❌ **Known Limitations**:
- Requires manual payment method setup
- Price ranges enforced by Bybit
- KYC verification required
- Regional restrictions may apply

## Next Steps

1. Complete KYC verification
2. Add payment methods
3. Transfer USDT to FUND account
4. Run the examples to create your first ad
5. Monitor and fulfill orders
6. Build your P2P trading reputation

## Support

If you encounter issues:
1. Check error codes in this guide
2. Verify account setup
3. Contact Bybit support for P2P API access
4. Review the example scripts for implementation details