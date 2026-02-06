# Market Pricing - Daily Snapshot Design

## Overview

Market prices for stocks, ETFs, and commodities are fetched once per day by a GitHub Actions workflow and stored in Firestore. Client devices read from this daily snapshot cache, never calling Yahoo Finance directly.

This architecture:
- **Minimizes Yahoo API usage** to at most one batch per symbol per day
- **Provides consistent prices** across all devices
- **Keeps API keys server-side** (never exposed to client)
- **Reduces latency** - clients just read from Firestore

## Architecture

```
┌─────────────────────────┐      Daily @ 9:30 PM UTC (Mon-Fri)
│  GitHub Actions         │ ────────────────────────────────┐
│  (scheduled workflow)   │                                 │
└─────────────────────────┘                                 ▼
                                                    ┌──────────────┐
                                                    │  Yahoo API   │
                                                    │  (RapidAPI)  │
                                                    └──────────────┘
                                                           │
                                                           ▼
┌─────────────────────────┐                        ┌──────────────┐
│  Firestore              │◄───────────────────────│  GitHub      │
│  marketDailyPrices/     │   write daily snapshot │  Action      │
│  marketSymbolsRegistry/ │                        └──────────────┘
└─────────────────────────┘
          ▲
          │ read only
          │
┌─────────────────────────┐
│  Client Devices         │
│  (read from Firestore)  │
└─────────────────────────┘
```

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
        └── symbols/                    # Subcollection
              └── {SYMBOL_KEY}/         # Normalized symbol (e.g., "AAPL", "VWCE.DE")
                    ├── symbolKey: string
                    ├── symbolRaw: string
                    ├── price: number
                    ├── currency: string | null
                    ├── marketTime: number | null  # Unix ms
                    ├── source: "yahoo"
                    └── fetchedAt: serverTimestamp
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

The registry tracks which symbols need to be fetched. When a user adds a new stock/ETF/commodity item, the symbol is registered here.

## GitHub Actions Workflow

**File:** `.github/workflows/update-market-prices.yml`

**Schedule:** Daily at 9:30 PM UTC (after US market close), Monday-Friday

**Manual trigger:** Can be triggered manually from GitHub Actions UI

### Environment Variables Required

| Secret | Description |
|--------|-------------|
| `RAPIDAPI_KEY` | Yahoo Finance RapidAPI key |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service account JSON (can be base64 encoded) |

### What It Does

1. Reads all symbols from `marketSymbolsRegistry`
2. Fetches prices from Yahoo in batches of 25
3. Writes results to `marketDailyPrices/{today}/symbols/`
4. Retries on rate limit (429) with exponential backoff

## Fallback Strategy

If today's prices are missing for a symbol:

1. **Try today's snapshot** (`marketDailyPrices/{today}`)
2. **Fall back to previous days** (up to 7 days back)
3. **Show "—"** if no cached price available

Stale prices (from previous days) are marked with `isStale: true` so UI can indicate this.

## Client Usage

### Reading Prices

```typescript
import { getDailyPrices, getDailyPricesMap } from '@/services/market-data/DailyPriceService'

// Get detailed price data
const prices = await getDailyPrices(['AAPL', 'MSFT', 'VWCE.DE'])
// Returns: { 'AAPL': { price: 175.50, currency: 'USD', isStale: false, asOfDate: '2024-01-15' }, ... }

// Get simple price map
const priceMap = await getDailyPricesMap(['AAPL', 'MSFT'])
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

This ensures the symbol is fetched by the next day's workflow.

## Configuration

### Adjusting Chunk Size

In `scripts/update-daily-prices.ts`:

```typescript
const CHUNK_SIZE = 25 // Yahoo API can handle ~25 symbols per request
```

### Adjusting Retry Delays

```typescript
const MAX_RETRIES = 3
const RETRY_DELAYS = [60_000, 120_000, 240_000] // 1min, 2min, 4min
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
2. **Open app on Device A** → prices should load from Firestore (may show "—" if no data)
3. **Manually trigger GitHub Action** → observe prices being written
4. **Reload Device A** → prices should appear instantly from Firestore
5. **Open app on Device B** → prices should appear instantly (zero Yahoo calls)
6. **Add new stock item** → symbol should be registered in `marketSymbolsRegistry`

## Supported Categories

Only these categories use Yahoo Finance prices:
- `Index Funds` (ETFs)
- `Stocks`
- `Commodities`

Crypto, Perpetuals, and other categories use different data sources.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Yahoo API rate limited (429) | Retry with exponential backoff in GitHub Action |
| Network error | Log error, continue with other symbols |
| Symbol not in cache | Show "—" in UI |
| Stale price (>0 days old) | Show price with `isStale: true` indicator |

## Related Files

- `src/services/market-data/DailyPriceService.ts` - Main SSOT service
- `scripts/update-daily-prices.ts` - GitHub Action script
- `.github/workflows/update-market-prices.yml` - Workflow definition
- `firestore.rules` - Security rules for market data collections
