# Transactions Specification

## Scope
This specification defines the **current** transaction behavior for **Net Worth transactions** in Capitalos:

- Create / edit / delete of `NetWorthTransaction` records
- Validation rules and error messages as implemented in the UI
- Save semantics (optimistic local state + persistence)
- Persistence locations (Firestore + localStorage backup)
- Multi-device overwrite behavior (conflict detection) where implemented

This spec does **not** define:

- Cashflow forecast entries (see `docs/specs/cashflow.spec.md`)
- Snapshot logic (see `docs/specs/snapshots.spec.md`)
- Exchange/perpetuals positions (see exchange specs)

## Definitions (data model / terms)

### NetWorthTransaction (data model)
Source of truth for shape and semantics:

- `src/pages/NetWorth.tsx` (`export interface NetWorthTransaction`)
- `lib/balanceCalculation.ts` (how transactions affect holdings and value)

Fields:

- **`id`** (string, required): Client-generated identifier. UI uses `crypto.randomUUID()` when available, else `tx-${Date.now()}`.
- **`itemId`** (string, required): Foreign key to a `NetWorthItem.id`.
- **`side`** (`'buy' | 'sell'`, required): Required for backward compatibility and non-crypto items.
- **`currency`** (string, required): Transaction currency code.
  - In practice, it is treated as `CurrencyCode` (`'CHF' | 'EUR' | 'USD'`) in conversion logic.
- **`amount`** (number, required):
  - For `BUY`/`SELL` transactions: stored as an **absolute** positive quantity.
  - For `ADJUSTMENT` transactions: stored as a **signed** delta quantity (can be negative).
- **`pricePerItemChf`** (number, required): Per-item price *in CHF* (or special-case values; see rules below).
- **`pricePerItem`** (number, optional): Per-item price *in original currency* (used for backward compatibility and to preserve original input).
- **`date`** (string, required): ISO date string in `YYYY-MM-DD` format.
- **`cryptoType`** (`'BUY' | 'SELL' | 'ADJUSTMENT'`, optional): If set, it overrides `side` semantics for supported categories.
- **`adjustmentReason`** (string, optional): Optional free-text note (used for all transaction types in the Add/Edit modal).

### Transaction types and modes
The Add/Edit Transaction UI (`AddTransactionModal`) supports:

- **Buy/Sell mode**:
  - User enters a signed amount.
  - Positive amount means BUY; negative amount means SELL.
- **Adjustment mode** (only for certain categories):
  - User enters a signed amount (delta).
  - Stored as `cryptoType: 'ADJUSTMENT'`.
  - Stored with `pricePerItemChf: 0` and `pricePerItem: 0`.

Categories that support the “Adjustment mode” toggle are defined in:

- `src/pages/NetWorth.tsx` → `supportsAdjustmentMode`

## Data Sources & Ownership (SSOT)

### In-memory UI state (page-local)
`src/pages/NetWorth.tsx` stores transactions in a React state array:

- `const [transactions, setTransactions] = useState<NetWorthTransaction[]>([])`

### Persistent storage (Firestore)
Transactions are persisted per-document:

- **Collection path**: `users/{uid}/netWorthTransactions/{transactionId}`
  - Source: `src/services/firestoreService.ts` → `saveNetWorthTransaction`

Writes use **conflict-safe upsert**:

- `src/lib/firestoreSafeWrite.ts` → `safeUpsertDoc`

Metadata added by safe write helpers (stored on the Firestore document):

- `updatedAt` (server timestamp)
- `updatedBy` (device id)
- `version` (incrementing integer)

Note: `NetWorthTransaction` TypeScript type does not declare these fields, but the UI code **expects** `updatedAt` to exist sometimes for conflict detection.

### Local cache / fallback (localStorage)
There is a uid-scoped localStorage backup maintained by `src/services/storageService.ts`.

- **Key format** (preferred): `capitalos:${uid}:netWorthTransactions`
- **Key format** (fallback when uid is missing): `capitalos_netWorthTransactions_v1`
  - Source: `src/services/storageService.ts` → `getStorageKey()`

Load behavior:

- If `uid` is present, the app attempts Firestore first; if it returns items, it syncs them into localStorage.
- If Firestore fails or returns an empty list, localStorage is used as a fallback.
  - Source: `src/services/storageService.ts` → `loadNetWorthTransactions`

## User Flows (step-by-step)

### A) Add Item (with initial transaction)
Source: `src/pages/NetWorth.tsx` → “Add Item” modal submission logic.

1. User opens “Add Item – <Category>”.
2. User enters:
   - `Item` name (required)
   - `Currency` (select, except crypto)
   - `Amount (holdings)` (required, non-zero; can be positive or negative)
   - `Price per Item` (required for categories that require it; must be > 0)
   - `Platform`
   - `Date` (required)
   - `Monthly Depreciation (CHF)` (required for Depreciating Assets; must be > 0)
3. On submit:
   - A new `NetWorthItem` is created.
   - An initial `NetWorthTransaction` is created **if** `onSaveTransaction` is provided and the item was created successfully.
4. The modal resets its form state and closes.

### B) Add Transaction for an existing item
Source: `src/pages/NetWorth.tsx` → `AddTransactionModal`.

1. User opens “Add Transaction – <Item Name>”.
2. Modal initializes:
   - Date defaults to today (`YYYY-MM-DD`) unless editing.
   - Amount defaults to `'0'` for new transactions.
   - If the item is crypto or stock-like, the modal may fetch a price automatically (see Market Data rules in this file).
3. User chooses input mode:
   - **Amount mode**: user inputs delta amount.
   - **Balance mode**: user inputs target holdings; modal computes delta amount.
4. User submits:
   - The modal validates inputs and calls `onSave(...)` with an `Omit<NetWorthTransaction, 'id'>`.
5. The page generates the `id` and persists the document.

### C) Edit Transaction
Source: `src/pages/NetWorth.tsx` → `handleUpdateTransaction`.

1. User selects an existing transaction.
2. UI updates the local state optimistically.
3. Save is attempted to Firestore with `clientUpdatedAt` (if available on the local object).
4. If Firestore write fails or is rejected due to conflict, the UI currently does **not** revert the optimistic update.

### D) Delete Transaction
Source: `src/pages/NetWorth.tsx` → `handleDeleteTransaction`.

1. UI removes transaction from local state optimistically.
2. Delete is attempted to Firestore with `clientUpdatedAt` (if available).
3. If delete fails or is rejected due to conflict, the UI currently does **not** restore the deleted transaction in local state.

## Behavioral Rules (MUST / MUST NOT)

### General
- **A transaction MUST have**: `id`, `itemId`, `date`, `currency`, `amount`, `side`, `pricePerItemChf`.
- **The date MUST be stored** as `YYYY-MM-DD`.
- **The UI MUST reject** `amount === 0` (zero amounts are invalid).

### Amount sign and storage semantics
Current rule is deterministic in the UI:

- **In Buy/Sell mode**:
  - User inputs a signed `amount` value.
  - The system SHALL derive:
    - `side = 'buy'` if input amount > 0
    - `side = 'sell'` if input amount < 0
  - The persisted `amount` field MUST be `Math.abs(inputAmount)`.
  - For supported categories, `cryptoType` MUST be set to `'BUY'` or `'SELL'` consistent with sign.

- **In Adjustment mode** (when enabled and selected):
  - The persisted `amount` field MUST preserve the sign (delta).
  - The persisted `cryptoType` MUST be `'ADJUSTMENT'`.
  - The persisted `pricePerItemChf` MUST be `0`.
  - The persisted `pricePerItem` MUST be `0`.
  - The persisted `side` MUST still be set for backward compatibility:
    - `'buy'` if `amount > 0`, else `'sell'`.

### Categories without “price per item”
Certain categories always treat price-per-item as `1` and hide the input:

- Source: `src/pages/NetWorth.tsx` → `categoriesWithoutPricePerItem`
- Current list: `Cash`, `Bank Accounts`, `Retirement Funds`, `Real Estate`, `Perpetuals`

Rules:

- For these categories, UI MUST store `pricePerItem = 1` and `pricePerItemChf = 1` for BUY/SELL-style transactions.
- For these categories, the UI MUST NOT require the price input field.

### Currency rules (current behavior)
Where currency is chosen/forced:

- In the **Add Item** modal:
  - Crypto items: currency is displayed as USD and cannot be changed.
  - Non-crypto items: currency selector offers `CHF | EUR | USD`.

- In the **Add/Edit Transaction** modal:
  - `transactionCurrency` is computed as:
    - `'USD'` for crypto
    - otherwise `item.currency`
  - Price display currency (`priceCurrency` state) is:
    - `'USD'` for crypto and stock-like categories
    - otherwise `item.currency`

**Current behavior unclear / inconsistent**

- For stock-like categories (`Index Funds`, `Stocks`, `Commodities`), the modal displays the price input in **USD** but converts it using `convert(parsedPrice, transactionCurrency)` where `transactionCurrency` is `item.currency`.
- If `item.currency` can be set to `CHF` or `EUR`, the conversion path becomes ambiguous (USD displayed value treated as CHF/EUR).

Involved code:

- `src/pages/NetWorth.tsx` → `AddTransactionModal`:
  - `isStockCategory`
  - `priceCurrency`
  - `transactionCurrency`
  - `convert(parsedPrice, transactionCurrency)`

Missing to make behavior unambiguous:

- Explicit statement of **the unit of `pricePerItemChf`** for stock-like categories and whether the UI input is always USD or matches `item.currency`.

**PROPOSAL (recommended default behavior)**

- For `Index Funds` / `Stocks` / `Commodities`, if price is fetched from Yahoo Finance (USD), the UI SHOULD force `item.currency = 'USD'` and treat price input as USD always.

### Price fetching behavior (modal)
When the Add/Edit Transaction modal opens:

- If item category is **Crypto**:
  - The modal SHALL fetch price for `item.name` via `fetchCryptoPrices([ticker])`.
  - The fetched price is treated as USD and placed into the price input.
  - If fetch fails:
    - If editing and exchange rates are available, it attempts to derive USD from stored CHF price:
      - `baseAmount = convert(transaction.pricePerItemChf, 'CHF')`
      - `usdAmount = baseAmount * exchangeRates.rates['USD']`
    - Otherwise it shows a warning and user must enter manually.

- If item category is **Index Funds / Stocks / Commodities**:
  - The modal SHALL fetch price via `fetchStockPrices([ticker], rapidApiKey)`.
  - If RapidAPI key is missing, it sets `priceError` with:
    - `RapidAPI key not configured. Please set it in Settings to fetch prices automatically.`

### Save semantics
- The Net Worth page SHALL perform an **optimistic local state update first** and then attempt persistence.
- Persistence failure MUST NOT currently block the UI from showing the optimistic change (no revert is implemented).
- There is no explicit “pending” UI state for transaction writes; failures are logged via `console.error`.

### Multi-device concurrency (conflict detection)
Firestore writes use `safeUpsertDoc` conflict checks when `clientUpdatedAt` is provided.

- If the remote document’s `updatedAt` is newer than `clientUpdatedAt`, the write MUST be rejected with reason:
  - `existing_document_newer`
- If `clientUpdatedAt` is not provided and the doc was updated by another device within the last 5 seconds, the write MAY be rejected with:
  - `recent_write_by_another_device`

Note: The UI passes `clientUpdatedAt` only for edits/deletes when it can read `existingTransaction.updatedAt`.

## Validation Rules
Validation is implemented in `src/pages/NetWorth.tsx` in the two modals.

### Add Item modal validation (creates initial transaction)
- **Name**:
  - If blank: error `Please enter an item name.`
- **Date**:
  - If missing: error `Please select a date.`
- **Amount**:
  - If missing / NaN / 0: error `Please enter a valid amount (can be positive for buy or negative for sell).`
- **Price per Item** (only when visible):
  - If missing / NaN / <= 0: error `Please enter a valid price per item greater than 0.`
- **Monthly Depreciation** (only for Depreciating Assets):
  - If missing / NaN / <= 0: error `Please enter a valid monthly depreciation amount greater than 0.`

### Add/Edit Transaction modal validation
- **Date**:
  - If missing: `Please select a date.`
- **BUY/SELL**:
  - Amount missing / NaN / 0: `Please enter a valid amount (positive for buy, negative for sell).`
  - Price per item missing / NaN / <= 0 (if required): `Please enter a valid price per item greater than 0.`
- **ADJUSTMENT**:
  - Amount missing / NaN / 0: `Please enter a valid amount (can be positive or negative, but not zero).`

## Loading States
- Price auto-fetch in modals sets `isLoadingPrice` true and disables the price input while fetching.
- When fetching fails, `priceError` is displayed below the input (small warning text).

## Error Handling & Fallbacks
- Persistence errors:
  - Logged to console (`console.error(...)`)
  - UI does not display a blocking error modal; optimistic changes remain visible.
- Price fetching:
  - If CryptoCompare/Yahoo fetch fails, UI shows warning text and expects manual input.

## Edge Cases
- **Amount sign**:
  - In BUY/SELL mode, negative input is accepted but stored as absolute with side='sell'.
- **Adjustment value semantics**:
  - Adjustment affects holdings, but not “total value” in the modal (it sets total to 0).
- **Missing `updatedAt` on local object**:
  - Conflict detection may not work for edits/deletes if the transaction object lacks `updatedAt`.
- **Stock-like currency mismatch**:
  - See “Currency rules” ambiguity section above.

## Persistence (Firestore paths, local cache)
- **Firestore**:
  - `users/{uid}/netWorthTransactions/{transactionId}`
- **localStorage backup**:
  - `capitalos:${uid}:netWorthTransactions`
  - fallback: `capitalos_netWorthTransactions_v1`

## Acceptance Criteria (testable)
The following are testable UI behaviors. Note: The current UI does not consistently expose `data-testid` attributes; tests will likely need role/text-based selectors or future test hooks.

1. **Add transaction validation**:
   - When submitting with amount `0`, the modal MUST show the exact error message for the relevant mode.
2. **BUY vs SELL**:
   - Entering a negative amount in Buy/Sell mode MUST result in a persisted transaction with `side='sell'` and `amount` stored as positive.
3. **ADJUSTMENT**:
   - When in adjustment mode, saving a negative amount MUST persist `cryptoType='ADJUSTMENT'`, preserve signed `amount`, and persist `pricePerItemChf=0`.
4. **Price required**:
   - For categories where price is shown, leaving price blank MUST show `Please enter a valid price per item greater than 0.`
5. **Optimistic persistence**:
   - After saving a transaction, the transaction list MUST update immediately even if Firestore write fails (can be simulated by blocking network).

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Add stable selectors (`data-testid`) to:

- Add Item modal fields (`nw-item-name`, `nw-amount`, `nw-price-per-item`, `nw-date`)
- Add Transaction modal fields (`tx-amount`, price input, adjustment toggle, submit button)
- Transaction list rows and row action menus

