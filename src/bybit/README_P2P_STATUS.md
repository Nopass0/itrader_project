# Bybit P2P API Implementation Status

## Working Endpoints ✅

1. **P2P Balance** - `/v5/asset/transfer/query-account-coins-balance`
   - Status: Working
   - Method: GET
   - Params: `accountType=FUND`

2. **User Info** - `/v5/p2p/user/personal/info`
   - Status: Working (returns user data)
   - Method: POST
   - Response includes: nickName, online status, KYC status, etc.

## Endpoints Requiring Investigation 🔍

### 404 Errors
These endpoints are returning 404 errors and may have been deprecated or moved:

1. **Payment Methods** - `/v5/p2p/user/query-user-payment`
   - Status: 404 Not Found
   - Possible alternatives to investigate

2. **My Ads** - `/v5/p2p/ad/ad-list`
   - Status: 404 Not Found
   
3. **Pending Orders** - `/v5/p2p/order/pending-order`
   - Status: 404 Not Found

### Parameter Errors
1. **Search Ads** - `/v5/p2p/item/online`
   - Status: API Error 10001 (Request parameter error)
   - Likely needs specific required parameters

## Key Findings

1. The API uses `ret_code`/`ret_msg` format for P2P endpoints (not `retCode`/`retMsg`)
2. Timestamp synchronization is working correctly (24 second offset detected and handled)
3. Authentication is working (user info endpoint returns valid data)
4. Some endpoints from the original documentation appear to be outdated

## Next Steps

1. Contact Bybit support for updated P2P API documentation
2. Test with different parameter combinations for the search ads endpoint
3. Look for alternative endpoints for payment methods and order management
4. Check if P2P functionality requires special API permissions or account setup

## Example Response (User Info)

```json
{
  "nickName": "EXCHHANGE7",
  "defaultNickName": false,
  "whiteFlag": 1,
  "contactConfig": true,
  "isOnline": true,
  ...
}
```