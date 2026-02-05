# Hyperliquid Exchange Integration Specification

## Scope
This specification defines the **current** Hyperliquid integration behavior:

- Required credentials and where they are stored
- REST vs WebSocket responsibilities
- Data normalization into the UI models (`PerpetualsData`, positions, open orders, portfolio PnL)
- "Price" column definition in the Positions table
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

### Position "Price" in the UI (Hyperliquid page)
On `src/pages/Hyperliquid.tsx`, the Positions table displays `markPx` as the "Price" column.

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
  - Uses all-time series (`allB`) and finds the closest point to "90 days ago" to compute delta vs latest.
  - If closest point equals latest timestamp, returns null.
  - Source: `api/perpetuals/hyperliquid.ts` → `pnl90dUsd`

### WS status reporting
Hyperliquid page displays a status string `WS: <status>` where status is:

- `disconnected` | `connecting` | `subscribed` | `error`

If `error`, the UI appends error text if available.

### Price column definition
On Hyperliquid page:

- "Price" MUST display **mark price** (`markPx`) from asset context.
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
- Empty tables render "No positions" / "No open orders".

## Error Handling & Fallbacks

### REST failure
- If REST response is non-OK, helper returns null.
- `DataContext` may omit Perpetuals item or use empty data arrays.

Source: `src/services/hyperliquidService.ts`.

### WS failure
- WS errors set status to `error` with message "WebSocket error" or a thrown message.
- On close, status becomes `disconnected`.
  - There is no auto-reconnect loop implemented in `HyperliquidPositionsWs`.

## Edge Cases

### Mixed DEX support and "silver" dex detection
Server REST code probes multiple perp DEXs and includes a special case to find a DEX containing "SILVER".

- Source: `api/perpetuals/hyperliquid.ts`

This affects which DEXs are queried for positions and equity.

## Persistence (Firestore paths, local cache)
- Hyperliquid wallet address: `users/{uid}/settings/user` → `apiKeys.hyperliquidWalletAddress`
- Perpetuals data is NOT stored as a user-edited collection; it is computed/fetched dynamically and attached to a `Perpetuals` net worth item in memory.

## Acceptance Criteria (testable)

1. **Price column**:
   - When mark prices are available, the Positions "Price" column MUST display `$<formatted markPx>`.
2. **WS fallback**:
   - If WS is disconnected and REST positions exist, positions table MUST still render from REST snapshot.
3. **Performance boxes**:
   - Performance PnL boxes MUST render 24h/7d/30d/90d values or "N/A" if null.
4. **Missing wallet address**:
   - If wallet address is not configured, Hyperliquid Perpetuals item MUST be absent or contain empty arrays (no crash).

## Crash-Risk & Profit Reminder Indicator

### Overview

A 3-Pillar calm indicator system that helps users:
- De-risk before flash crashes / squeezes
- Counter greed when in profit
- Stay calm (no flipping, no panic)

Works for stable assets (BTC, ETH, GOLD, SILVER), for BOTH longs and shorts.

### Data Sources (Hyperliquid ONLY)

All data fetched from Hyperliquid Info API endpoints. NO user-specific data required beyond position PnL.

#### metaAndAssetCtxs (Primary)

Endpoint: `POST https://api.hyperliquid.xyz/info` with `{ "type": "metaAndAssetCtxs" }`

Fields used per asset:
- `markPx`: Current mark price
- `oraclePx`: Oracle price (optional reference)
- `funding`: Current funding rate
- `openInterest`: Market open interest
- `premium`: Premium vs oracle
- `dayNtlVlm`: 24h notional volume (USD)
- `impactPxs`: Impact prices for slippage estimation (if available)

#### l2Book (Fallback for Liquidity)

Endpoint: `POST https://api.hyperliquid.xyz/info` with `{ "type": "l2Book", "coin": "<COIN>" }`

Fields used:
- `levels[0]`: Best bid/ask prices and sizes
- Aggregated depth within ±0.2% of mid price

#### recentTrades (Optional)

Endpoint: `POST https://api.hyperliquid.xyz/info` with `{ "type": "recentTrades", "coin": "<COIN>" }`

Fields used:
- Price impulse confirmation (NOT mandatory for signal generation)

### Universe Filter (Stability Gate)

The indicator MUST only activate for a given asset if ALL conditions are true:

| Condition | Threshold | Rationale |
|-----------|-----------|-----------|
| `dayNtlVlm` | > $25,000,000 | Sufficient liquidity for reliable signals |
| `openInterest` | > $10,000,000 | Sufficient market participation |

If conditions are NOT met:
- Indicator state = `UNSUPPORTED`
- Message: "Market too unstable for reliable risk signals."
- No colored dot displayed (or gray/neutral dot)

Thresholds are configurable constants (implementation-defined).

### Pillar 1: Crowding (Positioning)

**Purpose:** Detect when market positioning is one-sided (crowded longs or shorts).

#### Metrics

- `openInterest`: Total open interest for the asset
- `funding`: Current funding rate (directional indicator)

#### Formulas

```
OI_z = zscore(openInterest, lookback=7d)
F_z  = zscore(funding, lookback=7d)
```

Where `zscore(x, lookback)` = `(x - mean(x, lookback)) / stddev(x, lookback)`

#### Crowding Detection

Crowding = TRUE if ALL conditions met:
1. `OI_z >= +1.5` (open interest elevated)
2. `|F_z| >= 1.5` (funding rate extreme)
3. Conditions confirmed for **2 consecutive 15-minute windows**

#### Crowding Direction

- `F_z > 0` → **Long crowding** (longs paying shorts)
- `F_z < 0` → **Short crowding** (shorts paying longs)

### Pillar 2: Structure (Is the trade working?)

**Purpose:** Detect whether price action supports or contradicts the crowded position.

#### Metrics

- `markPx` returns over time windows

#### Logic (Directional)

**If Long-Crowded:**
| Return Condition | Structure State |
|------------------|-----------------|
| 15m return > 0 AND 1h return > 0 | Intact |
| 15m return <= 0 OR 1h return ≈ 0 | Weakening |
| 15m return < 0 AND 1h return < 0 | Broken |

**If Short-Crowded:**
| Return Condition | Structure State |
|------------------|-----------------|
| 15m return < 0 AND 1h return < 0 | Intact |
| 15m return >= 0 OR 1h return ≈ 0 | Weakening |
| 15m return > 0 AND 1h return > 0 | Broken |

#### Return Calculation

```
return_15m = (markPx_now - markPx_15m_ago) / markPx_15m_ago
return_1h  = (markPx_now - markPx_1h_ago) / markPx_1h_ago
```

"Approximately zero" threshold: `|return| < 0.001` (0.1%)

### Pillar 3: Liquidity (Can price air-pocket?)

**Purpose:** Detect thin orderbook conditions that could amplify price moves.

#### Preferred: Impact Prices

If `impactPxs` available from metaAndAssetCtxs:

```
impact_cost = abs(impactPxs.ask - impactPxs.bid) / markPx
impact_cost_z = zscore(impact_cost, lookback=7d)
```

Liquidity fragile = TRUE if `impact_cost_z >= 1.5`

#### Fallback: L2 Book Analysis

If `impactPxs` not available, use l2Book:

```
spread = (bestAsk - bestBid) / midPx
depth_bid = sum(bid sizes within midPx * 0.998)
depth_ask = sum(ask sizes within midPx * 1.002)
total_depth = depth_bid + depth_ask

spread_z = zscore(spread, lookback=7d)
depth_z  = zscore(total_depth, lookback=7d)
```

Liquidity fragile = TRUE if:
- `spread_z >= 1.5` (spread widened)
- OR `depth_z <= -1.5` (depth reduced)

#### Time Confirmation

Liquidity fragile must be confirmed for **2 consecutive checks** (polling interval).

### Final State Logic

#### State Definitions

| State | Conditions |
|-------|------------|
| **GREEN** | Crowding = FALSE, OR (Crowding = TRUE AND Structure = Intact) |
| **ORANGE** | Crowding = TRUE AND Structure = Weakening AND Liquidity NOT fragile |
| **RED** | Crowding = TRUE AND Structure = Broken AND Liquidity = Fragile |
| **UNSUPPORTED** | Stability gate failed (low volume/OI) |

#### Decision Flow

```
if (stabilityGate fails):
    return UNSUPPORTED

if (crowding == FALSE):
    return GREEN

if (crowding == TRUE):
    if (structure == INTACT):
        return GREEN
    if (structure == WEAKENING and liquidity != FRAGILE):
        return ORANGE
    if (structure == BROKEN and liquidity == FRAGILE):
        return RED

# Default fallback
return GREEN
```

### Anti-Flip Cooldowns

To prevent rapid state changes that cause user anxiety:

| Transition | Minimum Hold Time |
|------------|-------------------|
| Any → RED | RED persists for at least **30 minutes** |
| Any → ORANGE | ORANGE persists for at least **15 minutes** |
| RED → GREEN | Allowed only after 30 min cooldown expires |
| ORANGE → GREEN | Allowed only after 15 min cooldown expires |

Implementation note: Store `stateEnteredAt` timestamp and check elapsed time before allowing state reduction.

### Profit Reminder System

**Independent of indicator color.** This system overlays profit-based reminders.

#### Milestones

| PnL Threshold | Message | Fire Behavior |
|---------------|---------|---------------|
| +5% | "You're up ~5%. Consider moving your stop to break-even." | Once per position |
| +10% | "You're up ~10%. Consider trailing your stop to lock in profits." | Once per position |
| +15% (optional) | "You're up ~15%. Strong gains—consider partial take-profit." | Once per position |
| +20% (optional) | "You're up ~20%. Excellent trade. Protect these gains." | Once per position |

#### Override When RED Active

If indicator state = RED and a profit milestone fires:
- Replace milestone message with: "You're in profit, but risk is high. Protect gains now."

#### State Tracking

Track which milestones have fired per position ID to prevent repeated reminders:
- `firedMilestones: Record<positionId, Set<'5%' | '10%' | '15%' | '20%'>>`
- Reset when position closes (removed from positions list)

### User-Facing Messages

#### Indicator Messages (exact strings)

| State | Dot Color | Message |
|-------|-----------|---------|
| GREEN | 🟢 | "Market is stable. Trade as planned." |
| ORANGE | 🟠 | "Risk is rising. Consider reducing size or tightening your stop." |
| RED | 🔴 | "High crash risk. Protect capital or exit." |
| UNSUPPORTED | ⚪ (gray) | "Market too unstable for reliable risk signals." |

#### Profit Reminder Messages

See Milestones table above.

### UI Specification

#### Indicator Frame

- **Location:** Top of Hyperliquid page, above Performance frame
- **Frame title:** "Risk Indicator" (or similar)
- **Content:** One line per open position with:
  - Colored dot (GREEN/ORANGE/RED/gray)
  - Single message sentence
- **Sorting:** RED first, then ORANGE, then GREEN, then UNSUPPORTED
- **No tooltips** for this feature (keep it simple)

#### Profit Reminders

- Displayed as secondary line below the position's indicator line
- OR as a toast/notification (implementation-defined)
- Must not obscure or replace the indicator message

### Data Refresh & Polling

| Data | Refresh Interval |
|------|------------------|
| metaAndAssetCtxs | 15 seconds (or on WS update) |
| l2Book | 30 seconds (only when impactPxs unavailable) |
| Historical lookback (7d stats) | 5 minutes (cached) |

### Error Handling

- If metaAndAssetCtxs fetch fails: Show "Risk data unavailable" for affected assets
- If l2Book fetch fails: Use impactPxs only (if available) or show "–"
- If historical data insufficient (<7d): Use available data with wider confidence intervals OR show UNSUPPORTED
- Rendering MUST NOT crash on null/undefined data

### Acceptance Criteria (Crash-Risk Indicator)

1. **Stability gate:** Assets with `dayNtlVlm < $25M` OR `openInterest < $10M` show UNSUPPORTED state
2. **3-Pillar logic:** RED only fires when ALL 3 pillars agree (crowding + structure broken + liquidity fragile)
3. **Cooldowns:** State cannot downgrade (RED→ORANGE→GREEN) faster than cooldown period
4. **Profit reminders:** Fire at +5%, +10% milestones; only once per position
5. **Override:** Profit reminder replaced with risk warning when RED active
6. **No crash:** Missing data displays "–" and does not crash UI
7. **Sorting:** Indicator lines sorted by severity (RED first)

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Add WS auto-reconnect with exponential backoff and make the "mark price" source explicit in UI copy (e.g., "Mark").
