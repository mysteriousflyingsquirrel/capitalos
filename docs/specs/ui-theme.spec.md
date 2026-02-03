# UI Theme Specification

## Scope
This specification defines the **current** theming system:

- Supported theme IDs and labels
- Exact token list (CSS variables) and palettes (hex codes) as defined in code
- How themes are applied to the DOM
- Persistence rules (Firestore location)
- Constraints: themes change colors only (no layout changes)

## Definitions (data model / terms)

### ThemeId
Source: `src/lib/themes.ts`.

Supported theme IDs:

- `galaxy`
- `emerald`
- `obsidian`
- `dawn`
- `moss`
- `inferno`

### Theme tokens (CSS variables)
Theme tokens are stored as CSS variables on `:root` and are applied as `--<token>`.

Token keys (current list; see palettes below):

- `bg-page`
- `bg-frame`
- `bg-surface-1`
- `bg-surface-2`
- `bg-surface-3`
- `border-subtle`
- `border-strong`
- `text-primary`
- `text-secondary`
- `text-muted`
- `text-disabled`
- `accent-blue`
- `accent-purple`
- `highlight-yellow`
- `highlight-blue`
- `highlight-turquoise`
- `highlight-purple`
- `highlight-pink`
- `success`
- `warning`
- `danger`
- `info`

## Data Sources & Ownership (SSOT)

### SSOT theme definitions
Authoritative theme definitions live in:

- `src/lib/themes.ts` → `THEMES`

### Default theme to avoid flicker
Default CSS variables are defined in:

- `src/index.css` under `:root` (Galaxy palette)

This ensures a stable initial paint before Firestore settings load.

### Theme persistence
Theme ID is persisted in:

- Firestore: `users/{uid}/settings/user` → `themeId`

Source:

- `src/lib/dataSafety/userSettingsRepo.ts`

## User Flows (step-by-step)

### A) App startup theme application
Source: `src/contexts/ThemeContext.tsx`.

1. On uid change, theme resets immediately to `galaxy` to avoid flicker/invalid state.
2. Theme is loaded from Firestore settings.
3. Theme is applied by setting CSS variables on `document.documentElement`.
4. If stored theme is missing or unsupported, the app writes back a valid themeId.

### B) User changes theme in Settings
Source: `src/pages/Settings.tsx` + `ThemeContext`.

1. User selects a theme.
2. Theme is applied optimistically.
3. Theme ID is persisted to Firestore.
4. On failure, theme is reverted.

## Behavioral Rules (MUST / MUST NOT)

### Application of a theme
Applying a theme MUST:

- Set CSS variables `--<token>` for all `theme.colors` entries.
- Set `data-theme` attribute on the root element to the theme ID.

Source: `src/lib/themes.ts` → `applyTheme(theme)`.

### Persistence
- Theme changes MUST persist to `users/{uid}/settings/user.themeId` via merge write.

### Constraints
- Themes MUST change **colors only** (CSS variables); they MUST NOT change layout, typography scale, or component structure.

## Validation Rules
- If an unknown themeId is loaded, the app MUST fall back to `galaxy` and MAY persist the fallback back to Firestore.

Source: `src/contexts/ThemeContext.tsx`.

## Loading States
- While theme settings are loading, the UI uses the default Galaxy variables defined in `src/index.css`.
- ThemeContext exposes `isLoading` and may expose an error string.

## Error Handling & Fallbacks
- Theme load failure:
  - Theme remains Galaxy.
- Theme save failure:
  - Theme reverts to previous theme and error is set in context.

## Edge Cases

### Theme migration
If stored `themeId` is no longer supported:

- The app resolves to the nearest fallback (currently `galaxy` by `getThemeById`)
- It writes the resolved fallback back to Firestore.

## Persistence (Firestore paths, local cache)
- Firestore: `users/{uid}/settings/user.themeId`
- No theme persistence is implemented in localStorage (theme relies on Firestore + default CSS).

## Acceptance Criteria (testable)

1. **Token application**:
   - After selecting a theme, `document.documentElement` MUST have `data-theme="<themeId>"` and CSS variables for all tokens.
2. **Persistence**:
   - Reloading after theme change MUST apply the same theme from Firestore.
3. **Fallback**:
   - If Firestore stores an invalid themeId, app MUST use `galaxy` and persist it back.

## Future Notes (optional, clearly marked as PROPOSAL)
**PROPOSAL**: Add a test hook that exposes current themeId (e.g., `window.__CAPITALOS_THEME__`) for deterministic UI tests.

---

## Palettes (exact hex codes)
All palettes are sourced from `src/lib/themes.ts`.

### Galaxy
- bg-page: `#050A1A`
- bg-frame: `#111827`
- bg-surface-1: `#141C2F`
- bg-surface-2: `#18223A`
- bg-surface-3: `#1D2945`
- border-subtle: `#27314D`
- border-strong: `#344067`
- text-primary: `#E9EDFF`
- text-secondary: `#C7D0F2`
- text-muted: `#8F9AC7`
- text-disabled: `#5E678A`
- accent-blue: `#8F6BFF`
- accent-purple: `#8F6BFF`
- highlight-yellow: `#F6C453`
- highlight-blue: `#5AA2FF`
- highlight-turquoise: `#3FD6C6`
- highlight-purple: `#9A7BFF`
- highlight-pink: `#FF5BC4`
- success: `#32D583`
- warning: `#F6C453`
- danger: `#FF5C5C`
- info: `#5AA2FF`

### Emerald
- bg-page: `#041413`
- bg-frame: `#081F1E`
- bg-surface-1: `#0C2A28`
- bg-surface-2: `#103633`
- bg-surface-3: `#14433E`
- border-subtle: `#1F5A54`
- border-strong: `#2A726A`
- text-primary: `#E9FFFA`
- text-secondary: `#BFEFE5`
- text-muted: `#7FB7AD`
- text-disabled: `#507B75`
- accent-blue: `#2EF2C2`
- accent-purple: `#2EF2C2`
- highlight-yellow: `#F6C453`
- highlight-blue: `#5AA2FF`
- highlight-turquoise: `#2EF2C2`
- highlight-purple: `#8F6BFF`
- highlight-pink: `#FF5BC4`
- success: `#2EF2C2`
- warning: `#F6C453`
- danger: `#FF5C5C`
- info: `#5AA2FF`

### Obsidian
- bg-page: `#0B0D12`
- bg-frame: `#131720`
- bg-surface-1: `#191E2A`
- bg-surface-2: `#202637`
- bg-surface-3: `#28304A`
- border-subtle: `#323A52`
- border-strong: `#3F4A6A`
- text-primary: `#F2F4F8`
- text-secondary: `#D1D6E2`
- text-muted: `#9AA3B8`
- text-disabled: `#69728A`
- accent-blue: `#A7B0C6`
- accent-purple: `#A7B0C6`
- highlight-yellow: `#F6C453`
- highlight-blue: `#7EA6FF`
- highlight-turquoise: `#7FE3D4`
- highlight-purple: `#B7A6FF`
- highlight-pink: `#FF8DD6`
- success: `#7FE3D4`
- warning: `#F6C453`
- danger: `#FF8A8A`
- info: `#7EA6FF`

### Dawn
- bg-page: `#1A120D`
- bg-frame: `#2A1C14`
- bg-surface-1: `#3A261B`
- bg-surface-2: `#4A3123`
- bg-surface-3: `#5B3D2B`
- border-subtle: `#6F4A36`
- border-strong: `#875A41`
- text-primary: `#FFF4EC`
- text-secondary: `#EFD6C3`
- text-muted: `#C4A089`
- text-disabled: `#8F6D59`
- accent-blue: `#FF9A3C`
- accent-purple: `#FF9A3C`
- highlight-yellow: `#FFD166`
- highlight-blue: `#7EA6FF`
- highlight-turquoise: `#7FE3D4`
- highlight-purple: `#B085FF`
- highlight-pink: `#FF8DD6`
- success: `#7FE3D4`
- warning: `#FFD166`
- danger: `#FF8A8A`
- info: `#7EA6FF`

### Moss
- bg-page: `#0F1A14`
- bg-frame: `#1B2A21`
- bg-surface-1: `#26382C`
- bg-surface-2: `#314838`
- bg-surface-3: `#3D5A45`
- border-subtle: `#4E6D56`
- border-strong: `#65896D`
- text-primary: `#F1FFF6`
- text-secondary: `#CDEAD9`
- text-muted: `#96B7A4`
- text-disabled: `#5F7F6C`
- accent-blue: `#7DDC9C`
- accent-purple: `#7DDC9C`
- highlight-yellow: `#E6C453`
- highlight-blue: `#7EA6FF`
- highlight-turquoise: `#7DDC9C`
- highlight-purple: `#9A8BFF`
- highlight-pink: `#FF8DD6`
- success: `#7DDC9C`
- warning: `#E6C453`
- danger: `#FF8A8A`
- info: `#7EA6FF`

### Inferno
- bg-page: `#1A0505`
- bg-frame: `#2A0B0B`
- bg-surface-1: `#3A1212`
- bg-surface-2: `#4A1818`
- bg-surface-3: `#5C1F1F`
- border-subtle: `#6E2A2A`
- border-strong: `#8A3535`
- text-primary: `#FFF0F0`
- text-secondary: `#F2C1C1`
- text-muted: `#B88383`
- text-disabled: `#7A4F4F`
- accent-blue: `#FF3B3B`
- accent-purple: `#FF3B3B`
- highlight-yellow: `#FFD166`
- highlight-blue: `#FF6A6A`
- highlight-turquoise: `#FF8F8F`
- highlight-purple: `#B085FF`
- highlight-pink: `#FF5FA2`
- success: `#3DDC97`
- warning: `#FFD166`
- danger: `#FF3B3B`
- info: `#FF6A6A`

