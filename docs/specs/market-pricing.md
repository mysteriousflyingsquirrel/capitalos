# Market Pricing - Twelve Data Integration

## Overview

Market prices for stocks, ETFs, and commodities are fetched on-demand from Twelve Data via a Vercel API proxy. Prices are fetched every time the app opens or the user refreshes — no Firestore caching.

This architecture:
- **Keeps API keys server-side** (user's Twelve Data key is read from Firestore by the API route)
- **Always returns fresh prices** — no stale cache concerns
- **Minimal complexity** — no locks, no session cache, no fallback logic

## Architecture

```
┌─────────────────────────┐
│  Client Device          │
│  (getDailyPricesMap)    │
└───────────┬─────────────┘
            │ POST /api/market/update-daily-prices
            │ (Bearer token + symbols)
            ▼
┌─────────────────────────┐
│  Vercel API Route       │
│  (Serverless Function)  │
└───────────┬─────────────┘
            │ 1. verifyAuth → uid
            │ 2. Read Twelve Data API key from Firestore
            │ 3. Map symbols to Twelve Data format
            │ 4. Fetch prices from Twelve Data
            ▼
┌──────────────┐          ┌──────────────┐
│  Firestore   │          │  Twelve Data │
│  (API key)   │          │  /quote API  │
└──────────────┘          └──────────────┘
```

## Flow

1. **Client requests prices** via `getDailyPricesMap(symbols)`
2. **DailyPriceService** calls Vercel API route `/api/market/update-daily-prices`
3. **API route** authenticates via Bearer token, derives `uid`
4. **API route** reads user's `twelveDataApiKey` from `users/{uid}/settings/user`
5. **API route** maps symbols to Twelve Data format (exchange suffixes, commodity mappings)
6. **API route** calls Twelve Data `/quote` endpoint (batched, up to 50 per request)
7. **API route** returns normalized price map to client
8. **Client** uses prices for display and calculations

## Symbol Format Mapping

The API route translates between user-entered symbols (Yahoo-style) and Twelve Data's format:

### Exchange Suffixes

| Yahoo Suffix | Twelve Data Exchange | Example |
|---|---|---|
| `.DE` | `:XETR` | `VWCE.DE` → `VWCE:XETR` |
| `.SW` | `:SIX` | `ZSIL.SW` → `ZSIL:SIX` |
| `.L` | `:LSE` | `VUSA.L` → `VUSA:LSE` |
| `.PA` | `:EPA` | `CAC.PA` → `CAC:EPA` |
| `.AS` | `:AMS` | `INGA.AS` → `INGA:AMS` |
| `.MI` | `:MIL` | `ENI.MI` → `ENI:MIL` |
| `.TO` | `:TSX` | `BMO.TO` → `BMO:TSX` |
| `.HK` | `:HKEX` | `0005.HK` → `0005:HKEX` |
| `.T` | `:TSE` | `7203.T` → `7203:TSE` |
| `.AX` | `:ASX` | `CBA.AX` → `CBA:ASX` |

### Commodity Mappings

| Yahoo Ticker | Twelve Data Symbol |
|---|---|
| `GC=F` | `XAU/USD` |
| `SI=F` | `XAG/USD` |
| `CL=F` | `WTI/USD` |
| `BZ=F` | `BRENT/USD` |
| `NG=F` | `NG/USD` |
| `PL=F` | `XPT/USD` |
| `PA=F` | `XPD/USD` |
| `HG=F` | `COPPER/USD` |

US stocks and ETFs (e.g., `AAPL`, `MSFT`, `VOO`) are passed through unchanged.

## API Route

**File:** `api/market/update-daily-prices.ts`

**Endpoint:** `POST /api/market/update-daily-prices`

**Authentication:** Bearer token (Firebase ID token) — uid derived via `verifyAuth()`

**Request Body:**
```json
{
  "symbols": ["AAPL", "MSFT", "VWCE.DE"]
}
```

**Response:**
```json
{
  "success": true,
  "prices": {
    "AAPL": { "price": 175.50, "currency": "USD", "marketTime": 1705330800000 },
    "MSFT": { "price": 390.25, "currency": "USD", "marketTime": 1705330800000 }
  },
  "fetched": ["AAPL", "MSFT"],
  "missing": ["INVALID"],
  "source": "twelve-data"
}
```

## User Settings

```
users/{uid}/settings/user
  └── apiKeys/
        └── twelveDataApiKey: string
```

The user's Twelve Data API key is stored here and read server-side by the API route.

## Client Usage

```typescript
import { getDailyPrices, getDailyPricesMap } from '@/services/market-data/DailyPriceService'

// Get detailed price data
const prices = await getDailyPrices(['AAPL', 'MSFT', 'VWCE.DE'])
// Returns: { 'AAPL': { price: 175.50, currency: 'USD', isStale: false, asOfDate: '2024-01-15' }, ... }

// Get simple price map
const priceMap = await getDailyPricesMap(['AAPL', 'MSFT'])
// Returns: { 'AAPL': 175.50, 'MSFT': 390.25 }
```

## Twelve Data API Details

- **Endpoint:** `GET https://api.twelvedata.com/quote?symbol=AAPL,MSFT&apikey=KEY`
- **Batch:** Comma-separated symbols (up to 120 per request; chunked at 50 for safety)
- **Response fields:** `symbol`, `close` (latest price), `currency`, `datetime`, `timestamp`
- **Free tier:** 800 credits/day, 8 credits/minute (1 credit per symbol in batch)

## Supported Categories

Only these categories use Twelve Data prices:
- `Index Funds` (ETFs)
- `Stocks`
- `Commodities`

Crypto, Perpetuals, and other categories use different data sources.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No API key configured | Return empty prices with warning |
| Twelve Data rate limited | Partial results returned |
| Network error | Log error, return empty |
| Symbol not recognized | Returned in `missing` array, UI shows "—" |
| Auth token invalid | 401 Unauthorized |

## Security

1. **API keys stay server-side:** User's Twelve Data key is read from Firestore, never exposed to the client
2. **Authentication:** Bearer token required on every request; uid derived from token
3. **Firebase Admin SDK:** API route uses Admin SDK for Firestore reads

## Related Files

- `src/services/market-data/DailyPriceService.ts` - Main client-side service
- `api/market/update-daily-prices.ts` - Vercel API route (server-side proxy)
- `src/contexts/ApiKeysContext.tsx` - Manages Twelve Data API key in client state
- `src/lib/dataSafety/userSettingsRepo.ts` - Persists API key to Firestore
