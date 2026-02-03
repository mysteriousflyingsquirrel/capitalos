# Net Worth Specification

## Scope
This specification defines the **current** Net Worth behavior in Capitalos, including:

- Supported Net Worth categories and their definitions
- How items and holdings are derived from transactions
- How totals are computed (by category and overall)
- Currency conversion rules and price sourcing
- Missing-price fallbacks and special-case logic (Perpetuals, Depreciating Assets)
- How this maps into snapshot creation and (if applicable) valuation outputs

This spec covers the Net Worth page and shared calculation modules used by:

- `src/pages/NetWorth.tsx`
- `src/contexts/DataContext.tsx` (periodic refresh + price feeds)
- `lib/netWorthCalculation.ts` and `lib/balanceCalculation.ts`
- `src/services/snapshotService.ts` and `api/snapshot/create.ts`

## Definitions (data model / terms)

### NetWorthCategory
Source: `src/pages/NetWorth.tsx` (`export type NetWorthCategory`).

Supported categories (current list):

- `Cash`
- `Bank Accounts`
- `Retirement Funds`
- `Index Funds`
- `Stocks`
- `Commodities`
- `Crypto`
- `Perpetuals`
- `Real Estate`
- `Depreciating Assets`

Category ordering in the Net Worth UI:

- Source: `src/pages/NetWorth.tsx` → `categoryOrder`

### NetWorthItem (data model)
Source: `src/pages/NetWorth.tsx` (`export interface NetWorthItem`).

Fields:

- **`id`** (string, required)
- **`category`** (`NetWorthCategory`, required)
- **`name`** (string, required)
  - For `Crypto`, `Index Funds`, `Stocks`, `Commodities`: `name` is treated as a **ticker/symbol**.
- **`platform`** (string, required): Free-form platform name (typically from user-managed `platforms` list).
- **`currency`** (string, required): Item currency.
- **`monthlyDepreciationChf`** (number, optional): Only used for `Depreciating Assets`.
- **`perpetualsData`** (optional): Only used for `Perpetuals` category items that are created dynamically.

### Holdings
Holdings are computed from `NetWorthTransaction` entries:

- Source: `lib/balanceCalculation.ts` → `calculateHoldings` / `calculateCoinAmount`
- For most categories, “holdings” means the current quantity.
- For `Crypto`, coin amount and holdings are both derived from the same transaction semantics (BUY/SELL/ADJUSTMENT).

## Data Sources & Ownership (SSOT)

### SSOT for totals (current)
The **current SSOT** for computing category totals and overall net worth totals is:

- `lib/netWorthCalculation.ts` → `NetWorthCalculationService.calculateTotals(...)`

This SSOT is used by:

- `src/services/snapshotService.ts` → `createSnapshot(...)`
- `api/snapshot/create.ts` → server-side computation of the daily snapshot (via `lib/netWorthCalculation.js`)

### SSOT for transaction-to-holdings math
The SSOT for how transactions affect holdings and balances is:

- `lib/balanceCalculation.ts`

### Market data inputs
Net worth totals depend on the following market data sources, produced elsewhere:

- **Crypto prices (USD)**: CryptoCompare (`lib/cryptoCompare.ts`), typically consumed via `src/services/cryptoCompareService.ts`
- **USD→CHF rate**: CryptoCompare (same module)
- **Stock/ETF/commodity prices**: Yahoo Finance via RapidAPI (`src/services/yahooFinanceService.ts`)
- **FX rates (for UI currency conversion)**: exchangerate-api.com (`src/services/exchangeRateService.ts`) via `CurrencyContext` (not specified here; see `docs/specs/market-data.spec.md`)

## User Flows (step-by-step)

### A) User adds an item
Source: `src/pages/NetWorth.tsx` (Add Item modal).

1. User selects a category section and clicks “Add Item”.
2. User enters required fields.
3. The UI creates the `NetWorthItem` and immediately creates an initial `NetWorthTransaction` representing the purchase/sale/initial balance.
4. The UI optimistically updates local state; persistence is attempted after.

### B) User adds/edits/deletes transactions
See `docs/specs/transactions.spec.md`. Net worth holdings and values MUST update immediately based on the in-memory state array, independent of persistence completion.

### C) Perpetuals appear automatically
Perpetuals are not manually added via the Net Worth Add Item flow.

- `Perpetuals` items are created dynamically by `DataContext` (client) and `api/snapshot/create.ts` (server snapshot job) based on settings (Hyperliquid wallet address, MEXC keys).

## Behavioral Rules (MUST / MUST NOT)

### Category totals and total net worth
The system MUST compute:

- A per-category CHF total (`categoryTotals[category]`)
- A total net worth (CHF), which is the sum of all category totals

The computation MUST follow `NetWorthCalculationService.calculateTotals` in `lib/netWorthCalculation.ts`.

### Currency handling

#### Base computation currency
- The SSOT calculation computes totals in **CHF**.

#### Crypto (special case)
- When current prices for a crypto ticker exist:
  - Coin amount = `calculateCoinAmount(item.id, transactions)`
  - Value in USD = coinAmount × currentPriceUsd
  - Value in CHF = valueUsd × `usdToChfRate` (CryptoCompare)
- If `usdToChfRate` is missing or invalid:
  - The system MUST use a fallback conversion via `convert(balanceUsd, 'USD')`.

#### Index Funds / Stocks / Commodities (special case)
Current SSOT rule in `lib/netWorthCalculation.ts`:

- Holdings = `calculateHoldings(item.id, transactions)`
- Current price = `stockPrices[ticker]` (number)
- If current price > 0:
  - valueInItemCurrency = holdings × currentPrice
  - valueChf = `convert(valueInItemCurrency, item.currency)`
- If current price is missing or <= 0:
  - fallback to `calculateBalanceChf(...)`

**Current behavior unclear / inconsistent**

- `stockPrices` are fetched via `src/services/yahooFinanceService.ts`, which parses Yahoo quotes’ `regularMarketPrice`, which is typically **USD**.
- The SSOT net worth calculation treats `stockPrices[ticker]` as being in **`item.currency`**.

Involved code:

- `lib/netWorthCalculation.ts` (comment: “price is already in item.currency”)
- `src/services/yahooFinanceService.ts` (prices are stored as USD)
- `src/pages/NetWorth.tsx` Add Item modal allows item currency selection for these categories

Missing to make behavior deterministic:

- A rule that forces these categories’ `item.currency` to `USD` OR a conversion of fetched USD prices into the item’s chosen currency before using them.

**PROPOSAL (recommended default behavior)**

- Treat Yahoo Finance prices as USD and force `item.currency = 'USD'` for these categories.

#### Perpetuals (special case)
Perpetuals category totals MUST be computed from `exchangeBalance` only.

- Open positions are displayed but MUST NOT affect net worth totals.
- `exchangeBalance.holdings` is treated as **USD** and converted to CHF using:
  - `usdToChfRate` if available and valid; else `convert(holdings, 'USD')`.

Sources:

- `lib/netWorthCalculation.ts` (Perpetuals branch)
- `lib/balanceCalculation.ts` (Perpetuals branch)
- `src/services/firestoreService.ts` filters out Perpetuals items from persistence (client does not store them)

#### Depreciating Assets (special case)
If `item.category === 'Depreciating Assets'` and `item.monthlyDepreciationChf > 0`:

- The system MUST compute a “base balance” from transactions (BUY/SELL/ADJUSTMENT logic).
- It MUST identify the earliest BUY transaction date (by `tx.date`) and compute:
  - `monthsDiff = (now.year - firstBuy.year) * 12 + (now.month - firstBuy.month)`
- If `monthsDiff > 0`:
  - totalDepreciation = monthlyDepreciationChf × monthsDiff
  - depreciatedBalance = `max(0, baseBalance - totalDepreciation)`
- If no BUY transactions exist, no depreciation is applied.

Source: `lib/balanceCalculation.ts` (Depreciating Assets branch).

### Items and transactions persistence rules
See `docs/specs/transactions.spec.md`. Additional Net Worth item persistence rule:

- `Perpetuals` items MUST NOT be persisted in Firestore (`saveNetWorthItem` returns success without writing).
  - Source: `src/services/firestoreService.ts` → `saveNetWorthItem` filters category `Perpetuals`.

## Validation Rules
Net Worth item creation and transaction validation are defined in:

- `src/pages/NetWorth.tsx` (Add Item modal, Add Transaction modal)

See `docs/specs/transactions.spec.md` for exact validation messages.

## Loading States
Net Worth data load depends on:

- Authentication readiness (`AuthGate`)
- Data load completion (`DataContext`)
- Price fetch cycles (CryptoCompare + Yahoo Finance) executed during data refreshes

Within the Net Worth page UI:

- Add Item modal and Add/Edit Transaction modal MAY show a price “fetching...” indicator and disable the price input while loading.
  - Source: `src/pages/NetWorth.tsx`

## Error Handling & Fallbacks

### Missing crypto price
- If a crypto’s ticker has no current price in `cryptoPrices` or the price is non-positive, the system MUST fall back to transaction-based valuation via `calculateBalanceChf(...)`.
  - Source: `lib/balanceCalculation.ts`

### Missing USD→CHF rate
- If `usdToChfRate` is missing or invalid, crypto and perpetuals USD values MUST be converted using `convert(..., 'USD')` as a fallback.
  - Source: `lib/netWorthCalculation.ts`

### Missing stock/ETF/commodity price
- If a ticker has no entry in `stockPrices` (or the value is non-positive), the system MUST fall back to `calculateBalanceChf(...)`.
  - Source: `lib/netWorthCalculation.ts`

### NaN / Infinity protection
- Any computed per-item balance that is `NaN` or non-finite MUST be treated as `0` when accumulating category totals.
  - Source: `lib/netWorthCalculation.ts` → `validBalance`

## Edge Cases

### Crypto balance unit ambiguity (USD vs CHF)
`calculateBalanceChf(...)` has a mixed-unit behavior:

- If a valid current crypto price exists for the ticker, it returns **USD** value (coinAmount × priceUsd).
- If no current price exists for that ticker, it returns a transaction-derived value in **CHF** (when a `convert` function is available).

Consumers MUST NOT assume it always returns CHF.

Involved code:

- `lib/balanceCalculation.ts`
- `src/pages/NetWorth.tsx` contains comments that do not fully match this behavior.

### Perpetuals do not include open positions in totals
Perpetuals open positions are displayed, but totals MUST be computed from `exchangeBalance` only.

### Depreciation ignores `depr-` transaction IDs
For Depreciating Assets, transactions with ids beginning with `depr-` are excluded from base balance calculation.
This supports legacy data; the current UI does not generate these ids in visible code.

## Persistence (Firestore paths, local cache)

### Net worth items
- Firestore path: `users/{uid}/netWorthItems/{itemId}`
  - Exception: Items with `category === 'Perpetuals'` MUST NOT be written by the client.
- localStorage backup key:
  - `capitalos:${uid}:netWorthItems`
  - fallback: `capitalos_netWorthItems_v1`

### Net worth transactions
- Firestore path: `users/{uid}/netWorthTransactions/{transactionId}`
- localStorage backup key:
  - `capitalos:${uid}:netWorthTransactions`
  - fallback: `capitalos_netWorthTransactions_v1`

## Acceptance Criteria (testable)

1. **Immediate recomputation**:
   - When a transaction is added/edited/deleted, the category subtotal and total net worth MUST update without a full reload.
2. **Perpetuals totals rule**:
   - Perpetuals category total MUST equal (sum of exchange balance holdings in USD) converted to CHF using `usdToChfRate` (or fallback FX conversion), and MUST NOT include open positions PnL.
3. **Depreciation clamp**:
   - Depreciating Assets computed value MUST NEVER display below `0`.
4. **Missing price fallback**:
   - If price maps do not contain a ticker, the UI MUST still compute a finite value using transaction history (no NaN/Infinity).

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Make the stock-like currency handling deterministic by enforcing `item.currency='USD'` for `Index Funds`, `Stocks`, and `Commodities` or by converting fetched USD quotes into the item’s currency before valuation.


