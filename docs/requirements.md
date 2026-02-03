# Capitalos – Requirements & Scope

## 1. Product Vision

Capitalos is a unified wealth management web application. It tracks total net worth, cashflow (inflows and outflows), asset allocations, and performance across multiple asset classes and platforms. The product shall provide a single dashboard for users to view and manage their financial data with live or periodically refreshed market data where applicable.

## 2. Target Users

- **Primary**: Individuals who want to track net worth and cashflow in one place.
- **Scope**: Users who hold or track Cash, Bank Accounts, Retirement Funds, Index Funds, Stocks, Commodities, Crypto, Perpetuals (e.g. Hyperliquid, MEXC), Real Estate, and Depreciating Assets.
- **Authentication**: Users must authenticate (Firebase Auth). The application shall not support unauthenticated access to personal data.

## 3. Core Principles

- **Single Source of Truth (SSOT)**: Market data (FX, crypto, stocks/ETFs/commodities) shall be fetched and cached in dedicated services only. Valuation shall be computed by one central engine. UI and snapshots shall consume the same valuation result.
- **User data isolation**: Each user shall access only their own data. Firestore rules and application logic shall enforce this.
- **No speculative features**: Features, UI elements, services, or data flows not defined in this document shall not be implemented unless first added to this document and approved.
- **Deterministic Layer-2 specs**: Detailed, deterministic specifications for current behavior live in `docs/specs/*.spec.md` (see `docs/specs/INDEX.md`). If code behavior is ambiguous, the relevant spec must mark it as “Current behavior unclear” and, if needed, include a clearly labeled **PROPOSAL**.

## 4. In-Scope Features

- **Dashboard**: Total net worth (CHF + USD), Performance (Daily/Weekly/Monthly/YTD PnL), Monthly Cashflow (inflow, outflow, spare change), Net Worth Evolution chart, Asset Allocation pie chart, category breakdowns.
- **Net Worth**: Categories (Cash, Bank Accounts, Retirement Funds, Index Funds, Stocks, Commodities, Crypto, Perpetuals, Real Estate, Depreciating Assets). Per-category items with transactions; holdings and balances derived from transactions; live or refreshed prices for Crypto, Index Funds, Stocks, Commodities.
- **Cashflow**: Inflow items, Outflow items, Accountflow (platform) mappings. Monthly flow visualization and calculations.
- **Analytics**: Forecast entries (inflow/outflow), platform safety buffer, forecast charts. Holdings by platform and asset; profit/loss summary where data exists.
- **Perpetuals**: Hyperliquid page (Performance PnL boxes, Positions table, Open Orders). MEXC page (equity, positions, open orders, performance). Data from APIs and optional WebSocket for live positions.
- **Settings**: Account management, API keys (RapidAPI, Hyperliquid wallet, MEXC API/Secret), platforms list, data import/export (backup), theme, incognito toggle. Link to obtain RapidAPI key for Yahoo Finance.
- **Auth**: Login (Firebase). Logout. No unauthenticated access to user data.
- **Snapshots**: Create and store net worth snapshots (by date); used for PnL and Net Worth Evolution. Snapshot API: POST `/api/snapshot/create` with `uid` (body or query); creates snapshot in CHF with category breakdown; requires Firebase service account in env; optional RapidAPI key for stock prices.
- **Tax**: Crypto tax report generation (modal and service); PDF export where implemented.
- **PWA**: Progressive Web App support (Vite PWA plugin); offline capability as provided by current implementation.

## 5. Explicitly Out-of-Scope Features

- **Not in scope unless added here**: Social features, multi-user shared portfolios, banking integrations (open banking), automated transaction import from banks, brokerage integrations, real-time streaming prices for all assets, native mobile apps, public or unauthenticated dashboards, features not listed in Section 4.
- **No speculative work**: Implementations that are not explicitly required by this document or by an approved change to it shall not be added.

## 6. Functional Requirements

- **FR-1** The application shall allow authenticated users to create, read, update, and delete net worth items and transactions per category.
- **FR-2** The application shall allow authenticated users to create, read, update, and delete cashflow inflow items, outflow items, and accountflow mappings.
- **FR-3** The application shall allow authenticated users to create, read, update, and delete forecast entries and to set platform safety buffer in Analytics.
- **FR-4** The application shall allow authenticated users to manage platforms (add, edit, remove, set default) in Settings.
- **FR-5** The application shall persist user data to Firestore with optional localStorage backup/sync as implemented in storageService.
- **FR-6** The application shall fetch and cache crypto prices (CryptoCompare), stock/index/commodity prices (Yahoo Finance via RapidAPI), and FX rates (exchange-api with defined fallback). Refresh shall occur on a defined interval (e.g. 5 minutes) and on manual refresh where exposed.
- **FR-7** The application shall compute net worth and category totals using a single valuation engine and the same market data snapshot for UI and for snapshot creation.
- **FR-8** The application shall support optional API keys (RapidAPI, Hyperliquid wallet, MEXC) for market and perpetuals data; behavior when keys are missing shall be defined (e.g. fallback or hide features).
- **FR-9** The application shall support creation of net worth snapshots (server-side via API or client-side) and storage in Firestore under the user's snapshots collection.
- **FR-10** The application shall enforce per-item (or per-document) explicit save/delete for user-initiated changes to cashflow, forecast, and platform data; bulk overwrite shall only be used for import/reset with an explicit flag (e.g. allowBulkOverwrite).

## 7. Non-Functional Requirements

- **NFR-1** The application shall be a client-side React application (Vite) with optional serverless API routes (e.g. Vercel) for snapshot creation and cron.
- **NFR-2** Market data shall be cached with a TTL (e.g. 5 minutes); concurrent requests for the same key shall be deduplicated (inflight deduplication).
- **NFR-3** Stock/market price requests shall respect rate limiting (e.g. minimum interval between requests) to avoid API quota issues.
- **NFR-4** The application shall support a configurable base currency and display values in base currency and optionally USD where implemented.

## 8. Data & Single Source of Truth (SSOT)

- **User data**: Stored in Firestore under `users/{uid}/` (e.g. netWorthItems, transactions, snapshots, cashflow collections, platforms, forecastEntries). localStorage may be used as backup or cache; Firestore is the authoritative persistence for synced data.
- **Market data**: FX rates shall be fetched only from the defined exchange-api (with jsdelivr and pages.dev fallback). Crypto prices shall be fetched only from CryptoCompare. Stock/ETF/commodity prices shall be fetched only from Yahoo Finance (RapidAPI). All such fetches shall occur only in the designated market-data services (e.g. FxRateService, CryptoPriceService, MarketPriceService). A compatibility layer may expose legacy function names that delegate to these services.
- **Valuation**: A single valuation engine (e.g. ValuationEngine) shall compute net worth and category totals using the market data services. Dashboard, Net Worth, and snapshot creation shall use this engine or its output (e.g. ValuationResult); there shall not be duplicate calculation paths for the same metrics.
- **Snapshots**: Snapshot creation shall use the same valuation logic as the UI (e.g. createSnapshotFromValuation or equivalent). Snapshots are stored with date as document id; category totals and total in CHF shall be stored.

## 9. Exchange & Market Data Rules

- **FX**: Must use fawazahmed0/exchange-api. Primary URL and fallback URL (e.g. jsdelivr CDN, then currency-api.pages.dev) shall be defined in the FX service. No other FX provider shall be used for the main conversion path.
- **Crypto**: Must use CryptoCompare only for crypto price data. No other crypto price API shall be used for the main path.
- **Stocks / Index Funds / Commodities**: Must use Yahoo Finance via RapidAPI (apidojo-yahoo-finance) only. Rate limiting (e.g. 1 request per second) shall be applied. No other stock/ETF/commodity price API shall be used for the main path.
- **Perpetuals**: Hyperliquid and MEXC data shall be fetched via the implemented API and optional WebSocket clients. API keys (Hyperliquid wallet address, MEXC API key/secret) shall be stored per user and used only for that user's data.

## 10. UI / UX Principles

- **Theme**: The application uses a dark theme (e.g. primary background #050A1A). Accent colors (e.g. bronze/gold) and typography (e.g. Inter) shall follow the existing design system.
- **Responsiveness**: Layout shall adapt to mobile and desktop; frame order on mobile (e.g. Dashboard: Total Net Worth, then Performance, then Monthly Cashflow) may differ from desktop as implemented.
- **Incognito**: An incognito mode may hide or mask sensitive numeric values; behavior shall be consistent where implemented.
- **Accessibility**: Existing patterns (e.g. semantic structure, labels) shall be preserved; new UI shall not reduce accessibility.

## 11. Security & Privacy

- **Auth**: Firebase Authentication shall be used. Only authenticated users shall read or write their own data.
- **Firestore**: Security rules shall restrict access to `users/{userId}/` so that each user can read/write only their own subcollections. Unauthenticated users shall not access any user data.
- **API keys**: User-provided API keys (RapidAPI, MEXC) shall be stored in user-scoped storage (e.g. Firestore or secure settings). They shall not be exposed to other users or in client-side code beyond what is necessary for API calls.
- **Snapshot API**: The snapshot creation endpoint shall require a valid user identifier (uid). Production deployments shall secure this endpoint (e.g. API key, rate limiting, IP restriction) as configured; the application code shall not hardcode secrets.

## 12. Performance & Scalability

- **Caching**: Market data shall be cached with TTL to reduce external API calls. Cache keys and TTL shall be defined in the market-data layer.
- **Refresh interval**: Periodic refresh of market data and valuation (e.g. every 5 minutes) shall be configurable or fixed as implemented; it shall not cause unbounded growth of memory or requests.
- **Bundle**: Build output shall remain deployable; large dependencies shall be justified by in-scope features.

## 13. Error Handling & Resilience

- **Market data failures**: If crypto or stock price fetch fails, the application shall fall back to transaction-based or last-known values where implemented, and shall not crash the UI.
- **Firestore errors**: Permission or network errors shall be surfaced to the user where appropriate (e.g. toast or message); optimistic updates may be reverted on failure.
- **API routes**: Snapshot API shall return appropriate HTTP status and JSON error messages (e.g. 400 for missing uid, 500 for server errors). Errors shall be logged; sensitive data shall not be echoed in responses.

## 14. Testing & Quality Gates

- **Build**: The project shall build successfully with `npm run build`. TypeScript and Vite shall not report errors for the main application code.
- **Lint**: The project may run ESLint; existing lint configuration shall be preserved. New code shall follow the same rules where applicable.
- **No regression**: Changes shall not remove or break in-scope functionality without an explicit change to this document.

## 15. AI Development Rules (Cursor / Claude Code)

- **Authority**: This document (docs/requirements.md) is the authoritative scope document. Any feature, UI element, service, or data flow must be explicitly in scope (Section 4, 6, 8, 9) or added via Section 16 before implementation.
- **No speculative features**: Do not implement features, refactors, or “improvements” that are not required by this document or by an approved change request. If a request is ambiguous, ask for clarification or a document update.
- **Preserve behavior**: Do not change runtime behavior, remove in-scope functionality, or refactor for style unless the task explicitly requests it and it is within scope.
- **Documentation over code**: When in doubt, prefer updating or proposing changes to docs/requirements.md rather than adding undocumented behavior in code.
- **Deletions**: Do not delete or rename README.md. Do not delete in-scope services or pages unless the task and this document explicitly require it.

## 16. Change & Scope Management

- **Adding scope**: New features, new pages, new integrations, or new data flows shall be added to this document (e.g. Section 4 and relevant Sections 6–9) before implementation. The change shall be described in a way that future developers and AI agents can enforce.
- **Removing scope**: Removing an in-scope feature shall be reflected in this document first; then code may be removed or deprecated.
- **Authority rule**: If it is not defined here, do not implement it.

## Exchanges – Hyperliquid

### Funding Health Indicator (Hyperliquid)

1) New top frame:

- Add a new frame at the TOP of the Hyperliquid page named: "Dashboard"
- It appears ABOVE the existing frames: Performance, Positions, Open Orders.
- Purpose: comment the "health" of each open position using funding rate and open interest.

2) Dashboard frame rendering:

- Render one line PER open Hyperliquid perp position.
- Each line MUST contain ONLY:
  - A colored dot (green/orange/red) at the beginning
  - One sentence (exactly one sentence, no extra stats)
- No tooltips, no hover behavior, no secondary text.
- Default sorting: highest risk first (RED, then ORANGE, then GREEN).

3) Dashboard health messages (exact strings):

- GREEN: "Funding favors your {TICKER} position. No pressure."
- ORANGE: "Funding is mildly against your {TICKER} position. Stay alert."
- RED: "High funding pressure on {TICKER}. Consider de-risking or SL in profit."
- UNKNOWN (missing data): "Funding data unavailable for {TICKER}."

Note: UNKNOWN uses "-" in table (see below). Dot can be neutral/gray if the doc supports it, otherwise just "neutral dot".

4) Positions table additions:

- Add column: "Funding Signal" (shows the dot or "-" if unavailable)
- Add column: "Funding Rate" (raw signed percent value or "-" if unavailable)
- Add column: "Open Interest" (market open interest for the asset, or "-" if unavailable)
- Missing/unavailable data MUST be shown as "-" (dash). Do not show blank or 0.

5) Scope / Non-goals:

- Hyperliquid only (no Kraken/MEXC/Aster yet).
- No bot alerts / no automation in this requirement.
- No tooltips, no drill-down details.

6) Open interest in the formula:

- The funding health signal MAY take open interest (OI) into account: when the funding-only signal would be ORANGE and market open interest for that asset is "elevated" (above a defined threshold), the displayed signal SHALL be RED (one step worse). Otherwise the signal is based on funding (and side) only.
- Open interest is per-asset market OI from the same data source as funding (e.g. Hyperliquid metaAndAssetCtxs). If OI is missing, the formula uses funding (and side) only.

**Acceptance Criteria:**

- Dashboard frame exists above Performance/Positions/Open Orders.
- Dashboard shows one line per open position with ONLY dot + one sentence.
- No tooltips for this feature.
- Positions table has Funding Signal, Funding Rate, and Open Interest columns.
- When funding-only signal is ORANGE and OI is elevated, displayed signal is RED.
- Missing values show "-" and rendering never crashes.
