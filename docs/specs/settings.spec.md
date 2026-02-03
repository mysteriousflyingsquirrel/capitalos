# Settings Specification

## Scope
This specification defines the **current** Settings behavior:

- Firestore settings schema and exact paths
- Base currency selection and persistence
- Theme selection and persistence
- API keys input, masking behavior, persistence rules
- Platform management (as exposed in Settings)
- Import/export (backup) behavior and overwrite rules
- Snapshot creation triggers (Settings UI integration)
- Conflict handling / autosave semantics

## Definitions (data model / terms)

### User settings document (canonical)
Canonical Firestore document:

- `users/{uid}/settings/user`

Source: `src/lib/dataSafety/userSettingsRepo.ts` (explicitly documented).

Current settings structure:

```ts
{
  baseCurrency: string,
  themeId: string,
  apiKeys: {
    rapidApiKey?: string,
    hyperliquidWalletAddress?: string,
    mexcApiKey?: string,
    mexcSecretKey?: string
  }
}
```

Notes:

- The repository defines these fields as possibly `null` when absent on load.
- Writes must be merge writes (no overwrites).

### API keys
Keys include:

- RapidAPI key (Yahoo Finance)
- Hyperliquid wallet address
- MEXC API key + secret

### Backup format
Source: `src/services/backupService.ts`.

Backup schema version: `2.0.0`

Backup includes:

- net worth items + transactions
- cashflow items + mappings
- platforms
- settings (optional)
- snapshots (optional)

## Data Sources & Ownership (SSOT)

### Settings SSOT module
Settings persistence SSOT:

- `src/lib/dataSafety/userSettingsRepo.ts`

This module defines:

- canonical path
- merge-only writes
- initialization defaults

### UI ownership
Settings UI:

- `src/pages/Settings.tsx`

Theme UI state:

- `src/contexts/ThemeContext.tsx`

API key UI state:

- `src/contexts/ApiKeysContext.tsx`

## User Flows (step-by-step)

### A) Change base currency
Current flow:

1. User selects a base currency in Settings UI.
2. The app persists base currency in Firestore via merge write.
3. CurrencyContext uses the base currency and fetches FX rates.

Persistence:

- `users/{uid}/settings/user` → `baseCurrency`

### B) Change theme
Source: `src/contexts/ThemeContext.tsx`.

1. On uid change, theme resets immediately to `galaxy` (auth boundary reset).
2. Theme is loaded from Firestore.
3. If stored theme is missing, it writes back `galaxy`.
4. If stored theme is unsupported, it migrates to fallback and writes the fallback.
5. When user selects a new theme:
   - Theme is applied optimistically (CSS variables updated)
   - Firestore write is attempted
   - On failure, UI reverts to the previous theme

Persistence:

- `users/{uid}/settings/user` → `themeId`

### C) Enter/update API keys
Source: `src/contexts/ApiKeysContext.tsx` + Settings UI inputs.

1. On uid change, API key state is cleared immediately (auth boundary reset).
2. Keys are loaded from Firestore settings.
3. RapidAPI key also has an env fallback (`VITE_RAPIDAPI_KEY`) when Firestore has none.
4. User edits fields and saves:
   - Keys are trimmed
   - Blank values are removed using Firestore `deleteField()`
   - State is updated after successful write

Persistence:

- `users/{uid}/settings/user` → `apiKeys.<keyName>`

### D) Platform management (Settings)
Settings page includes platform management UI:

- Load platforms list
- Add/edit/delete platform items

Persistence:

- `users/{uid}/platforms/{platformId}`

### E) Export JSON backup
Source: `src/pages/Settings.tsx` → `handleExportJSON()`.

Flow:

1. User triggers export.
2. App calls `createBackup(uid)` to fetch all data.
3. App downloads a JSON file via `downloadBackup(backup)`.

### F) Import JSON backup
Source: `src/pages/Settings.tsx` → `handleImportJSON()`.

Flow:

1. User selects a `.json` file.
2. App validates the backup structure.
3. App prompts for import mode:
   - OK → Merge
   - Cancel → Replace (destructive)
4. Replace mode has an extra confirmation dialog.
5. App calls `restoreBackup(backup, uid, { mode, includeSettings: true })`.
6. App reloads the page after ~1.5s.

Merge vs Replace semantics are defined in `backupService.ts` (see Behavioral Rules).

## Behavioral Rules (MUST / MUST NOT)

### Firestore paths
- Settings MUST be stored only at `users/{uid}/settings/user`.
- API keys MUST be nested under `apiKeys`.

### Merge writes only
Settings writes MUST be merge writes (no document overwrite).

Source:

- `src/lib/dataSafety/userSettingsRepo.ts`
- `src/lib/dataSafety/repository.ts` enforces merge-only for user/system writes in dev mode.

### Deleting keys
- Empty API key inputs MUST delete the corresponding field using Firestore `deleteField()`.

### Import mode semantics
From `backupService.ts`:

- **Merge mode**:
  - Writes backup objects by id with `setDoc(..., { merge: true })`
  - Does not clear existing data first
- **Replace mode**:
  - Calls `clearAllUserData(uid)` first (deletes collections + settings doc)
  - Then writes imported data

### Conflict rules for normal writes
Per-document upserts use conflict-safe helpers:

- `safeUpsertDoc` with `clientUpdatedAt` prevents stale overwrites.

Import/Reset flows bypass conflict checks by using bulk writes with merge semantics and/or explicit overwrite allowance.

## Validation Rules

### Export/import
- Import MUST reject non-conforming JSON with error:
  - `Invalid backup file format. Please ensure the file is a valid Capitalos backup.`
- Import MUST reject offline import:
  - `Cannot import data while offline. Please check your internet connection and try again.`

## Loading States
- Settings uses multiple local loading flags:
  - exportLoading/importLoading
  - apiKeySaving
  - platformLoading
  - creatingSnapshot
  - themeSaving

## Error Handling & Fallbacks
- Theme save failures revert theme.
- API key save failures throw and are surfaced by Settings UI state (error text) and/or console error logs.
- Export/import failures populate `exportError`/`importError`.

## Edge Cases

### Env RapidAPI key fallback
If RapidAPI key is not stored in Firestore, the app may use `VITE_RAPIDAPI_KEY` if provided.
This can lead to “configured” behavior without explicit user settings.

### Settings initialization writes
ThemeContext writes back `themeId='galaxy'` if missing on load. This means simply opening the app can write settings fields.

## Persistence (Firestore paths, local cache)

### Firestore
- Settings: `users/{uid}/settings/user`
- Platforms: `users/{uid}/platforms/{platformId}`

### localStorage
Settings are not stored in localStorage by `userSettingsRepo`.
Some contexts (e.g., incognito) use localStorage separately; see `docs/specs/security-privacy.spec.md`.

## Acceptance Criteria (testable)

1. **Theme persistence**:
   - After changing theme, reloading the app MUST apply the same theme (from Firestore).
2. **API key delete**:
   - Clearing an API key input and saving MUST remove that key from Firestore (field deleted).
3. **Import replace confirmation**:
   - Replace mode MUST show an extra confirmation dialog before performing destructive import.
4. **Replace mode resets data**:
   - After replace import, previously existing net worth/cashflow data not present in backup MUST be deleted.

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Add stable `data-testid` selectors to Settings actions (export/import/theme/api keys/platform management) to support deterministic Playwright testing.

