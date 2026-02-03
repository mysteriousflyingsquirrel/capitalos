# Market Data Specification

## Scope
This specification defines **current** market data behavior:

- FX rate sources and caching
- Crypto price sources and USD→CHF rate source
- Stock/ETF/commodity price source
- Refresh intervals (where implemented)
- TTL, inflight request deduplication (where implemented)
- Error handling and UI fallbacks
- Rate limiting strategy
- Snapshot consistency rules (as implemented / not implemented)

This spec is status-quo-only and documents **multiple** market-data paths that currently exist in the repo.

## Definitions (data model / terms)

### “Prices map”
In several places, the app uses “prices maps”:

- `cryptoPrices: Record<string, number>` mapping ticker → USD price
- `stockPrices: Record<string, number>` mapping ticker → USD price (from Yahoo Finance)

### “USD→CHF rate”
The app frequently uses `usdToChfRate: number | null` sourced from CryptoCompare.

### Market Data Cache
There is an in-memory cache with TTL + inflight deduplication:

- `src/services/market-data/MarketDataCache.ts` → `marketDataCache`

This cache is used only by the newer `src/services/market-data/*` SSOT services.

## Data Sources & Ownership (SSOT)

### FX rates (client conversion layer)
Current FX rates used by the UI conversion layer are fetched and cached by:

- `src/services/exchangeRateService.ts` → `getExchangeRates(base)`

Upstream:

- `https://api.exchangerate-api.com/v4/latest/{base}`

Caching:

- Cached in localStorage under key `capitalos_exchange_rates_v1`
- TTL: 24 hours

Fallbacks:

- If fetch fails, it uses cached data (even if stale) if base matches
- If no cache exists, returns hardcoded `{CHF:1, EUR:1, USD:1}`

### Crypto prices + USD→CHF (current primary path)
CryptoCompare shared library:

- `lib/cryptoCompare.ts`

Endpoints:

- Prices: `https://min-api.cryptocompare.com/data/pricemulti?fsyms=...&tsyms=USD`
- USD→CHF: `https://min-api.cryptocompare.com/data/price?fsym=USD&tsyms=CHF`

Consumers:

- Client: `src/services/cryptoCompareService.ts` re-exports the lib functions.
- Dashboard and DataContext call `fetchCryptoData(...)` (prices + usdToChfRate).

Caching:

- This CryptoCompare path does **not** implement local caching in `lib/cryptoCompare.ts`.
- Refresh behavior is determined by callers (see Refresh section).

### Stock/ETF/commodity prices (Yahoo Finance via RapidAPI)
Client service:

- `src/services/yahooFinanceService.ts` → `fetchStockPrices(tickers, apiKey)`

Upstream:

- `https://apidojo-yahoo-finance-v1.p.rapidapi.com/market/v2/get-quotes?region=US&symbols=...`

Headers:

- `x-rapidapi-key` (from Settings or env)
- `x-rapidapi-host: apidojo-yahoo-finance-v1.p.rapidapi.com`

Rate limiting:

- Enforced in `yahooFinanceService.ts`:
  - MIN_REQUEST_INTERVAL = 1000ms (1 second)

Caching:

- No caching is implemented in this legacy service; callers refresh periodically.

### New “SSOT” market-data services (present but not wired into main app)
There is a newer market-data subsystem:

- FX: `src/services/market-data/FxRateService.ts` (fawazahmed0 currency-api via jsdelivr/pages.dev)
- Crypto: `src/services/market-data/CryptoPriceService.ts` (CryptoCompare, cached)
- Market: `src/services/market-data/MarketPriceService.ts` (Yahoo RapidAPI, cached)

These use:

- `src/services/market-data/MarketDataCache.ts` for TTL + inflight dedup

**Current behavior unclear**

- These SSOT services are not clearly wired into the primary page flows. Some valuation provider hooks reference them, but `MarketDataProvider` and `ValuationProvider` are not mounted in `src/App.jsx`.

Involved code:

- `src/providers/MarketDataProvider.tsx`
- `src/providers/ValuationProvider.tsx`
- `src/App.jsx` (does not include these providers)

## User Flows (step-by-step)

### A) Initial app load
Prices and FX are loaded as part of:

- `CurrencyContext` (FX rates via exchangerate-api.com)
- `DataContext` (crypto + stock prices)
- Some pages (Dashboard) also fetch prices on their own interval.

### B) Periodic refresh
There are two refresh mechanisms in current code:

1) **DataContext** refresh:
   - `src/contexts/DataContext.tsx` sets up a 5-minute refresh for crypto and stock prices (status quo as seen in repo).
2) **Dashboard** refresh:
   - `src/pages/Dashboard.tsx` independently fetches crypto and stock prices and repeats every 5 minutes when there are net worth items.

This duplication means:

- Market data can be refreshed from multiple places.
- “Last refresh time” is not globally coordinated.

## Behavioral Rules (MUST / MUST NOT)

### Refresh interval
- Pages that implement refresh (DataContext and Dashboard) MUST refresh prices every **300,000 ms** (5 minutes) once active.

### Rate limiting (Yahoo RapidAPI)
- The Yahoo Finance fetcher MUST enforce a minimum 1-second delay between outgoing requests from `yahooFinanceService.ts`.

### Inflight request deduplication (new SSOT services only)
- When using `marketDataCache.getOrFetch(key, fetcher, ttl)`, concurrent calls for the same key MUST share a single inflight promise.

### TTL behavior (new SSOT services only)
Default TTL used by SSOT market-data services:

- 10 minutes (600,000 ms)

### Error handling defaults
- CryptoCompare failures MUST return empty price maps and/or null rates (callers are expected to handle).
- Yahoo Finance failures MUST return `{}` and log errors; MUST NOT throw to the UI caller.
- ExchangeRate failures MUST fall back to cached or hardcoded rates.

## Validation Rules
- Tickers are normalized via `.trim().toUpperCase()` in most places.
- Yahoo and Crypto services deduplicate tickers by Set semantics.

## Loading States
There is no global “market data loading” screen.

Per-feature loading states include:

- Net Worth modals show `(fetching...)` next to price-per-item during auto-fetch.
- Dashboard has an internal `isRefreshingPrices` state used for pull-to-refresh and background refresh, but does not display a global overlay by default.

## Error Handling & Fallbacks

### FX rates
- If exchange rate fetch fails:
  - Use cached localStorage value if base matches (even if older than 24h)
  - Else use hardcoded 1:1 fallback map

### Crypto prices
- If crypto price fetch fails, consumer code generally:
  - Uses empty price map `{}` and `usdToChfRate=null`
  - Net worth and dashboard computations fall back to transaction-based valuations.

### Yahoo prices
- If API key is missing:
  - Legacy service logs an error and returns `{}`
- If rate-limited (HTTP 429):
  - Legacy service returns `{}` and logs a helpful message

## Edge Cases

### Consistency across a single render (“price snapshots”)
**Current behavior unclear**

- There is no single global “valuation snapshot” guarantee across the entire app.
- Some modules (the unused `ValuationEngine`) build an explicit `quotesSnapshot` and `fxSnapshot`, but that is not the main path used by Dashboard and Net Worth today.

Involved code:

- `src/services/valuation/ValuationEngine.ts` (snapshots exist in output)
- `src/pages/Dashboard.tsx` (computes using component-local cryptoPrices/stockPrices)
- `src/contexts/DataContext.tsx` (computes using context state)

**PROPOSAL**

- Compute valuation using a single snapshot object per refresh and feed all pages the same snapshot to prevent inconsistent UI.

## Persistence (Firestore paths, local cache)
- FX rates: localStorage `capitalos_exchange_rates_v1`
- MarketDataCache: in-memory only (not persisted)
- API keys needed for Yahoo RapidAPI are stored in Firestore settings (see `docs/specs/settings.spec.md`)

## Acceptance Criteria (testable)

1. **FX cache TTL**:
   - When exchange rates were fetched within last 24h for same base, `getExchangeRates(base)` MUST return cached values without network call (can be asserted by network interception).
2. **Yahoo rate limit**:
   - Two back-to-back Yahoo Finance fetches MUST be delayed by at least 1 second.
3. **CryptoCompare failure fallback**:
   - If CryptoCompare requests fail, net worth calculations MUST still render finite totals (using transaction-derived valuations).

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Remove duplication by picking one market-data subsystem (legacy vs `src/services/market-data/*`) and wiring it consistently through the app.

