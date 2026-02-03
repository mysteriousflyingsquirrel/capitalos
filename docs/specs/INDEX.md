# Specs Index

This directory contains **Layer‑2 deterministic specifications** describing the current behavior of Capitalos. These files are intended to remove ambiguity for future development (human or AI) and for UI testing (e.g., Playwright).

## Specs

- `transactions.spec.md`: Net Worth transaction model, allowed number formats, create/edit/delete flows, validation messages, persistence, and conflict semantics.
- `net-worth.spec.md`: Net worth categories, item/holding derivation from transactions, category/total computation rules, currency conversion order, and missing-price fallbacks.
- `cashflow.spec.md`: Cashflow inflow/outflow models, accountflow mapping semantics, monthly rollups (Dashboard vs Cashflow), spare-change logic, and persistence.
- `market-data.spec.md`: FX/crypto/stock market data sources, caching and refresh behavior, rate limiting, error handling, and snapshot-consistency caveats.
- `valuation-engine.spec.md`: Valuation SSOT entry points (legacy vs new engine), step ordering, conversion order, and which pages/flows actually consume which engine today.
- `snapshots.spec.md`: Manual vs automated snapshot creation, cron timing and UTC rules, Firestore schema, idempotency, and `/api/snapshot/create` contract.
- `exchanges-hyperliquid.spec.md`: Hyperliquid REST vs WS scope, “Price” column definition (markPx), performance windows, open orders fields, and error/reconnect behavior.
- `exchanges-mexc.spec.md`: MEXC required credentials, REST/WS sources and refresh scope, normalization rules (contract sizing and vol scaling), performance windows, and edge cases.
- `settings.spec.md`: Canonical Firestore settings paths, baseCurrency/theme/apiKeys persistence rules, import/export behavior, overwrite rules, and autosave/conflict semantics.
- `ui-theme.spec.md`: Supported theme IDs, full token list, exact palettes (hex codes), DOM application rules, and persistence behavior.
- `loading-ui.spec.md`: When loading UI appears/disappears, what “loaded” means, random message rotation timing, and slow/failure behaviors.
- `security-privacy.spec.md`: Auth requirements, Firestore rules expectations, API key handling/masking/logging constraints, incognito masking rules, and offline write blocking.
- `pwa-offline.spec.md`: Current PWA manifest/config, service worker registration settings, and offline/read-only boundaries (with “current behavior unclear” where appropriate).

