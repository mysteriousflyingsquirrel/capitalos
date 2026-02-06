# Market Pricing - Daily Snapshot Design

## Overview

Market prices for stocks, ETFs, and commodities are fetched on-demand via a Vercel API route and stored in Firestore. The first client request of the day triggers a fetch using the user's own RapidAPI key (stored in Firestore), and subsequent requests read from the shared Firestore cache.

This architecture:
- **Minimizes Yahoo API usage** to at most one batch per symbol per day
- **Provides consistent prices** across all devices
- **Keeps API keys server-side** (user's key is read from Firestore by API route, never exposed to client)
- **Reduces latency** - subsequent requests just read from Firestore
- **Zero configuration required** - uses existing Firebase Admin SDK on Vercel

## Architecture

```
┌─────────────────────────┐
│  Client Device          │
│  (getDailyPricesMap)    │
└───────────┬─────────────┘
            │ 1. Check session cache
            │ 2. Read from Firestore
            │ 3. If missing → call API
            ▼
┌─────────────────────────┐     POST /api/market/update-daily-prices
│  Vercel API Route       │◄────────────────────────────────────────
│  (Serverless Function)  │
└───────────┬─────────────┘
            │ 1. Read user's RapidAPI key from Firestore
            │ 2. Fetch missing prices from Yahoo
            │ 3. Write to shared Firestore cache
            ▼
┌─────────────────────────┐                        ┌──────────────┐
│  Firestore              │◄───────────────────────│  Yahoo API   │
│  marketDailyPrices/     │   fetch on-demand      │  (RapidAPI)  │
│  marketSymbolsRegistry/ │                        └──────────────┘
└─────────────────────────┘
```

## Flow

1. **Client requests prices** via `getDailyPricesMap(symbols, uid)`
2. **Check session cache** (in-memory) for already-fetched prices
3. **Read from Firestore** (`marketDailyPrices/{today}/symbols/`)
4. **If missing symbols exist and uid provided:**
   - Call Vercel API route `/api/market/update-daily-prices`
   - API reads user's `rapidApiKey` from `users/{uid}/settings/user`
   - API fetches missing prices from Yahoo (with lock to prevent duplicate fetches)
   - API writes to shared Firestore cache
   - API returns all prices (cached + newly fetched)
5. **Fallback:** If API fails or no key, try previous days (up to 7 days back)
6. **Return prices** to client (or undefined for missing symbols)

## Firestore Schema

### Daily Price Snapshot

```
marketDailyPrices/
  └── {YYYY-MM-DD}/                    # UTC date
        ├── dateKey: string
        ├── provider: "yahoo"
        ├── version: 1
        ├── createdAt: serverTimestamp
        ├── updatedAt: serverTimestamp
        ├── symbols/                    # Subcollection
        │     └── {SYMBOL_KEY}/         # Normalized symbol (e.g., "AAPL", "VWCE.DE")
        │           ├── symbolKey: string
        │           ├── symbolRaw: string
        │           ├── price: number
        │           ├── currency: string | null
        │           ├── marketTime: number | null  # Unix ms
        │           ├── source: "yahoo"
        │           └── fetchedAt: serverTimestamp
        └── locks/                      # Subcollection for fetch coordination
              └── yahoo/
                    ├── lockedUntil: timestamp
                    ├── lockedBy: string
                    └── createdAt: serverTimestamp
```

### Symbols Registry

```
marketSymbolsRegistry/
  └── {SYMBOL_KEY}/
        ├── symbolKey: string
        ├── symbolRaw: string
        ├── assetClass: "stock" | "etf" | "commodity" | "unknown"
        ├── addedBy: string (uid)
        └── addedAt: serverTimestamp
```

The registry tracks which symbols have been added by users.

### User Settings (existing)

```
users/{uid}/settings/user
  └── apiKeys/
        └── rapidApiKey: string
```

The user's RapidAPI key is stored here and read server-side by the API route.

## API Route

**File:** `api/market/update-daily-prices.ts`

**Endpoint:** `POST /api/market/update-daily-prices`

**Request Body:**
```json
{
  "uid": "user-firebase-uid",
  "symbols": ["AAPL", "MSFT", "VWCE.DE"]
}
```

**Response:**
```json
{
  "success": true,
  "dateKey": "2024-01-15",
  "prices": {
    "AAPL": { "price": 175.50, "currency": "USD", "marketTime": 1705330800000 },
    "MSFT": { "price": 390.25, "currency": "USD", "marketTime": 1705330800000 }
  },
  "fetched": ["AAPL"],
  "cached": ["MSFT"],
  "missing": ["INVALID"],
  "source": "yahoo+firestore"
}
```

### Lock Mechanism

To prevent multiple simultaneous requests from making redundant Yahoo API calls:

1. API attempts to acquire a lock (`marketDailyPrices/{date}/locks/yahoo`)
2. Lock is valid for 60 seconds
3. If lock is held, retry up to 3 times with exponential backoff
4. If lock cannot be acquired, re-read from Firestore (another request probably fetched)
5. Lock is released after fetch completes

## Fallback Strategy

If today's prices are missing for a symbol:

1. **Check session cache** (in-memory)
2. **Read today's snapshot** (`marketDailyPrices/{today}`)
3. **Call API** to fetch missing prices (if uid provided)
4. **Fall back to previous days** (up to 7 days back)
5. **Return undefined** if no cached price available (UI shows "—")

Stale prices (from previous days) are marked with `isStale: true` so UI can indicate this.

## Client Usage

### Reading Prices

```typescript
import { getDailyPrices, getDailyPricesMap } from '@/services/market-data/DailyPriceService'

// Get detailed price data (with uid to trigger fetch for missing)
const prices = await getDailyPrices(['AAPL', 'MSFT', 'VWCE.DE'], { uid: currentUser.uid })
// Returns: { 'AAPL': { price: 175.50, currency: 'USD', isStale: false, asOfDate: '2024-01-15' }, ... }

// Get simple price map
const priceMap = await getDailyPricesMap(['AAPL', 'MSFT'], uid)
// Returns: { 'AAPL': 175.50, 'MSFT': 390.25 }
```

### Registering New Symbols

When a user adds a new stock/ETF/commodity:

```typescript
import { registerSymbol, deriveAssetClass, categoryUsesYahoo } from '@/services/market-data/DailyPriceService'

if (categoryUsesYahoo(item.category)) {
  await registerSymbol(item.name, uid, deriveAssetClass(item.category))
}
```

This tracks which symbols have been added by users.

## Configuration

### Adjusting Chunk Size (API Route)

In `api/market/update-daily-prices.ts`:

```typescript
const CHUNK_SIZE = 25 // Yahoo API can handle ~25 symbols per request
```

### Adjusting Lock Duration

```typescript
const lockDuration = 60 * 1000 // 60 seconds
```

### Adjusting Fallback Days

In `src/services/market-data/DailyPriceService.ts`:

```typescript
const MAX_FALLBACK_DAYS = 7
```

## Force Refresh in Development

To clear the session cache and re-read from Firestore:

```typescript
import { clearSessionCache } from '@/services/market-data/DailyPriceService'
clearSessionCache()
```

To clear Firestore data for testing:
1. Go to Firebase Console
2. Delete `marketDailyPrices/{today}` document and subcollections
3. Reload the app

## Verification Checklist

1. **Clear today's snapshot** in Firestore
2. **Open app on Device A** → should trigger API fetch, prices appear
3. **Reload Device A** → prices should appear instantly from Firestore cache
4. **Open app on Device B** → prices should appear instantly (zero Yahoo calls)
5. **Add new stock item** → symbol should be fetched and cached
6. **Check console logs** → verify "API response" logs show expected behavior

## Supported Categories

Only these categories use Yahoo Finance prices:
- `Index Funds` (ETFs)
- `Stocks`
- `Commodities`

Crypto, Perpetuals, and other categories use different data sources.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Yahoo API rate limited (429) | Stop fetching remaining symbols, return partial results |
| Network error | Log error, return cached prices only |
| No RapidAPI key for user | Return cached prices with warning |
| Symbol not in cache | Return undefined, UI shows "—" |
| Stale price (>0 days old) | Show price with `isStale: true` indicator |
| Lock contention | Retry with backoff, then read from cache |

## Security

1. **API keys stay server-side:** User's RapidAPI key is read from Firestore by the API route, never sent to or exposed on the client
2. **Firebase Admin SDK:** API route uses Admin SDK (configured via `FIREBASE_SERVICE_ACCOUNT` env var on Vercel)
3. **Firestore rules:** Only authenticated users can read market prices; only Admin SDK can write

## Related Files

- `src/services/market-data/DailyPriceService.ts` - Main SSOT service (client-side)
- `api/market/update-daily-prices.ts` - Vercel API route (server-side)
- `firestore.rules` - Security rules for market data collections
