# Snapshots Specification

## Scope
This specification defines the **current** net worth snapshot system:

- Manual snapshot creation (Settings page)
- Automatic snapshot creation (Vercel Cron)
- Snapshot storage schema in Firestore and localStorage
- Retention / cleanup (if any)
- Failure handling and idempotency behavior
- API contract for `/api/snapshot/create`

## Definitions (data model / terms)

### NetWorthSnapshot (client-side type)
Source: `src/services/snapshotService.ts`.

Fields:

- **`date`** (string): ISO date string `YYYY-MM-DD`
- **`timestamp`** (number): Unix timestamp in milliseconds
- **`categories`** (`Record<NetWorthCategory, number>`): category totals
- **`total`** (number): total net worth

### Snapshot document id
Snapshots are stored in Firestore with document id equal to `snapshot.date`.

Source: `src/services/firestoreService.ts` → `saveSnapshotsFirestore` comment + implementation.

## Data Sources & Ownership (SSOT)

### SSOT for snapshot computation
Snapshots MUST use the same valuation logic as the primary net worth SSOT:

- `lib/netWorthCalculation.ts` → `NetWorthCalculationService.calculateTotals(...)`

Client manual snapshot creation uses:

- `src/services/snapshotService.ts` → `createSnapshot(...)`

Server cron snapshot creation uses:

- `api/snapshot/create.ts`

## User Flows (step-by-step)

### A) Manual snapshot creation (Settings)
Sources:

- `src/pages/Settings.tsx` (UI)
- `src/services/snapshotService.ts` (compute/save helpers)

Flow:

1. User navigates to Settings.
2. User triggers snapshot creation via the Settings UI (exact button wiring is in Settings page code).
3. The client computes a snapshot using:
   - Net worth items + transactions from current app state
   - Crypto prices, stock prices
   - `convert(...)` and `usdToChfRate`
4. The snapshot is appended to the snapshots list and persisted using `saveSnapshots(...)`.
5. `hasSnapshotForDate(...)` is used to prevent duplicates.

### B) Automatic daily snapshot (Vercel Cron)
Source: `vercel.json` (cron config) + `api/snapshot/create.ts` (handler).

Schedule: `17 23 * * *` (23:17 UTC daily).

Flow:

1. Vercel Cron sends a `GET` request to `/api/snapshot/create` with `Authorization: Bearer <CRON_SECRET>`.
2. The handler verifies the `CRON_SECRET` from the `Authorization` header.
3. The handler discovers all users via `admin.auth().listUsers()`.
4. For each user, it creates a snapshot (skipping if one already exists for that date).
5. Returns `{ success: true, results: [{ uid, date, status }] }` — no financial data in the response.

## Authentication

### GET (Vercel Cron)
- Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` where `CRON_SECRET` is a Vercel environment variable.
- The handler verifies this token matches `process.env.CRON_SECRET`.
- Users are discovered automatically from Firebase Auth — no uid needs to be passed in the request.

### POST (Authenticated user)
- Requires a Firebase ID token via `Authorization: Bearer <firebase-id-token>`.
- The uid is extracted from the verified token (callers cannot spoof another user's uid).

## Behavioral Rules (MUST / MUST NOT)

### Uniqueness / idempotency
- There MUST be at most one snapshot per user per `date` (UTC day key).
- The server endpoint MUST be idempotent per date:
  - If a snapshot document already exists for that date, it returns HTTP 200 success and does **not** overwrite.
  - Source: `api/snapshot/create.ts` checks document existence and "skips creation".

### Date and timestamp semantics (server endpoint)
Source: `api/snapshot/create.ts`.

- The snapshot `date` MUST be computed in UTC in `YYYY-MM-DD`.
- The snapshot `timestamp` MUST be set to **end-of-day UTC**: 23:59:59.000Z for that date.
- Special case:
  - If the endpoint runs between `00:00` and `00:04` UTC inclusive (`utcHour === 0 && utcMinutes < 5`), it MUST create a snapshot for "yesterday" (end of the previous UTC day).

### Storage semantics
- Firestore snapshot documents MUST be stored under:
  - `users/{uid}/snapshots/{date}`
- Client "bulk save" uses `writeBatch.set` without merge and overwrites the doc with the same date (acceptable because date is the key).

### Response data
- **GET (cron):** MUST NOT include financial data (categories, totals) in the response. Returns only `{ uid, date, status }` per user.
- **POST (authenticated user):** Returns `{ success, message, snapshot: { date } }`.

### Retention / cleanup
**Current behavior unclear**

- There is no retention/cleanup policy implemented in the visible snapshot code paths.

Involved code:

- `src/services/snapshotService.ts`
- `src/services/firestoreService.ts` → `saveSnapshotsFirestore`
- `api/snapshot/create.ts`

**PROPOSAL**

- Add a deterministic retention rule, e.g. keep daily snapshots for N days and/or keep monthly rollups.

## Validation Rules
- Snapshot `date` MUST be `YYYY-MM-DD`.
- Snapshot `timestamp` MUST be a finite number in ms.

## Loading States
- Server endpoint is synchronous; Vercel Cron waits for response (up to `maxDuration: 60` seconds).
- Client manual snapshot creation shows local "creating snapshot" state in Settings (see Settings page state variables).

## Error Handling & Fallbacks

### Server endpoint errors
`api/snapshot/create.ts`:

- Non-GET/POST requests return:
  - HTTP 405 JSON `{ error: 'Method not allowed. Use GET (cron) or POST (authenticated).' }`
- Invalid cron secret (GET without valid CRON_SECRET) returns:
  - HTTP 401 JSON `{ error: 'Invalid cron secret.' }`
- Invalid/missing Firebase token (POST) returns:
  - HTTP 401 JSON `{ error: 'Missing or invalid Authorization header.' }`
- Per-user errors during cron are caught individually and included in the results array with `status: 'error'`.
- Unexpected errors return:
  - HTTP 500 JSON `{ success: false, error: <message> }`

### Client persistence fallback
Client `saveSnapshots(...)` attempts Firestore first (if uid exists) and always also writes to localStorage as backup. If Firestore fails it writes to localStorage.

Source: `src/services/snapshotService.ts`.

## Edge Cases

### Cron time vs snapshot end-of-day timestamp
- The cron job runs at 23:17 UTC, but the snapshot timestamp is set to 23:59:59 UTC for the same day (end-of-day semantics).

### Early-UTC safety window
- Calls shortly after midnight UTC (00:00–00:04) create "yesterday" snapshot to avoid missing end-of-day snapshots.

### Multi-user cron execution
- The cron handler iterates over all Firebase Auth users sequentially. Each user's snapshot creation is independent — a failure for one user does not block others.

## Persistence (Firestore paths, local cache)

### Firestore
- `users/{uid}/snapshots/{date}`

### localStorage
Client fallback key:

- `capitalos_net_worth_snapshots_v1`

Source: `src/services/snapshotService.ts` (`SNAPSHOTS_STORAGE_KEY`).

## Environment Variables (Vercel)

- `CRON_SECRET` — Required. Vercel uses this automatically for cron job authentication. Must be set in Vercel project settings.
- `FIREBASE_SERVICE_ACCOUNT` — Required. Firebase Admin SDK service account JSON for Firestore and Auth access.

## Acceptance Criteria (testable)

1. **API method guard**:
   - `PUT /api/snapshot/create` (or any method other than GET/POST) MUST return HTTP 405.
2. **Cron auth**:
   - `GET /api/snapshot/create` without valid `CRON_SECRET` MUST return HTTP 401.
   - `GET /api/snapshot/create` with valid `CRON_SECRET` MUST create snapshots for all registered users.
3. **User auth**:
   - `POST /api/snapshot/create` without valid Firebase token MUST return HTTP 401.
   - `POST /api/snapshot/create` with valid Firebase token MUST create a snapshot for the authenticated user only.
4. **Idempotency**:
   - Creating a snapshot twice for the same day MUST return success both times and MUST NOT change the stored snapshot on the second call.
5. **End-of-day timestamp**:
   - A created snapshot's `timestamp` MUST equal 23:59:59 UTC for `snapshot.date` (with the special midnight window exception).
6. **No financial data in cron response**:
   - `GET` response MUST NOT contain `categories` or `total` fields.

## Shared Libraries

The snapshot handler calls external APIs directly (no internal HTTP roundtrips), ensuring cron snapshots include full data regardless of auth context:

- `lib/hyperliquidApi.ts` → `fetchHyperliquidAccountEquity(walletAddress)` — calls Hyperliquid API directly for account equity across all DEXs.
- `lib/mexcApi.ts` → `fetchMexcAccountEquityUsd(apiKey, secretKey)` — calls MEXC contract API directly for futures account equity.
- `lib/yahooFinance.ts` → `fetchStockPrices(symbols)` — calls Yahoo Finance directly for stock/index/commodity prices.
- `lib/cryptoCompare.ts` → `fetchCryptoData(tickers)` — calls CryptoCompare for crypto prices (pre-existing shared lib).

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Add deterministic cleanup/retention and expose snapshot creation results in the Settings UI (including "already exists" outcome).
