# Valuation Engine Specification

## Scope
This specification defines the **current valuation engines** present in the repository and clarifies which one is the SSOT **in practice**.

It covers:

- The SSOT entry points for net worth valuation (current)
- Inputs/outputs and ordering of computation steps (where implemented)
- Rounding and conversion ordering
- Which pages consume which engine
- Snapshot reuse of valuation logic

## Definitions (data model / terms)

### “Valuation”
In this repo, “valuation” can refer to:

- The legacy SSOT net worth computation in `lib/netWorthCalculation.ts` (category totals + total CHF)
- The newer valuation engine in `src/services/valuation/ValuationEngine.ts` (`ValuationResult` with FX and price snapshots)

### ValuationResult (new engine)
Source:

- `src/services/valuation/types.ts` → `export interface ValuationResult`

Key fields:

- `asOf` (number, ms)
- `baseCurrency` (CurrencyCode)
- `displayCurrency` (CurrencyCode)
- `fxSnapshot` (base, quotes map, timestamp)
- `quotesSnapshot` (crypto + market maps, timestamp)
- `itemValuations[]`
- `categoryTotals`
- `total`
- `totalInBaseCurrency`

## Data Sources & Ownership (SSOT)

### SSOT valuation entry point (current production path)
The SSOT valuation entry point used by the app and server snapshot is:

- `lib/netWorthCalculation.ts` → `NetWorthCalculationService.calculateTotals(...)`

It depends on:

- `lib/balanceCalculation.ts` (holdings + transaction-based valuation)
- Market data maps passed in by callers:
  - `cryptoPrices` (USD)
  - `stockPrices` (Yahoo-derived; treated inconsistently as described in `docs/specs/net-worth.spec.md`)
  - `usdToChfRate` (CryptoCompare)
  - `convert(...)` from the client’s currency conversion layer

### New valuation engine (present, but not SSOT for main pages)
There is a second engine:

- `src/services/valuation/ValuationEngine.ts` → `computeValuation(...)`

It uses:

- `src/services/market-data/FxRateService.ts`
- `src/services/market-data/CryptoPriceService.ts`
- `src/services/market-data/MarketPriceService.ts`
- `src/services/market-data/CurrencyConversion.ts`

**Current behavior unclear**

- `ValuationProvider` exists (`src/providers/ValuationProvider.tsx`) but is not mounted in `src/App.jsx`.
- Therefore, pages are not currently driven by this new `ValuationResult` in the primary route tree.

## User Flows (step-by-step)

### A) Dashboard net worth
Current behavior:

- Dashboard computes totals by calling the legacy SSOT:
  - `NetWorthCalculationService.calculateTotals(...)`
  - Source: `src/pages/Dashboard.tsx`

### B) Net Worth page subtotals
Current behavior:

- Net Worth page computes subtotals using `calculateBalanceChf`/`calculateHoldings` with page-level logic and price maps passed from context.
  - Source: `src/pages/NetWorth.tsx`

### C) Snapshots (manual + cron)
Current behavior:

- Snapshots are computed using the legacy SSOT:
  - `src/services/snapshotService.ts` → `createSnapshot(...)`
  - `api/snapshot/create.ts` also calls `NetWorthCalculationService.calculateTotals(...)`

## Behavioral Rules (MUST / MUST NOT)

### Deterministic ordering (legacy SSOT)
When using `NetWorthCalculationService.calculateTotals(...)`, the system MUST:

1. Initialize all category totals to 0 for the fixed category list.
2. For each net worth item:
   - Compute its CHF balance using category-specific rules:
     - Crypto: current price × coin amount → USD → CHF
     - Perpetuals: exchangeBalance USD → CHF
     - Stock-like: holdings × currentPrice → convert from item.currency → CHF
     - Else: transaction-based CHF via `calculateBalanceChf`
3. Guard against NaN/Infinity per item and treat as 0.
4. Sum all category totals to produce `totalNetWorthChf`.

Source: `lib/netWorthCalculation.ts`.

### Conversion ordering (legacy SSOT)
- Crypto MUST convert USD to CHF using `usdToChfRate` if available; otherwise MUST fall back to `convert(usdValue, 'USD')`.
- Perpetuals MUST treat holdings as USD and convert similarly.

### Rounding
Current behavior:

- The SSOT valuation functions store and compute using JavaScript numbers (double precision) with no rounding until formatting.
- UI formatting may round for display (e.g., `toFixed(2)` in some places, `Intl.NumberFormat` for currency).

## Validation Rules
- Tickers MUST be normalized via `.trim().toUpperCase()` where used as keys into price maps.

## Loading States
There is no dedicated “valuation loading” state for the legacy SSOT.

New engine path (if wired) supports:

- `ValuationProvider` sets `isLoading` during computation.

## Error Handling & Fallbacks
- Legacy SSOT: failures are handled by caller try/catch and by NaN guards.
- New engine: logs errors and sets provider `error` if computation throws.

## Edge Cases

### Stock price currency mismatch
See `docs/specs/net-worth.spec.md` for the current mismatch between Yahoo-derived USD quotes and `item.currency`.

### Crypto unit mismatch in `calculateBalanceChf`
`calculateBalanceChf` returns USD for crypto when current prices are available, otherwise CHF.
Consumers MUST treat this carefully.

## Persistence (Firestore paths, local cache)
Valuation outputs themselves are not persisted directly.

Persisted artifacts that depend on valuation:

- Snapshots stored under `users/{uid}/snapshots/{date}` (see `docs/specs/snapshots.spec.md`)

## Acceptance Criteria (testable)

1. **Legacy SSOT deterministic totals**:
   - For a fixed item/transaction set and fixed price maps, `calculateTotals` MUST return the same totals across invocations.
2. **Perpetuals rule**:
   - Perpetuals totals MUST be derived from `exchangeBalance` only.
3. **NaN guard**:
   - If any intermediate calculation produces NaN/Infinity, the final totals MUST remain finite.

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Choose one engine as SSOT and wire it end-to-end, including:

- Single global price snapshot per refresh
- Single global FX snapshot per refresh
- One valuation result consumed by Dashboard, Net Worth, and snapshot creation

