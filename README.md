# Capitalos

A unified wealth management web application that tracks total net worth, cashflow (inflows and outflows), and asset allocations across multiple asset classes and platforms.

## Current core features

- **Dashboard**: Total net worth (CHF + USD), Performance (Daily/Weekly/Monthly/YTD PnL), Monthly Cashflow (inflow, outflow, spare change), Net Worth Evolution chart, Asset Allocation pie chart.
- **Net Worth**: Categories (Cash, Bank Accounts, Retirement Funds, Index Funds, Stocks, Commodities, Crypto, Perpetuals, Real Estate, Depreciating Assets); items and transactions; live or refreshed prices for Crypto, Index Funds, Stocks, Commodities.
- **Cashflow**: Inflow and outflow items; accountflow (platform) mappings; monthly flow visualization.
- **Analytics**: Forecast entries (inflow/outflow), platform safety buffer, forecast charts.
- **Hyperliquid**: Performance PnL, Positions, Open Orders (with optional WebSocket).
- **MEXC**: Equity, positions, open orders, performance.
- **Settings**: Account management, API keys (RapidAPI, Hyperliquid, MEXC), platforms, data import/export, theme, incognito toggle.
- **Auth**: Login via Firebase; no unauthenticated access to user data.
- **Snapshots**: Net worth snapshots by date; used for PnL and evolution charts. Server-side snapshot API: `POST /api/snapshot/create`.

## Tech stack

- **Frontend**: React 18, Vite, TailwindCSS, React Router, Recharts. PWA (Vite PWA plugin).
- **Backend / API**: Vercel serverless functions (e.g. `api/snapshot/create`, `api/perpetuals/*`).
- **Data**: Firebase (Firestore + Auth). Optional localStorage backup/sync.
- **Market data**: CryptoCompare (crypto), Yahoo Finance via RapidAPI (stocks/index funds/commodities), exchange-api (FX). Cached; 5-minute refresh.

## Data sources / exchanges integrated

- **Market data**: CryptoCompare, Yahoo Finance (RapidAPI), fawazahmed0/exchange-api (FX).
- **Perpetuals**: Hyperliquid (API + optional WebSocket), MEXC Futures (API + optional WebSocket).

## Development status

Active development. Build: `npm run build`. Dev: `npm run dev`.

## Authoritative scope

**Scope, requirements, and rules for development (including AI-assisted work) are defined in [docs/requirements.md](docs/requirements.md).** Any new feature or change must align with that document.

## License

Private project.
