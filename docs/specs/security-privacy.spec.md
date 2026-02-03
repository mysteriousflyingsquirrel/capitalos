# Security & Privacy Specification

## Scope
This specification defines the **current** security and privacy behavior:

- Authentication requirements and flow
- Firestore rules expectations (as implemented)
- API key handling (storage, masking, logging)
- Incognito mode behavior (masking rules)
- Offline/safe-mode write blocking

## Definitions (data model / terms)

### Auth
Authentication is handled by Firebase Auth and is required to read/write user data.

### API keys
Sensitive inputs stored in Firestore settings:

- RapidAPI key
- MEXC API key + secret

Hyperliquid uses wallet address (not a secret, but still treated as configuration).

### Incognito
An app mode that masks displayed numbers with `****`.

## Data Sources & Ownership (SSOT)

### Authentication gate SSOT
- `src/lib/dataSafety/authGate.tsx`

### Firestore access policy (rules)
- `firestore.rules`

### Sensitive settings SSOT
- `src/lib/dataSafety/userSettingsRepo.ts`

### Incognito SSOT
- `src/contexts/IncognitoContext.tsx`
- `src/lib/currency.ts` (incognito-aware formatting)
- `src/lib/incognito.ts` (mask helpers)

## User Flows (step-by-step)

### A) Sign in
Source: `src/lib/dataSafety/authGate.tsx` and `src/config/firebase.ts` (provider config).

- Users sign in via Google auth (popup or redirect depending on platform logic).

### B) Access Firestore data
- User-scoped data is read/written under `users/{uid}/...`.
- AuthGate performs user initialization and then data loading occurs (DataContext).

### C) Toggle incognito
Source: `src/components/IncognitoToggle.tsx` + `IncognitoContext`.

1. User toggles incognito.
2. State is persisted to localStorage.
3. Currency formatting uses `incognito` option to mask.

## Behavioral Rules (MUST / MUST NOT)

### Authentication
- User data reads and writes MUST require an authenticated user.
- Unauthenticated users MUST NOT be able to read/write `users/{userId}` documents in Firestore.

### Firestore rules (current)
Source: `firestore.rules`.

- Reads/writes to `users/{userId}/**` MUST be allowed only if:
  - `request.auth != null` AND `request.auth.uid == userId`

### API keys storage
- API keys MUST be stored only in Firestore settings document:
  - `users/{uid}/settings/user` → `apiKeys`
- Settings writes MUST be merge writes (do not overwrite the whole doc).

### API keys logging
**Current behavior**:

- App logs some diagnostic flags (e.g., “hasHyperliquidKey”) but does not intentionally print secrets.
  - Source: `src/contexts/ApiKeysContext.tsx` and `src/contexts/DataContext.tsx`

**Current behavior unclear**:

- There is no explicit centralized “no-plaintext logging” enforcement beyond developer discipline.

### UI masking of API keys
Source: `src/pages/Settings.tsx`.

- API key fields support show/hide toggles (`showRapidApiKey`, etc.).
- When hidden, field SHOULD use password-style masking (current implementation uses conditional rendering; exact input type should be verified in Settings UI code beyond the initial excerpt).

If behavior is ambiguous, tests MUST treat masking as “best-effort” and rely on the show/hide toggles.

### Incognito behavior
Source: `src/lib/currency.ts` and `src/contexts/IncognitoContext.tsx`.

- When incognito is enabled:
  - `formatMoney(...)` MUST return `****`
  - `formatNumber(...)` MUST return `****`
  - UI should not reveal actual numeric amounts.

### Offline and safe-mode write blocking
Source: `src/lib/dataSafety/repository.ts`.

- When offline (`syncStatus.online === false`), writes MUST be blocked with an error.
- When safe mode (`syncStatus.safeMode === true`), writes MUST be blocked with an error.

## Validation Rules
- None beyond auth gating and Firestore rules.

## Loading States
- AuthGateUI shows “Offline — Read-only” badge when offline.
- AuthGateUI shows “Safe Mode” badge when safe mode/quota exceeded.

## Error Handling & Fallbacks

### Quota exceeded
If Firestore quota is exceeded:

- App enters safe mode
- Writes are blocked
- UI shows quota exceeded screen

Source: `src/components/AuthGateUI.tsx`, `src/lib/dataSafety/quotaDetection.ts`, `repository.ts`.

## Edge Cases

### Incognito persistence
- Incognito state is stored in localStorage only:
  - key: `capitalos_incognito_v1`
- It is not user-scoped (not keyed by uid) and not stored in Firestore.

### Multi-device
- Conflict-safe writes for certain collections exist (safeUpsertDoc), but security model still relies on Firestore rules for access control.

## Persistence (Firestore paths, local cache)

### Firestore
- `users/{uid}/settings/user` (apiKeys, baseCurrency, themeId)
- User data collections under `users/{uid}/...` (net worth, cashflow, etc.)

### localStorage
- Incognito: `capitalos_incognito_v1`
- Exchange rates cache: `capitalos_exchange_rates_v1`

## Acceptance Criteria (testable)

1. **Auth required**:
   - When signed out, navigating to an authenticated route MUST show Login (no data rendered).
2. **Incognito masks currency**:
   - With incognito enabled, any `formatMoney`-rendered values MUST display `****`.
3. **Offline blocks writes**:
   - When browser is offline, attempting to save a setting MUST fail with an error and not write to Firestore.

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Add an explicit “no sensitive logging” lint rule and audit logging calls to ensure API key values never appear in logs.

