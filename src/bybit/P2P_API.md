# Bybit P2P API Implementation

This implementation provides complete access to Bybit's P2P trading endpoints according to the official documentation.

## Features

- ✅ Complete P2P API coverage
- ✅ Automatic timestamp synchronization
- ✅ Type-safe interfaces
- ✅ Error handling
- ✅ Support for all P2P operations

## Available Endpoints

### User & Balance Management
- `getP2PBalances()` - Get all P2P balances
- `getP2PUserInfo()` - Get user information
- `getCounterpartyInfo()` - Get counterparty user details
- `getP2PPaymentMethods()` - Get user payment methods

### Order Management
- `getP2POrders()` - List P2P orders with filters
- `getP2POrderDetail()` - Get detailed order information
- `getPendingP2POrders()` - Get pending orders
- `markP2POrderAsPaid()` - Mark order as paid
- `releaseP2POrder()` - Release digital assets
- `cancelP2POrder()` - Cancel an order

### Chat System
- `sendP2PChatMessage()` - Send chat message
- `getP2PChatMessages()` - Get chat history
- `uploadChatFile()` - Upload file to chat (not implemented in basic client)

### Advertisement Management
- `searchP2PAds()` - Search online advertisements
- `createP2PAd()` - Create new advertisement
- `deleteP2PAd()` - Remove advertisement
- `updateP2PAd()` - Update advertisement status/details
- `getMyP2PAds()` - List user's advertisements
- `getP2PAdDetail()` - Get advertisement details

## Usage Example

```typescript
import { BybitClient } from "@/bybit/client";

async function p2pExample() {
  const client = new BybitClient();
  
  // Add account
  const accountId = await client.addAccount(
    "your-api-key",
    "your-api-secret",
    false, // mainnet
    "P2P Account"
  );

  // Get P2P balances
  const balances = await client.getP2PBalances(accountId);
  console.log("P2P Balances:", balances);

  // Search for USDT sell ads in RUB
  const ads = await client.searchP2PAds(accountId, {
    tokenId: "USDT",
    fiat: "RUB",
    side: "1", // sell
    page: 1,
    limit: 10
  });
  console.log("Found ads:", ads.count);

  // Create a sell advertisement
  const newAd = await client.createP2PAd(accountId, {
    tokenId: "USDT",
    fiat: "RUB",
    side: "1", // sell
    priceType: "1", // fixed price
    price: "95.50",
    quantity: "100",
    minAmount: "1000",
    maxAmount: "10000",
    payTimeLimit: 15,
    payments: ["payment-method-id"],
    remarks: "Fast and reliable trading"
  });
  console.log("Created ad:", newAd.itemId);
}
```

## Type Definitions

All P2P operations use strongly typed interfaces:

- `P2PBalance` - Balance information
- `P2PUserInfo` - User profile data
- `P2POrder` - Order information
- `P2PAdvertisement` - Advertisement data
- `ChatMessage` - Chat message structure
- And many more...

## Error Handling

All methods throw errors with descriptive messages:

```typescript
try {
  const orders = await client.getP2POrders(accountId);
} catch (error) {
  console.error("Failed to get orders:", error.message);
}
```

## Important Notes

1. **API Keys**: Ensure your API keys have P2P trading permissions
2. **Time Sync**: The client automatically handles server time synchronization
3. **Rate Limits**: Be aware of Bybit's rate limiting policies
4. **Order Status Codes**:
   - "10": Pending
   - "20": Payment Made
   - "30": Released
   - "40": Completed
   - "50": Cancelled
   - "60": Appeal

## Complete Example

See `examples/p2p-complete.ts` for a comprehensive example covering all P2P operations.