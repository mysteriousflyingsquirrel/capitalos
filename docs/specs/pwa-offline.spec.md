# PWA & Offline Specification

## Scope
This specification defines the **current** PWA and offline capabilities of Capitalos:

- PWA manifest configuration
- Service worker registration behavior (as configured)
- Offline behavior boundaries (read-only constraints)
- Caching behavior (as far as determinable from repo)

## Definitions (data model / terms)

### PWA
The app uses `vite-plugin-pwa` to generate a service worker and manifest.

### Offline / read-only
The app has an explicit “offline — read-only” behavior enforced for writes by the repository wrapper.

## Data Sources & Ownership (SSOT)

### PWA build configuration SSOT
- `vite.config.js` → `VitePWA(...)` plugin configuration

### Write-blocking SSOT (offline)
- `src/lib/dataSafety/repository.ts` → `safeWrite(...)` and `safeDelete(...)`

## User Flows (step-by-step)

### A) Installing the PWA
Behavior is provided by the browser when the manifest and service worker are present.
The manifest defines:

- name: `Capitalos`
- display: `standalone`
- theme/background: `#050A1A`
- icons: `capitalos_logo.png` (192 and 512)

Source: `vite.config.js`.

### B) Going offline
1. Browser becomes offline.
2. Sync status provider marks `online=false` (implementation in `syncStatus.tsx`).
3. UI may show an “Offline — Read-only” badge (AuthGateUI).
4. Any write attempt via repository wrappers throws an error and must not proceed.

## Behavioral Rules (MUST / MUST NOT)

### Offline writes
- When offline, the app MUST NOT perform Firestore writes.
- Write attempts MUST throw:
  - `Cannot write: App is offline (read-only mode)`
- Delete attempts MUST throw:
  - `Cannot delete: App is offline (read-only mode)`

Source: `src/lib/dataSafety/repository.ts`.

### PWA registration
`vite-plugin-pwa` is configured with:

- `registerType: 'autoUpdate'`

Meaning:

- The service worker must attempt to update automatically (plugin behavior).

## Validation Rules
None.

## Loading States
No dedicated offline loading UI exists beyond the sync status indicator and write-blocking errors.

## Error Handling & Fallbacks

### Offline reads
**Current behavior unclear**

- The repository wrappers explicitly block writes when offline, but reads may still occur depending on Firestore SDK cache behavior.
- This repo does not explicitly configure Firestore offline persistence behavior in the visible code excerpts.

Involved code:

- `src/services/firestoreService.ts` (reads)
- `src/services/storageService.ts` (localStorage fallback)
- Firebase config: `src/config/firebase.ts`

**PROPOSAL**

- Document and enforce a deterministic offline read strategy:
  - Prefer localStorage backup data when offline
  - Disable Firestore listeners/reads when offline (or handle failures explicitly)

### Service worker caching
**Current behavior unclear**

- `vite-plugin-pwa` default caching strategy depends on plugin defaults (Workbox).
- This repo does not specify custom Workbox runtime caching rules.

Therefore:

- Which routes/assets are cached and available offline is not deterministic from repo code alone.

## Edge Cases
- Because `registerType` is `autoUpdate`, an updated SW may be installed and activated depending on plugin defaults; exact timing is not specified here.

## Persistence (Firestore paths, local cache)
- Offline mode makes writes read-only; localStorage backups exist for many collections (see `storageService.ts`) and can act as fallback when Firestore is unreachable.

## Acceptance Criteria (testable)

1. **Write blocking**:
   - When `navigator.onLine === false`, attempting to save any setting via `safeWrite` MUST throw and no network write should occur.
2. **Manifest presence**:
   - The built app MUST expose a manifest consistent with `vite.config.js` values (name, icons, theme_color).

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Add explicit runtime caching rules for:

- The app shell (HTML/CSS/JS)
- Static assets (icons)
- Optional: read-only cached API responses for market data (careful with staleness)

