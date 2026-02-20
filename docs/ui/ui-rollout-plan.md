# UI Rollout Plan

Apply Capitalos UI conventions consistently across existing code.
No business logic changes.

## Targets

* **Toasts:** bottom-right, success 3s auto-dismiss, error 5s manual dismiss
* **Dates:** dd.mm.yyyy, time HH:mm only when relevant
* **Currency:** CHF 1'000.00 (prefix + space + 2 decimals), secondary currencies shown only when different from base
* **Tables:** actions column rightmost, row click for detail view
* **Forms:** single column, required *, validation summary at bottom, Cancel left, primary right (explicit label)
* **Layout:** header title left + primary action top-right, dark theme with gold accents
* **Categories:** Title → Separator → Content, with TotalText values in header
* **Subcategories:** Framed inner card, Title → Separator → Content
* **Add Item buttons:** Icon + "Add Item" label, bottom-aligned in header flex containers

## Order of Work

1. Shared UI primitives (TotalText, buttons, table components, form components)
2. Dashboard page
3. Net Worth page
4. Cashflow page
5. Analytics page
6. Exchange pages (Hyperliquid, Mexc)
7. Settings & Login pages

## Done Definition

* No duplicated formatting logic in pages
* Components enforce the UI rules by default
* Consistent category/subcategory structure across all pages
* Currency coloring applied via TotalText component everywhere
