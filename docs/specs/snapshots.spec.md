# Snapshots Specification

## Scope
This specification defines the **current** net worth snapshot system:

- Manual snapshot creation (Settings page)
- Automatic snapshot creation (GitHub Actions cron)
- Snapshot storage schema in Firestore and localStorage
- Retention / cleanup (if any)
- Failure handling and idempotency behavior
- API contract for `POST /api/snapshot/create`

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

### B) Automatic daily snapshot (GitHub Actions cron)
Source: `.github/workflows/daily-snapshot.yml`.

Current schedule:

- The workflow cron is `17 23 * * *`.
- The file comment says “23:59 UTC” but the cron expression actually triggers at **23:17 UTC**.

Flow:

1. GitHub Actions runs the workflow at the cron time or manually via `workflow_dispatch`.
2. It calls:
   - `POST {VERCEL_URL}/api/snapshot/create`
   - Body: `{ "uid": "<USER_UID>" }`
3. It expects HTTP 200 for success; non-200 fails the job.

## Behavioral Rules (MUST / MUST NOT)

### Uniqueness / idempotency
- There MUST be at most one snapshot per `date` (UTC day key).
- The server endpoint MUST be idempotent per date:
  - If a snapshot document already exists for that date, it returns HTTP 200 success and does **not** overwrite.
  - Source: `api/snapshot/create.ts` checks document existence and “skips creation”.

### Date and timestamp semantics (server endpoint)
Source: `api/snapshot/create.ts`.

- The snapshot `date` MUST be computed in UTC in `YYYY-MM-DD`.
- The snapshot `timestamp` MUST be set to **end-of-day UTC**: 23:59:59.000Z for that date.
- Special case:
  - If the endpoint runs between `00:00` and `00:04` UTC inclusive (`utcHour === 0 && utcMinutes < 5`), it MUST create a snapshot for “yesterday” (end of the previous UTC day).

### Storage semantics
- Firestore snapshot documents MUST be stored under:
  - `users/{uid}/snapshots/{date}`
- Client “bulk save” uses `writeBatch.set` without merge and overwrites the doc with the same date (acceptable because date is the key).

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
- Server endpoint is synchronous; GitHub Actions waits for response.
- Client manual snapshot creation shows local “creating snapshot” state in Settings (see Settings page state variables).

## Error Handling & Fallbacks

### Server endpoint errors
`api/snapshot/create.ts`:

- Non-POST requests return:
  - HTTP 405 JSON `{ error: 'Method not allowed. Use POST.' }`
- Missing/invalid uid returns:
  - HTTP 400 JSON `{ error: 'User ID (uid) is required...' }`
- Unexpected errors return:
  - HTTP 500 JSON `{ success: false, error: <message> }`

### Client persistence fallback
Client `saveSnapshots(...)` attempts Firestore first (if uid exists) and always also writes to localStorage as backup. If Firestore fails it writes to localStorage.

Source: `src/services/snapshotService.ts`.

## Edge Cases

### Cron time vs snapshot end-of-day timestamp
- The cron job may run at 23:17 UTC, but the snapshot timestamp is set to 23:59:59 UTC for the same day (end-of-day semantics).

### Early-UTC safety window
- Calls shortly after midnight UTC (00:00–00:04) create “yesterday” snapshot to avoid missing end-of-day snapshots.

## Persistence (Firestore paths, local cache)

### Firestore
- `users/{uid}/snapshots/{date}`

### localStorage
Client fallback key:

- `capitalos_net_worth_snapshots_v1`

Source: `src/services/snapshotService.ts` (`SNAPSHOTS_STORAGE_KEY`).

## Acceptance Criteria (testable)

1. **API method guard**:
   - `GET /api/snapshot/create` MUST return HTTP 405.
2. **UID required**:
   - `POST /api/snapshot/create` without uid MUST return HTTP 400.
3. **Idempotency**:
   - Calling `POST /api/snapshot/create` twice for the same day MUST return success both times and MUST NOT change the stored snapshot on the second call.
4. **End-of-day timestamp**:
   - A created snapshot’s `timestamp` MUST equal 23:59:59 UTC for `snapshot.date` (with the special midnight window exception).

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Add deterministic cleanup/retention and expose snapshot creation results in the Settings UI (including “already exists” outcome).

