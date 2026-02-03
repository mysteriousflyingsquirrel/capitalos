# Hyperliquid Exchange Integration Specification

## Scope
This specification defines the **current** Hyperliquid integration behavior:

- Required credentials and where they are stored
- REST vs WebSocket responsibilities
- Data normalization into the UI models (`PerpetualsData`, positions, open orders, portfolio PnL)
- “Price” column definition in the Positions table
- Performance window calculations (24h/7d/30d/90d)
- Error handling, reconnect behavior, and missing-credential behavior

## Definitions (data model / terms)

### Credentials
Hyperliquid uses a wallet address (public identifier), not an API key.

- **`hyperliquidWalletAddress`**: string

Stored at:

- Firestore: `users/{uid}/settings/user` → `apiKeys.hyperliquidWalletAddress`
  - Source: `src/lib/dataSafety/userSettingsRepo.ts`

### PerpetualsData (normalized model)
Source: `src/pages/NetWorth.tsx` (`export interface PerpetualsData`).

- `exchangeBalance: ExchangeBalance[]`
- `openPositions: PerpetualsOpenPosition[]`
- `openOrders: PerpetualsOpenOrder[]`
- `portfolioPnL?: PortfolioPnL`

### Position “Price” in the UI (Hyperliquid page)
On `src/pages/Hyperliquid.tsx`, the Positions table displays `markPx` as the “Price” column.

- `markPx` is populated from the Hyperliquid **asset context** stream (not from REST positions).
  - Source: `src/pages/Hyperliquid.tsx` + `src/hooks/valuation/useHyperliquidAssetCtx`

If `markPx` is missing, the UI shows `—`.

## Data Sources & Ownership (SSOT)

### REST (serverless API)
Primary source for:

- Exchange balance / equity
- Open positions (snapshot)
- Open orders
- Portfolio PnL windows

Endpoint:

- `POST /api/perpetuals/hyperliquid`
  - Source: `api/perpetuals/hyperliquid.ts`

Request JSON:

- `{ "uid": string, "walletAddress": string }`

Response JSON (success):

- `{ "success": true, "data": PerpetualsData }`

### WebSocket (browser-only, positions only)
Browser WebSocket client:

- `src/services/hyperliquidPositionsWs.ts` → `HyperliquidPositionsWs`

WS endpoint:

- `wss://api.hyperliquid.xyz/ws`

Subscription:

- method: `subscribe`
- subscription: `{ type: "clearinghouseState", user: <walletAddress>, dex?: <string> }`

Scope:

- Positions only (open orders, equity, performance are NOT streamed by this WS client).

### Asset context (browser-only, mark prices)
Hyperliquid page also subscribes to asset context for mark prices:

- `src/hooks/valuation/useHyperliquidAssetCtx`

## User Flows (step-by-step)

### A) Viewing Hyperliquid page
Source: `src/pages/Hyperliquid.tsx`.

1. The page reads `PerpetualsData` for platform `Hyperliquid` from `DataContext` (REST snapshot fallback).
2. The page starts WS subscription for positions.
3. The page merges WS positions into display:
   - If WS provides positions, they replace REST positions in the table.
4. The page subscribes to asset context coins derived from the merged positions set to get mark prices.
5. The page displays:
   - Performance PnL boxes (from REST `portfolioPnL`)
   - Positions table (from merged WS/REST + mark prices)
   - Open orders table (REST only)

## Behavioral Rules (MUST / MUST NOT)

### Missing wallet address
- If wallet address is missing, REST fetch helper MUST return null:
  - Source: `src/services/hyperliquidService.ts` (`fetchHyperliquidPerpetualsData`)

### REST calculations
The serverless function MUST:

- Compute `portfolioPnL` windows as USD deltas.
- Provide an `exchangeBalance` that represents account equity in USD.

Performance windows logic (server):

- 24h, 7d, 30d:
  - Computed as last - first in the selected time bucket.
  - Uses `pnlHistory` if available; otherwise falls back to `accountValueHistory`.
  - Source: `api/perpetuals/hyperliquid.ts` → `deltaFromBucket(...)`
- 90d:
  - Uses all-time series (`allB`) and finds the closest point to “90 days ago” to compute delta vs latest.
  - If closest point equals latest timestamp, returns null.
  - Source: `api/perpetuals/hyperliquid.ts` → `pnl90dUsd`

### WS status reporting
Hyperliquid page displays a status string `WS: <status>` where status is:

- `disconnected` | `connecting` | `subscribed` | `error`

If `error`, the UI appends error text if available.

### Price column definition
On Hyperliquid page:

- “Price” MUST display **mark price** (`markPx`) from asset context.
- It MUST NOT display:
  - entry price
  - mid/oracle price
  - liquidation price

If `markPx` is not available, UI MUST display `—`.

## Validation Rules
- Incoming numeric fields from WS are parsed using `parseFloat` and must be finite to be used.
- Positions with `szi === 0` are ignored (not shown).

Source: `src/services/hyperliquidPositionsWs.ts`.

## Loading States
- There is no global loading overlay for exchange data.
- Empty tables render “No positions” / “No open orders”.

## Error Handling & Fallbacks

### REST failure
- If REST response is non-OK, helper returns null.
- `DataContext` may omit Perpetuals item or use empty data arrays.

Source: `src/services/hyperliquidService.ts`.

### WS failure
- WS errors set status to `error` with message “WebSocket error” or a thrown message.
- On close, status becomes `disconnected`.
  - There is no auto-reconnect loop implemented in `HyperliquidPositionsWs`.

## Edge Cases

### Mixed DEX support and “silver” dex detection
Server REST code probes multiple perp DEXs and includes a special case to find a DEX containing “SILVER”.

- Source: `api/perpetuals/hyperliquid.ts`

This affects which DEXs are queried for positions and equity.

## Persistence (Firestore paths, local cache)
- Hyperliquid wallet address: `users/{uid}/settings/user` → `apiKeys.hyperliquidWalletAddress`
- Perpetuals data is NOT stored as a user-edited collection; it is computed/fetched dynamically and attached to a `Perpetuals` net worth item in memory.

## Acceptance Criteria (testable)

1. **Price column**:
   - When mark prices are available, the Positions “Price” column MUST display `$<formatted markPx>`.
2. **WS fallback**:
   - If WS is disconnected and REST positions exist, positions table MUST still render from REST snapshot.
3. **Performance boxes**:
   - Performance PnL boxes MUST render 24h/7d/30d/90d values or “N/A” if null.
4. **Missing wallet address**:
   - If wallet address is not configured, Hyperliquid Perpetuals item MUST be absent or contain empty arrays (no crash).

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Add WS auto-reconnect with exponential backoff and make the “mark price” source explicit in UI copy (e.g., “Mark”).

