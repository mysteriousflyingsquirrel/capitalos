# Loading UI Specification

## Scope
This specification defines:

- When the loading screen appears/disappears
- What “loaded” means in the current app
- Random message rotation behavior and timing
- Behavior on slow/failed fetches
- Safe-mode / quota-exceeded error UI

Primary sources:

- `src/components/AuthGateUI.tsx`
- `src/lib/dataSafety/authGate.tsx`
- `src/App.jsx`
- `src/lib/dataSafety/syncStatus.tsx` (global sync flags)
- `src/lib/dataSafety/repository.ts` (offline/safe-mode write blocking)

## Definitions (data model / terms)

### AuthGateState
Source: `src/lib/dataSafety/authGate.tsx`.

- `AUTH_LOADING`
- `SIGNED_OUT`
- `INITIALIZING_USER`
- `SUBSCRIBING`
- `READY`
- `ERROR_QUOTA_EXCEEDED`
- `ERROR_FATAL`

### “Loaded”
In the current app, “loaded” means:

- AuthGate has reached `READY`, OR it times out waiting for data and transitions to `READY` anyway.
- DataContext has set a global flag `window.__CAPITALOS_SYNC_STATUS__.hasInitialDataLoaded` (AuthGate polls this while `SUBSCRIBING`).

## Data Sources & Ownership (SSOT)

### AuthGate state machine
SSOT auth/loading gate:

- `src/lib/dataSafety/authGate.tsx`

### Loading UI component
SSOT loading UI:

- `src/components/AuthGateUI.tsx`

### Routing integration
The loading UI is displayed by `ProtectedRoutes`:

- `src/App.jsx`

## User Flows (step-by-step)

### A) App startup (signed out)
1. AuthGate starts in `AUTH_LOADING`.
2. Auth listener runs and determines no user.
3. AuthGate transitions to `SIGNED_OUT`.
4. `ProtectedRoutes` renders `<Login />`.
5. `AuthGateUI` returns `null` for `SIGNED_OUT`.

### B) App startup (signed in)
1. AuthGate transitions through:
   - `AUTH_LOADING` → `INITIALIZING_USER` → `SUBSCRIBING`
2. While `SUBSCRIBING`, AuthGate polls for data readiness every 200ms.
3. When global sync status indicates `hasInitialDataLoaded`, AuthGate transitions to `READY`.
4. `ProtectedRoutes` renders the main `<Layout>` routes.

### C) Quota exceeded / safe mode
1. AuthGate detects quota error or safe mode is set in sync status.
2. `AuthGateUI` renders the “Firebase Quota Exceeded” screen.
3. Retry is disabled while offline.

### D) Fatal auth/init error
1. AuthGate transitions to `ERROR_FATAL`.
2. `AuthGateUI` renders the “Connection Error” screen with error details and Retry/Sign Out buttons.

## Behavioral Rules (MUST / MUST NOT)

### When the loading screen appears
`AuthGateUI` MUST render the loading screen when `state` is any of:

- `AUTH_LOADING`
- `INITIALIZING_USER`
- `SUBSCRIBING`

Source: `src/components/AuthGateUI.tsx`.

Additionally, `ProtectedRoutes` MUST render `AuthGateUI` whenever:

- `authGateState` is not `READY` and not `SIGNED_OUT`

Source: `src/App.jsx`.

### When the loading screen disappears
The loading UI MUST disappear when:

- AuthGate state is `READY` (and user exists), OR
- AuthGate state is `SIGNED_OUT` (Login is shown elsewhere), OR
- AuthGate is in an error state and error UI is shown instead of loading.

### Random message rotation
Source: `src/components/AuthGateUI.tsx`.

Rules:

- The loading UI MUST initialize with a random message from `FUNNY_LOADING_MESSAGES`.
- While loading, it MUST update the message every **1700ms**.
- The selection is uniform random based on `Math.random()` and can repeat.

### Initialization timeouts
Source: `src/lib/dataSafety/authGate.tsx`.

- If initialization stays in `INITIALIZING_USER` or `SUBSCRIBING` for more than 15 seconds, AuthGate MUST transition to `ERROR_FATAL` with message `Initialization timeout: Having trouble connecting to Firebase`.
- While `SUBSCRIBING`, if data readiness is not observed within 30 seconds, AuthGate MUST transition to `READY` anyway (best-effort).

## Validation Rules
No user-input validation is relevant for loading UI.

## Loading States
The app distinguishes:

- Auth/loading transitions (AuthGate states)
- Initial data load completion (`hasInitialDataLoaded` polled)

## Error Handling & Fallbacks

### Quota exceeded
If quota exceeded is detected:

- App MUST enter safe mode.
- UI MUST show the quota exceeded screen.

### Offline behavior
When offline:

- Retry buttons in error UI MUST be disabled.
- Writes are blocked by `safeWrite` / `safeDelete` in `src/lib/dataSafety/repository.ts` with explicit errors:
  - `Cannot write: App is offline (read-only mode)`

## Edge Cases

### Message timing mismatch
Comment in code says “every 1 second” but actual interval is 1700ms.
This spec treats **1700ms as authoritative**.

### Flicker avoidance
`ProtectedRoutes` shows `AuthGateUI` for `SUBSCRIBING` until data load is complete, to avoid flicker.

## Persistence (Firestore paths, local cache)
Loading UI does not persist state.

## Acceptance Criteria (testable)

1. **Loading shows during SUBSCRIBING**:
   - When AuthGate is `SUBSCRIBING`, the loading UI MUST be visible and main routes MUST NOT render.
2. **Message rotation**:
   - While loading persists > 2 seconds, the displayed message MUST change at least once (with 1700ms interval).
3. **Quota screen**:
   - When safe mode/quota exceeded is set, UI MUST show “Firebase Quota Exceeded” and a Sign Out button.
4. **Timeout to READY**:
   - If `hasInitialDataLoaded` never becomes true, app MUST still reach READY within ~30 seconds after subscribing.

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Add deterministic test hooks:

- Expose current AuthGateState on `window.__CAPITALOS_AUTH_GATE_STATE__`
- Expose current loading message index to avoid flaky message tests

