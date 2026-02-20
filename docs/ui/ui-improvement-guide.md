# UI/UX Improvement Guide

## Goal
Improve UI/UX while preserving existing product intent and text.
Optimize for clarity, trust, and usability.

## Non-negotiables
- Do not change business logic unless explicitly requested.
- Do not remove functionality.
- Do not rewrite copy unless explicitly requested.
- Accessibility is mandatory: labels, errors, keyboard focus, contrast.

## Process
1) Identify the primary user goal on the screen.
2) Remove friction: fewer steps, clearer CTAs, better defaults.
3) Strengthen hierarchy: title -> sections -> controls -> help text.
4) Improve spacing: consistent padding, aligned grids, readable line length.
5) Strengthen states: loading, empty, error, success.
6) Verify responsiveness: mobile first, then desktop.

## Output requirements
When applying this guide, provide:
- A short diagnosis (3-6 bullets)
- Specific UI changes (component-level)
- Edge cases + states to add
- Any new components extracted

## UI patterns (preferred)
- One primary CTA per screen
- Secondary actions as links or ghost buttons
- Inline validation + error summaries for forms
- Keep forms short; use progressive disclosure for advanced options

## Capitalos-specific conventions
- Dark-mode-first design with gold/amber accent palette
- CHF as base currency, formatted as `CHF 1'000.00`
- Tailwind CSS utility classes for all styling
- CSS custom properties for theme tokens (see `docs/ui/ui-theme.md`)
- Category structure: Title → Separator → Content
- Subcategory structure: Framed card with Title → Separator → Content
- TotalText component for colored numerical values (green positive, red negative)
