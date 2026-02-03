# Cashflow Specification

## Scope
This specification defines the **current** cashflow system in Capitalos:

- Cashflow data models (inflow/outflow items, accountflow mappings, platforms)
- How monthly inflow/outflow/spare change are computed (and where)
- Cashflow UI flows: create/edit/delete items and mappings
- Persistence semantics (Firestore + localStorage backup + conflict rules)
- Interaction points with Analytics “Forecast” (planned entries) and Dashboard monthly cashflow KPI

This spec does **not** cover:

- Net worth holdings/transactions (see `docs/specs/net-worth.spec.md` and `docs/specs/transactions.spec.md`)
- Snapshot logic (see `docs/specs/snapshots.spec.md`)

## Definitions (data model / terms)

### InflowItem
Source: `src/pages/Cashflow.tsx` (`export interface InflowItem`).

Fields:

- **`id`** (string, required)
- **`item`** (string, required): Label/name.
- **`amount`** (number, required): Original amount in original currency.
- **`currency`** (string, required): Original currency. UI uses `CHF|EUR|USD`.
- **`amountChf`** (number, required, legacy/back-compat): Historically stored CHF amount.
  - UI often prefers `amount`+`currency` if present.
- **`provider`** (string, required)
- **`group`** (enum, required): One of:
  - `Time`
  - `Service`
  - `Worker Bees`

Semantics:

- Inflow amounts are treated as **positive** (validation enforces > 0).

### OutflowItem
Source: `src/pages/Cashflow.tsx` (`export interface OutflowItem`).

Fields:

- **`id`** (string, required)
- **`item`** (string, required)
- **`amount`** (number, required): Original amount (positive).
- **`currency`** (string, required)
- **`amountChf`** (number, required, legacy/back-compat)
- **`receiver`** (string, required)
- **`group`** (enum, required): One of:
  - `Fix`
  - `Variable`
  - `Shared Variable`
  - `Investments`

### Platform
Source: `src/services/storageService.ts` (`export interface Platform`).

Fields:

- **`id`** (string, required)
- **`name`** (string, required): Human label. Also used as the “account name” in accountflow mappings.
- **`order`** (number, required): Used for ordering in UI.
- **`isDefault`** (boolean, optional)
- **`safetyBuffer`** (number, optional): Used by Analytics forecast.

### AccountflowMapping (cashflow routing rules)
Source: `src/pages/Cashflow.tsx` + `src/services/cashflowCalculationService.ts`.

Union types:

1) **`InflowToAccountMapping`**
- `kind: 'inflowToAccount'`
- `mode: 'group' | 'item'`
- When `mode='group'`: `group` is required
- When `mode='item'`: `inflowItemId` is required
- `account` (string, required): platform name

2) **`AccountToOutflowMapping`**
- `kind: 'accountToOutflow'`
- `mode: 'group' | 'item'`
- When `mode='group'`: `group` is required
- When `mode='item'`: `outflowItemId` is required
- `account` (string, required): platform name

3) **`AccountToAccountMapping`**
- `kind: 'accountToAccount'`
- `fromAccount` (string, required): platform name
- `toAccount` (string, required): platform name
- `amountChf` (number, required): fixed CHF transfer amount

### Spare change
In the forecast logic, “spare change” is defined as:

\[
\text{spareChange} = \text{totalInflowToAccount} - \text{totalOutflowFromAccount}
\]

Source: `src/services/forecastCalculationService.ts` → `getPlatformSpareChangeInflow(...)`.

## Data Sources & Ownership (SSOT)

### UI state ownership
Cashflow page state is owned by `src/pages/Cashflow.tsx`.

### Persistent storage (Firestore)
Collections:

- `users/{uid}/cashflowInflowItems/{id}`
- `users/{uid}/cashflowOutflowItems/{id}`
- `users/{uid}/cashflowAccountflowMappings/{id}`
- `users/{uid}/platforms/{id}`

Source: `src/services/firestoreService.ts`

Writes:

- Per-document upserts use conflict detection (`safeUpsertDoc`) via `save*` functions.
- Bulk save functions exist but are guarded/deprecated and intended only for Import/Reset.

### Local cache / fallback (localStorage)
All cashflow collections are mirrored as uid-scoped localStorage backups via `src/services/storageService.ts`.

Key format:

- Preferred: `capitalos:${uid}:<collectionName>`
- Fallback without uid: `capitalos_<collectionName>_v1`

Collections stored this way include:

- `cashflowInflowItems`
- `cashflowOutflowItems`
- `cashflowAccountflowMappings`
- `platforms`
- `forecastEntries` (used by Analytics; see below)

## User Flows (step-by-step)

### A) Add an inflow item
Source: `src/pages/Cashflow.tsx` (`AddInflowItemModal` submission).

1. User selects an inflow group and clicks “Add Item”.
2. User enters:
   - Item name
   - Amount (> 0)
   - Currency
   - Provider
3. On submit:
   - A new `InflowItem` is created with a generated id.
   - UI updates local state optimistically.
   - Firestore upsert is attempted.

### B) Edit an inflow item
Source: `src/pages/Cashflow.tsx` → edit flow + `saveCashflowInflowItem(..., { clientUpdatedAt })`.

1. User chooses “Edit” from the item menu.
2. UI performs optimistic update.
3. Firestore write is attempted with conflict detection if `updatedAt` is available.
4. On failure, UI does not currently revert automatically.

### C) Remove an inflow/outflow item
Source: `src/pages/Cashflow.tsx` confirms via `window.confirm(...)`.

1. User clicks “Remove”.
2. UI asks confirmation: `Are you sure you want to remove this item?`
3. UI removes it optimistically and attempts Firestore delete with conflict detection.

### D) Create / edit / delete accountflow mappings
Mappings determine how inflows and outflows are attributed to “accounts” (platform names).

Validation errors are set via `setError(...)` in the mapping modal logic (see Validation section).

### E) How Dashboard shows “Monthly Cashflow”
Source: `src/pages/Dashboard.tsx`.

Current behavior:

- `monthlyInflowChf = inflowItems.reduce((sum, item) => sum + item.amountChf, 0)`
- `monthlyOutflowChf = outflowItems.reduce((sum, item) => sum + item.amountChf, 0)`
- `monthlySpareChangeChf = monthlyInflowChf - monthlyOutflowChf`

**Important**:

- Dashboard currently uses `amountChf` directly and does **not** apply `amount`+`currency` conversion.
- Cashflow page totals *do* prefer `amount`+`currency` conversion when present.

This means Dashboard cashflow KPI and Cashflow page totals can diverge if `amountChf` does not match converted `amount`.

## Behavioral Rules (MUST / MUST NOT)

### Item amount sign rules
- Inflow amounts MUST be > 0.
- Outflow amounts MUST be > 0.
- The UI MUST reject zero and negative values for cashflow items.

### Grouping and ordering
- Inflow items MUST belong to exactly one inflow group.
- Outflow items MUST belong to exactly one outflow group.
- Inflow group order MUST be: `Time`, `Service`, `Worker Bees`.
- Outflow group order MUST be: `Fix`, `Variable`, `Shared Variable`, `Investments`.

### Conversion preference
On the Cashflow page:

- If `item.amount` and `item.currency` are present, the displayed value MUST be computed by converting `amount` from `currency` via `CurrencyContext.convert`.
- Otherwise it MUST fall back to `amountChf`.

Sources:

- `src/pages/Cashflow.tsx` (inflow/outflow totals and per-item display)
- `src/services/cashflowCalculationService.ts` (group sums + mapping amounts)

### Spare change definition (forecast)
When computing spare change for a platform (Analytics forecast usage):

- Total inflow to an account MUST equal sum of all mappings that route inflow to that account plus inbound account-to-account mappings.
- Total outflow from an account MUST equal sum of all mappings that route outflow from that account plus outbound account-to-account mappings.
- Spare change MUST equal inflow minus outflow for that account.

Source: `src/services/forecastCalculationService.ts` → `getPlatformSpareChangeInflow`.

## Validation Rules
Source: `src/pages/Cashflow.tsx`.

### Inflow item modal
- Missing name: `Please enter an item name.`
- Invalid amount (NaN/<=0): `Please enter a valid inflow amount greater than 0.`
- Missing provider: `Please enter a provider.`

### Outflow item modal
- Missing name: `Please enter an item name.`
- Invalid amount (NaN/<=0): `Please enter a valid outflow amount greater than 0.`
- Missing receiver: `Please enter a receiver.`

### Mapping creation/edit modal
Mapping validations (exact messages):

- Inflow→Account:
  - group mode: `Please select an inflow group.`
  - item mode: `Please select an inflow item.`
  - missing account: `Target platform is required.`
- Account→Outflow:
  - missing account: `Source platform is required.`
  - group mode: `Please select an outflow group.`
  - item mode: `Please select an outflow item.`
- Account→Account:
  - missing from: `Source platform is required.`
  - missing to: `Please select a target platform.`
  - same from/to: `Source and target platforms must be different.`
  - invalid amount: `Please enter a valid amount greater than 0.`

## Loading States
- Cashflow page loads its lists from `DataContext` (which itself loads from Firestore/storage).
- Per-item writes do not expose a global loading overlay; success/failure is mostly implicit.

## Error Handling & Fallbacks
- Firestore write errors are logged (`console.error`) and return `{ success: false, reason: 'firestore_error' }` from `storageService` wrappers.
- UI generally does not revert optimistic updates on error (status quo).

## Edge Cases

### Mixed legacy + new fields
Many computations support both:

- Legacy `amountChf`
- New `amount` + `currency`

This can lead to inconsistent totals across pages (Dashboard vs Cashflow).

### Platform identity mismatch (id vs name)
Accountflow mappings use `account` as a string that represents a **platform name**.
Analytics forecast functions accept `platformId` but attempt to match by:

- using `platformName || platformId` (best-effort)

Source: `src/services/forecastCalculationService.ts`.

## Persistence (Firestore paths, local cache)

### Firestore
- `users/{uid}/cashflowInflowItems/{id}`
- `users/{uid}/cashflowOutflowItems/{id}`
- `users/{uid}/cashflowAccountflowMappings/{id}`
- `users/{uid}/platforms/{id}`
- `users/{uid}/forecastEntries/{id}` (Analytics “planned entries”)

### localStorage backup keys
- `capitalos:${uid}:cashflowInflowItems` (fallback: `capitalos_cashflowInflowItems_v1`)
- `capitalos:${uid}:cashflowOutflowItems` (fallback: `capitalos_cashflowOutflowItems_v1`)
- `capitalos:${uid}:cashflowAccountflowMappings` (fallback: `capitalos_cashflowAccountflowMappings_v1`)
- `capitalos:${uid}:platforms` (fallback: `capitalos_platforms_v1`)
- `capitalos:${uid}:forecastEntries` (fallback: `capitalos_forecastEntries_v1`)

## Acceptance Criteria (testable)

1. **Cashflow item validation**:
   - Submitting inflow/outflow with amount `0` MUST show the exact validation message.
2. **Monthly spare change**:
   - On Dashboard, spare change MUST equal `sum(inflow.amountChf) - sum(outflow.amountChf)` for the loaded data.
3. **Mapping validation**:
   - Creating an account-to-account mapping with same source/target MUST show `Source and target platforms must be different.`
4. **Optimistic writes**:
   - Adding an inflow item MUST immediately appear in the UI list before Firestore write completes.

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Unify cashflow totals across pages by using `amount`+`currency` conversion everywhere, or by defining `amountChf` as authoritative and ensuring it is always kept in sync.

