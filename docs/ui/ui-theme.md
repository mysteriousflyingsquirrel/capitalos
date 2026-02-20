# Capitalos UI Theme

> Placeholder — to be expanded as the design system matures.

## Approach

Capitalos uses **Tailwind CSS** with **CSS custom properties** for theming. The theme is managed by `ThemeContext` in `src/contexts/`.

## Design Principles

- **Dark-mode first**: the default and primary theme is dark
- **Gold/amber accent palette**: primary accent color is gold/amber
- **High contrast**: text and interactive elements must be clearly visible against dark backgrounds
- **Consistent spacing**: use Tailwind spacing scale consistently

## Token Categories

| Category | Examples | Source |
|---|---|---|
| Colors | `--color-bg`, `--color-text`, `--color-accent` | CSS custom properties in theme context |
| Borders | `border-border-strong`, `border-border-subtle` | Tailwind config + CSS vars |
| Typography | `text-text-muted`, `text-text-primary` | Tailwind config + CSS vars |
| Semantic colors | `text-inflow` (green), `text-outflow` (red) | Tailwind config |
| Radii | `rounded-card`, `rounded-input` | Tailwind config |

## Inline Color Overrides

For guaranteed color application (e.g., in table cells where Tailwind classes may be overridden), use the `TotalText` component which applies inline styles:
- Inflow (positive): `#2ECC71`
- Outflow (negative): `#E74C3C`
- Neutral (zero): inherits default text color

## Extending the Theme

When adding new tokens:
1. Define the CSS custom property in the theme stylesheet
2. Add the Tailwind mapping in `tailwind.config.js`
3. Update `ThemeContext` if the token needs runtime switching
4. Document the token in this file
