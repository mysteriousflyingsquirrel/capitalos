# MEXC Exchange Integration Specification

## Scope
This specification defines the **current** MEXC USDT-M futures integration:

- Required credentials and storage paths
- REST endpoints used (equity, positions, open orders, performance)
- WebSocket streaming scope (positions only)
- Normalization into UI models
- Performance window definitions and caveats
- Edge cases: contract sizing, vol scaling, missing fields
- Error handling and missing key behavior

## Definitions (data model / terms)

### Credentials
MEXC integration requires two secrets:

- `mexcApiKey`
- `mexcSecretKey`

Stored at:

- Firestore: `users/{uid}/settings/user` → `apiKeys.mexcApiKey` and `apiKeys.mexcSecretKey`
  - Source: `src/lib/dataSafety/userSettingsRepo.ts`

### PerpetualsData model
Same normalized model as Hyperliquid:

- `exchangeBalance[]` (equity)
- `openPositions[]`
- `openOrders[]`
- `portfolioPnL` (pnl24hUsd/pnl7dUsd/pnl30dUsd/pnl90dUsd)

Sources:

- `src/pages/NetWorth.tsx` types
- `src/pages/Mexc.tsx` UI rendering

## Data Sources & Ownership (SSOT)

### REST (serverless API)
Primary source of truth for:

- Equity (account equity)
- Open positions snapshot
- Open orders snapshot
- Performance windows

Endpoints:

- `POST /api/perpetuals/mexc/equity` → `api/perpetuals/mexc/equity.ts`
- `POST /api/perpetuals/mexc/positions` → `api/perpetuals/mexc/positions.ts`
- `POST /api/perpetuals/mexc/openOrders` → `api/perpetuals/mexc/openOrders.ts`
- `POST /api/perpetuals/mexc/performance` → `api/perpetuals/mexc/performance.ts`

All endpoints:

- Require `uid` in request body
- Load MEXC keys from Firestore settings
- Return `{ success: true, data: ... }` on success
- Return HTTP 400 with `{ success:false, error: 'MEXC API keys not configured' }` when keys missing

### WebSocket (browser-only, positions only)
Client:

- `src/services/mexcFuturesPositionsWs.ts` → `MexcFuturesPositionsWs`

WS endpoint:

- `wss://contract.mexc.com/edge`

Login signature (browser WS):

- `signature = HMAC-SHA256(secretKey, apiKey + reqTime)` as hex

After login:

- Sends `personal.filter` with `filters: [{ filter: 'position' }]`
- Pings every 15 seconds using `{ method: 'ping' }`

Scope:

- Streams **positions only** via `push.personal.position`

## User Flows (step-by-step)

### A) Viewing MEXC page
Source: `src/pages/Mexc.tsx`.

1. The page reads PerpetualsData for platform `MEXC` from `DataContext` (REST snapshot).
2. The page displays Performance frame from `portfolioPnL`.
3. The positions table uses:
   - WS positions if available; otherwise REST positions.
4. The open orders table uses REST open orders only.

## Behavioral Rules (MUST / MUST NOT)

### Equity definition
Equity is a best-effort parse of `/api/v1/private/account/assets` and is returned as `equityUsd`.

Parsing behavior:

- Prefers summary-style fields: `equity`, `accountEquity`, `totalEquity`, `totalBalance`, `balance`.
- Otherwise, if `data` is an array, chooses the USDT entry (or first entry) and uses:
  - `equity`, `totalBalance`, `balance`, or walletBalance+unrealized fallback.

Source: `api/perpetuals/mexc/equity.ts`.

### Performance window mapping (UI labels)
Server performance endpoint:

- Fetches:
  - `today_pnl` (GET)
  - `analysis/v3` (POST)
  - `recent/v3` (POST)
- Maps results into:
  - `pnl24hUsd`: from `todayPnl` (note: “24-Hour” label in UI maps to “today”)
  - `pnl7dUsd`: from `recentPnl`
  - `pnl30dUsd`: from `recentPnl30`
  - `pnl90dUsd`: from `recentPnl90`

Source: `api/perpetuals/mexc/performance.ts`.

### Positions normalization
REST positions endpoint maps open positions to:

- `ticker`: symbol/contract code (string; `'UNKNOWN'` fallback)
- `positionSide`: derived best-effort from `positionType` (1=LONG, 2=SHORT)
- `amountToken`: absolute `holdVol` (contracts/vol; treated as amount in UI)
- `entryPrice`: from `holdAvgPrice` variants
- `liquidationPrice`
- `margin`: from `im`/`margin`
- `pnl`: from `pnl` variants
- `leverage`: parsed if available
- `fundingFeeUsd`: currently always null

Source: `api/perpetuals/mexc/positions.ts`.

### Open orders normalization and contract sizing
Open orders endpoint:

- Fetches contractSize for each symbol using:
  - Public endpoint `https://contract.mexc.com/api/v1/contract/detail?symbol=<SYMBOL>`
- Normalizes order volume:
  - If vol looks like fixed-point integer scaled by 10,000, it divides by 10,000.
- Computes base amount:
  - `baseAmount = volContracts * contractSize` (if contractSize known)
- Computes notional size:
  - `size = price * baseAmount` if finite and >0
  - otherwise falls back to order’s own notional fields

Source: `api/perpetuals/mexc/openOrders.ts`.

### Positions table “Price” column on MEXC page
**Current behavior**:

- The MEXC positions table renders “Price” as a literal `-` (no mark/last price is displayed).
  - Source: `src/pages/Mexc.tsx`

**Current behavior unclear**:

- There is no documented intended meaning for the “Price” column on MEXC page.

**PROPOSAL**:

- Either remove the column or define it as mark price (if an API/WS source is added).

## Validation Rules
- REST endpoints require `uid` (400 if missing).
- Secret parsing is best-effort; numeric strings are parsed via `parseFloat`.

## Loading States
- No dedicated loading overlay.
- Empty positions table shows “No positions”.
- Empty open orders table shows “No open orders”.
- WS status is shown in the Positions frame titleRight as `WS: <status>`.

## Error Handling & Fallbacks

### Missing credentials
- REST endpoints return HTTP 400 success:false with “MEXC API keys not configured”.
- Client helpers return empty arrays / nulls.

### WS errors
- WS status can become `error` with message `WebSocket error` or login failure text.
- There is no explicit auto-reconnect loop in `MexcFuturesPositionsWs`.

## Edge Cases

### Leverage missing
- UI defaults leverage display to `1x` when leverage is null/undefined.
  - Source: `src/pages/Mexc.tsx`

### Entry price missing
- UI displays `-` when entry price is null/<=0.

### Contract size unavailable
- Open orders amount falls back to treating `volContracts` as base amount when contractSize is unknown.

### Volume scaling ambiguity
- `normalizeMexcVol` attempts to avoid 10,000× scaling errors but can only be heuristic.

## Persistence (Firestore paths, local cache)
- Keys stored under settings doc:
  - `users/{uid}/settings/user` → `apiKeys.mexcApiKey`, `apiKeys.mexcSecretKey`
- Perpetuals MEXC data is computed/fetched dynamically and attached to an in-memory `Perpetuals` net worth item.

## Acceptance Criteria (testable)

1. **Missing keys**:
   - If keys are not configured, the MEXC page MUST not crash and MUST show empty tables (or N/A performance).
2. **Performance mapping**:
   - Performance boxes MUST display server-returned values (24h/7d/30d/90d) or “N/A” when null.
3. **Open orders size**:
   - Open order `size` MUST prefer computed `price * (contracts*contractSize)` when contract size is available.
4. **WS positions override**:
   - When WS emits positions, the positions table MUST reflect WS data over REST snapshot.

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Define and implement a deterministic “Price” column for MEXC positions (mark price or last price) and document it here.

