import React, { useState, useMemo, FormEvent, useRef, useEffect } from 'react'
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { useIncognito } from '../contexts/IncognitoContext'
import { useApiKeys } from '../contexts/ApiKeysContext'
import { formatMoney, formatNumber } from '../lib/currency'
import { formatDate, formatDateInput, parseDateInput, getCurrentDateFormatted } from '../lib/dateFormat'
import type { CurrencyCode } from '../lib/currency'
import { fetchCryptoData, fetchCryptoPrices } from '../services/cryptoCompareService'
import { fetchStockPrices } from '../services/yahooFinanceService'
import { useData } from '../contexts/DataContext'
import { NetWorthCalculationService } from '../services/netWorthCalculationService'
import { calculateBalanceChf, calculateCoinAmount, calculateHoldings, calculateAveragePricePerItem } from '../services/balanceCalculationService'
import {
  saveNetWorthItem,
  deleteNetWorthItem,
  loadNetWorthItems,
  saveNetWorthTransaction,
  deleteNetWorthTransaction,
  loadNetWorthTransactions,
  loadPlatforms,
  type Platform,
} from '../services/storageService'

// TypeScript types
export type NetWorthCategory =
  | 'Cash'
  | 'Bank Accounts'
  | 'Retirement Funds'
  | 'Index Funds'
  | 'Stocks'
  | 'Commodities'
  | 'Crypto'
  | 'Perpetuals'
  | 'Real Estate'
  | 'Depreciating Assets'

// Perpetuals subcategory types
export interface PerpetualsOpenPosition {
  id: string
  ticker: string
  margin: number // in quote currency (USD/USDT)
  pnl: number // in quote currency (USD/USDT)
  platform: string
  leverage?: number | null // leverage (e.g., 1 for 1x)
  positionSide?: 'LONG' | 'SHORT' | null // position direction
  // Additional fields for Hyperliquid positions
  amountToken?: number | null // token amount (absolute value of szi)
  entryPrice?: number | null // entry price
  liquidationPrice?: number | null // liquidation price
  fundingFeeUsd?: number | null // total funding fee in USD (cumFunding.sinceOpen)
}

export interface ExchangeBalance {
  id: string
  item: string
  holdings: number
  platform: string
}

export interface PerpetualsOpenOrder {
  id: string
  token: string // coin symbol
  activity: string // Limit, Stop, Limit Stop, etc.
  side: 'Buy' | 'Sell' // normalized from "B"/"A"
  price: number // display price (numeric)
  priceDisplay: string // formatted price (e.g., "87000" or "85000 → 87000")
  size: number // USD notional
  amount: number // token amount
  platform: string // "Hyperliquid"
}

export interface PortfolioPnL {
  pnl24hUsd: number | null
  pnl7dUsd: number | null
  pnl30dUsd: number | null
  pnl90dUsd: number | null
}

export interface PerpetualsData {
  exchangeBalance: ExchangeBalance[]
  openPositions: PerpetualsOpenPosition[]
  openOrders: PerpetualsOpenOrder[]
  portfolioPnL?: PortfolioPnL
}

export interface NetWorthItem {
  id: string
  category: NetWorthCategory
  name: string
  platform: string
  currency: string
  monthlyDepreciationChf?: number // Only for Depreciating Assets category
  perpetualsData?: PerpetualsData // Only for Perpetuals category
}

type TransactionSide = 'buy' | 'sell'
// Crypto-only transaction types
export type CryptoTransactionType = 'BUY' | 'SELL' | 'ADJUSTMENT'

export interface NetWorthTransaction {
  id: string
  itemId: string
  side: TransactionSide // Required for backward compatibility and non-Crypto items
  currency: string
  amount: number
  pricePerItemChf: number // Kept for backward compatibility, but will be calculated from pricePerItem and currency
  pricePerItem?: number // Original price per item in original currency (optional for backward compatibility)
  date: string
  // Transaction type fields (used for supported categories)
  cryptoType?: CryptoTransactionType // If set, overrides 'side' for supported categories
  adjustmentReason?: string // Optional reason/note for all transaction types
}

// Empty data - user will add their own data
const mockNetWorthItems: NetWorthItem[] = []

// Empty data for Perpetuals category (populated from exchange integrations)
const defaultPerpetualsData: PerpetualsData = {
  exchangeBalance: [
    {
      id: 'exchange-balance-total-equity',
      item: 'Total equity',
      holdings: 10000,
      platform: 'MEXC',
    },
  ],
  openPositions: [],
}

const initialMockTransactions: NetWorthTransaction[] = []

// Category order
const categoryOrder: NetWorthCategory[] = [
  'Cash',
  'Bank Accounts',
  'Retirement Funds',
  'Index Funds',
  'Stocks',
  'Commodities',
  'Crypto',
  'Perpetuals',
  'Real Estate',
  'Depreciating Assets',
]

// Helper function to format CHF
// formatChf will be replaced with currency-aware formatting in the component

// Calculation functions moved to balanceCalculationService.ts

// Helper component: NetWorthCategorySection
interface NetWorthCategorySectionProps {
  category: NetWorthCategory
  items: NetWorthItem[]
  transactions: NetWorthTransaction[]
  cryptoPrices?: Record<string, number>
  stockPrices?: Record<string, number>
  usdToChfRate?: number | null
  platforms: Platform[]
  onAddClick: () => void
  onAddTransaction: (itemId: string) => void
  onShowMenu: (itemId: string, buttonElement: HTMLButtonElement) => void
  onRemoveItem: (itemId: string) => void
  onShowTransactions: (itemId: string) => void
  onEditItem: (itemId: string) => void
}

// Helper function to format coin amount
function formatCoinAmount(amount: number, isIncognito: boolean = false): string {
  if (isIncognito) return '****'
  // Format with up to 8 decimal places, removing trailing zeros
  return amount.toFixed(8).replace(/\.?0+$/, '')
}

function NetWorthCategorySection({
  category,
  items,
  transactions,
  cryptoPrices = {},
  stockPrices = {},
  usdToChfRate = null,
  platforms,
  onAddClick,
  onAddTransaction,
  onShowMenu,
  onRemoveItem,
  onShowTransactions,
  onEditItem,
}: NetWorthCategorySectionProps) {
  const { baseCurrency, convert, exchangeRates } = useCurrency()
  const { isIncognito } = useIncognito()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch', { incognito: isIncognito })
  const formatUsd = (value: number) => formatMoney(value, 'USD', 'ch', { incognito: isIncognito })
  
  // Calculate subtotal - Crypto always in USD, others use baseCurrency
  const subtotal = items.reduce((sum, item) => {
    if (category === 'Crypto') {
      // For Crypto: coin amount * current price (always in USD)
      const coinAmount = calculateCoinAmount(item.id, transactions)
      const ticker = item.name.trim().toUpperCase()
      const currentPriceUsd = cryptoPrices[ticker] || 0
      if (currentPriceUsd > 0) {
        // Crypto is always USD, no conversion
        return sum + (coinAmount * currentPriceUsd)
      }
      // Fallback to transaction-based if price not available
      // For crypto fallback, calculateBalanceChf returns USD (not CHF!)
      const balanceUsd = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
      // balanceUsd is already in USD, so use it directly for the subtotal
      return sum + (isNaN(balanceUsd) || !isFinite(balanceUsd) ? 0 : balanceUsd)
    }
    if (category === 'Perpetuals') {
      // For Perpetuals: calculate only from Exchange Balance
      if (!item.perpetualsData) return sum
      const { exchangeBalance } = item.perpetualsData
      
      // Sum all CHF balances directly (matching what's displayed in tables)
      let totalChf = 0
      
      // Exchange Balance: convert each holdings to CHF and sum
      if (exchangeBalance) {
        exchangeBalance.forEach(balance => {
          const balanceChf = usdToChfRate && usdToChfRate > 0 
            ? balance.holdings * usdToChfRate 
            : convert(balance.holdings, 'USD')
          totalChf += balanceChf
        })
      }
      
      return sum + (isNaN(totalChf) || !isFinite(totalChf) ? 0 : totalChf)
    }
    // For non-Crypto, calculateBalanceChf already returns CHF (converts from original currency internally)
    const balanceChf = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
    return sum + (isNaN(balanceChf) || !isFinite(balanceChf) ? 0 : balanceChf)
  }, 0)
  
  // For Crypto, also calculate the subtotal in baseCurrency
  // For non-Crypto, subtotal is already in baseCurrency
  // Use usdToChfRate (from CryptoCompare) to match Dashboard calculation, fallback to convert if not available
  const subtotalInBaseCurrency = category === 'Crypto' 
    ? (usdToChfRate && usdToChfRate > 0 ? subtotal * usdToChfRate : convert(subtotal, 'USD'))
    : (category === 'Perpetuals'
      ? subtotal  // subtotal is already in CHF for Perpetuals
      : subtotal)
  
  // Calculate USD value for all categories
  // For Crypto, subtotal is already in USD
  // For non-Crypto, convert from baseCurrency (CHF) to USD using exchange rate
  const subtotalInUsd = category === 'Crypto' 
    ? subtotal 
    : (category === 'Perpetuals'
      ? (usdToChfRate && usdToChfRate > 0 ? subtotal / usdToChfRate : (subtotal / (exchangeRates?.rates['USD'] || 1)))
      : (subtotal * (exchangeRates?.rates['USD'] || 1)))

  return (
    <div className="bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6 overflow-hidden">
      <div className="mb-6 pb-4 border-b border-border-strong">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Heading level={2}>{category}</Heading>
                  <TotalText variant={subtotalInBaseCurrency >= 0 ? 'inflow' : 'outflow'} className="block mt-1">
                    {formatCurrency(subtotalInBaseCurrency)}
                  </TotalText>
                  <TotalText variant={subtotalInUsd >= 0 ? 'inflow' : 'outflow'} className="block mt-1">
                    {formatUsd(subtotalInUsd)}
            </TotalText>
          </div>
          {category !== 'Perpetuals' && (
            <button
              onClick={onAddClick}
              className="py-2 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg flex items-center justify-center gap-2 group"
            >
              <svg
                className="w-4 h-4 transition-transform group-hover:rotate-90"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>Add Item</span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 w-full">
        {/* Perpetuals category: render three subcategory tables */}
        {category === 'Perpetuals' ? (
          (() => {
            const perpetualsItems = items.filter(item => item.category === 'Perpetuals')
            if (perpetualsItems.length === 0) {
              return (
                <div className="text-center text-text-muted text-[0.567rem] md:text-xs py-4">
                  No Perpetuals data available. Please configure your API credentials in Settings.
                </div>
              )
            }
            
            return (
              <div className="space-y-6">
                {/* Account Equity Table (one row per exchange) */}
                <div>
                  <Heading level={3} className="mb-3 text-text-secondary">Account Equity</Heading>
                  <div className="w-full overflow-hidden">
                    <style>{`
                      @media (max-width: 767px) {
                        .perp-table-item-col { width: calc((100% - 55px) * 4 / 6) !important; }
                        .perp-table-balance-col { width: calc((100% - 55px) * 1 / 6 - 5px) !important; }
                        .perp-table-actions-col { width: 55px !important; }
                        .perp-table-balance-cell { padding-right: 0.25rem !important; }
                      }
                      @media (min-width: 768px) {
                        .perp-table-item-col { width: calc((100% - 85px) * 5 / 7) !important; }
                        .perp-table-balance-col { width: calc((100% - 85px) * 1 / 7 - 5px) !important; }
                        .perp-table-actions-col { width: 85px !important; }
                      }
                    `}</style>
                    <table className="w-full border-separate" style={{ tableLayout: 'fixed', width: '100%', borderSpacing: '0 6px' }}>
                      <colgroup>
                        <col className="perp-table-item-col" />
                        <col className="perp-table-balance-col" />
                        <col className="perp-table-actions-col" />
                      </colgroup>
                      <tbody>
                        {perpetualsItems.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-4 text-center text-text-muted text-[0.567rem] md:text-xs">
                              No account equity data
                            </td>
                          </tr>
                        ) : (
                          perpetualsItems.map((perpetualsItem) => {
                            const exchangeName = perpetualsItem.platform || perpetualsItem.name || 'Perpetuals'
                            const exchangeBalance = perpetualsItem.perpetualsData?.exchangeBalance
                            const holdingsUsd = Array.isArray(exchangeBalance)
                              ? exchangeBalance.reduce((sum, b) => sum + (typeof b?.holdings === 'number' ? b.holdings : 0), 0)
                              : 0
                            const balanceChf = usdToChfRate && usdToChfRate > 0
                              ? holdingsUsd * usdToChfRate
                              : convert(holdingsUsd, 'USD')

                            return (
                              <tr key={perpetualsItem.id}>
                                <td colSpan={3} className="p-0 align-top">
                                  <div className="flex items-stretch bg-bg-surface-1 border border-border-subtle rounded-input overflow-hidden p-[10px]">
                                    <div className="flex-1 min-w-0 pr-2">
                                      <div className="text-[0.882rem] truncate">{perpetualsItem.name || exchangeName}</div>
                                      <div className="text-text-muted text-[0.68rem] md:text-[0.774rem] truncate">{perpetualsItem.platform || exchangeName}</div>
                                    </div>
                                    <div className="flex-1 min-w-0 text-right px-2 perp-table-balance-cell">
                                      <div className="text-[0.882rem] whitespace-nowrap">{formatCurrency(balanceChf)}</div>
                                      <div className="text-text-muted text-[0.68rem] md:text-[0.774rem] whitespace-nowrap">{formatNumber(holdingsUsd, 'ch', { incognito: isIncognito })}</div>
                                    </div>
                                    <div className="flex-shrink-0 w-3" aria-hidden="true" />
                                    <div className="flex-shrink-0 w-px self-stretch bg-border-subtle" aria-hidden="true" />
                                    <div className="flex-shrink-0 w-3" aria-hidden="true" />
                                    <div className="flex-shrink-0 w-14" aria-hidden="true" />
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )
          })()
        ) : (
          /* Regular table structure for other categories */
          <div className="w-full overflow-hidden">
          <style>{`
            @media (max-width: 767px) {
              .nw-table-item-col { width: calc((100% - 55px) * 4 / 6) !important; }
              .nw-table-balance-col { width: calc((100% - 55px) * 1 / 6 - 5px) !important; }
              .nw-table-actions-col { width: 55px !important; }
              .nw-table-balance-cell { padding-right: 0.25rem !important; }
            }
            @media (min-width: 768px) {
              .nw-table-item-col { width: calc((100% - 85px) * 5 / 7) !important; }
              .nw-table-balance-col { width: calc((100% - 85px) * 1 / 7 - 5px) !important; }
              .nw-table-actions-col { width: 85px !important; }
            }
          `}</style>
          <table className="w-full border-separate" style={{ tableLayout: 'fixed', width: '100%', borderSpacing: '0 6px' }}>
            <colgroup>
              <col className="nw-table-item-col" />
              <col className="nw-table-balance-col" />
              <col className="nw-table-actions-col" />
            </colgroup>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-text-muted text-[0.567rem] md:text-xs">
                    No items yet. Click "Add Item" to get started.
                  </td>
                </tr>
              ) : (
                // Sort items by balance (high to low) - all categories converted to CHF
                [...items].sort((a, b) => {
                  // Calculate balance for item a - always convert to CHF
                  let balanceA: number
                  if (category === 'Crypto') {
                    const coinAmountA = calculateCoinAmount(a.id, transactions)
                    const tickerA = a.name.trim().toUpperCase()
                    const currentPriceUsdA = cryptoPrices[tickerA] || 0
                    if (currentPriceUsdA > 0 && usdToChfRate !== null && usdToChfRate > 0) {
                      // Crypto: valueUSD = holdings * currentPriceUSD, valueCHF = valueUSD * usdToChfRate
                      const valueUsd = coinAmountA * currentPriceUsdA
                      balanceA = valueUsd * usdToChfRate
                    } else {
                      // Fallback: use transaction-based calculation or CurrencyContext convert
                      balanceA = convert(calculateBalanceChf(a.id, transactions, a, cryptoPrices, convert), 'CHF')
                    }
                  } else if (category === 'Index Funds' || category === 'Stocks' || category === 'Commodities') {
                    const holdingsA = calculateHoldings(a.id, transactions)
                    const tickerA = a.name.trim().toUpperCase()
                    const currentPriceUsdA = stockPrices[tickerA] || 0
                    if (currentPriceUsdA > 0 && usdToChfRate !== null && usdToChfRate > 0) {
                      // valueUSD = holdings * currentPriceUSD, valueCHF = valueUSD * usdToChfRate
                      const valueUsd = holdingsA * currentPriceUsdA
                      balanceA = valueUsd * usdToChfRate
                    } else {
                      // Fallback: use transaction-based calculation
                      balanceA = convert(calculateBalanceChf(a.id, transactions, a, cryptoPrices, convert), 'CHF')
                    }
                  } else {
                    balanceA = convert(calculateBalanceChf(a.id, transactions, a, cryptoPrices, convert), 'CHF')
                  }

                  // Calculate balance for item b - always convert to CHF
                  let balanceB: number
                  if (category === 'Crypto') {
                    const coinAmountB = calculateCoinAmount(b.id, transactions)
                    const tickerB = b.name.trim().toUpperCase()
                    const currentPriceUsdB = cryptoPrices[tickerB] || 0
                    if (currentPriceUsdB > 0 && usdToChfRate !== null && usdToChfRate > 0) {
                      // Crypto: valueUSD = holdings * currentPriceUSD, valueCHF = valueUSD * usdToChfRate
                      const valueUsd = coinAmountB * currentPriceUsdB
                      balanceB = valueUsd * usdToChfRate
                    } else {
                      // Fallback: use transaction-based calculation or CurrencyContext convert
                      balanceB = convert(calculateBalanceChf(b.id, transactions, b, cryptoPrices, convert), 'CHF')
                    }
                  } else if (category === 'Index Funds' || category === 'Stocks' || category === 'Commodities') {
                    const holdingsB = calculateHoldings(b.id, transactions)
                    const tickerB = b.name.trim().toUpperCase()
                    const currentPriceUsdB = stockPrices[tickerB] || 0
                    if (currentPriceUsdB > 0 && usdToChfRate !== null && usdToChfRate > 0) {
                      // valueUSD = holdings * currentPriceUSD, valueCHF = valueUSD * usdToChfRate
                      const valueUsd = holdingsB * currentPriceUsdB
                      balanceB = valueUsd * usdToChfRate
                    } else {
                      // Fallback: use transaction-based calculation
                      balanceB = convert(calculateBalanceChf(b.id, transactions, b, cryptoPrices, convert), 'CHF')
                    }
                  } else {
                    balanceB = convert(calculateBalanceChf(b.id, transactions, b, cryptoPrices, convert), 'CHF')
                  }

                  // Sort high to low
                  return balanceB - balanceA
                }).map((item) => {
                  // For all categories, calculate holdings
                  const holdings = calculateHoldings(item.id, transactions)
                  
                  // Calculate balance - always convert to CHF for display
                  let balanceConverted: number
                  if (category === 'Crypto') {
                    const coinAmount = calculateCoinAmount(item.id, transactions)
                    const ticker = item.name.trim().toUpperCase()
                    const currentPriceUsd = cryptoPrices[ticker] || 0
                    if (currentPriceUsd > 0 && usdToChfRate !== null && usdToChfRate > 0) {
                      // Crypto: valueUSD = holdings * currentPriceUSD, valueCHF = valueUSD * usdToChfRate
                      const valueUsd = coinAmount * currentPriceUsd
                      balanceConverted = valueUsd * usdToChfRate
                    } else {
                      // Fallback: use transaction-based calculation or CurrencyContext convert
                      balanceConverted = convert(calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert), 'CHF')
                    }
                  } else if (category === 'Index Funds' || category === 'Stocks' || category === 'Commodities') {
                    // For Index Funds, Stocks, and Commodities: use current price from Yahoo Finance
                    const holdings = calculateHoldings(item.id, transactions)
                    const ticker = item.name.trim().toUpperCase()
                    const currentPriceUsd = stockPrices[ticker] || 0
                    if (currentPriceUsd > 0 && usdToChfRate !== null && usdToChfRate > 0) {
                      // valueUSD = holdings * currentPriceUSD, valueCHF = valueUSD * usdToChfRate
                      const valueUsd = holdings * currentPriceUsd
                      balanceConverted = valueUsd * usdToChfRate
                    } else {
                      // Fallback: use transaction-based calculation
                      balanceConverted = convert(calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert), 'CHF')
                    }
                  } else {
                    // For all other categories, calculate balance from transactions and convert to CHF
                    balanceConverted = convert(calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert), 'CHF')
                  }
                  
                  return (
                    <tr key={item.id}>
                      <td colSpan={3} className="p-0 align-top">
                        <div className="flex items-stretch bg-bg-surface-1 border border-border-subtle rounded-input overflow-hidden p-[10px]">
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="text-[0.882rem] truncate">{item.name}</div>
                            <div className="text-text-muted text-[0.68rem] md:text-[0.774rem] truncate flex items-center gap-1">
                              <span>{item.platform}</span>
                              {platforms.length > 0 && !platforms.some(p => p.name === item.platform) && (
                                <svg className="w-3.5 h-3.5 text-warning flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <title>Platform has been removed. Please update this item.</title>
                                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 text-right px-2 nw-table-balance-cell">
                            <div className="text-[0.882rem] whitespace-nowrap">{formatCurrency(balanceConverted)}</div>
                            <div className="text-text-muted text-[0.68rem] md:text-[0.774rem] whitespace-nowrap">{formatCoinAmount(holdings, isIncognito)}</div>
                          </div>
                          <div className="flex-shrink-0 w-3" aria-hidden="true" />
                          <div className="flex-shrink-0 w-px self-stretch bg-border-subtle" aria-hidden="true" />
                          <div className="flex-shrink-0 w-3" aria-hidden="true" />
                          <div className="flex-shrink-0 flex items-center justify-end">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => onAddTransaction(item.id)}
                                className="p-0 hover:bg-bg-surface-2 rounded-input transition-colors"
                                title="Add Transaction"
                              >
                                <svg className="w-6 h-6 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                              </button>
                              <ItemMenu
                                itemId={item.id}
                                onShowMenu={onShowMenu}
                                onRemoveItem={onRemoveItem}
                                onShowTransactions={onShowTransactions}
                                onEditItem={onEditItem}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  )
}

// Item Menu Component (3-dots)
interface ItemMenuProps {
  itemId: string
  onShowMenu: (itemId: string, buttonElement: HTMLButtonElement) => void
  onRemoveItem: (itemId: string) => void
  onShowTransactions: (itemId: string) => void
  onEditItem: (itemId: string) => void
}

function ItemMenu({ itemId, onShowMenu, onRemoveItem, onShowTransactions, onEditItem }: ItemMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
        setMenuPosition(null)
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const menuWidth = 180
      const menuX = rect.left - menuWidth - 8
      const menuY = rect.top
      setMenuOpen(true)
      setMenuPosition({ x: menuX, y: menuY })
    }
  }

  const handleShowTransactions = () => {
    setMenuOpen(false)
    setMenuPosition(null)
    onShowTransactions(itemId)
  }

  const handleRemove = () => {
    setMenuOpen(false)
    setMenuPosition(null)
    onRemoveItem(itemId)
  }

  const handleEdit = () => {
    setMenuOpen(false)
    setMenuPosition(null)
    onEditItem(itemId)
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleClick}
        className="p-0 hover:bg-bg-surface-2 rounded-input transition-colors"
        title="Options"
      >
        <svg className="w-6 h-6 text-text-secondary" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      </button>
      {menuOpen && menuPosition && (
        <div
          ref={menuRef}
          className="fixed z-[100] bg-bg-surface-1 border border-border-strong rounded-card shadow-card px-3 py-3 lg:p-6 min-w-[180px]"
          style={{ left: menuPosition.x, top: menuPosition.y }}
        >
          <button
            onClick={handleEdit}
            className="w-full text-left px-4 py-2 text-text-primary text-[0.567rem] md:text-xs hover:bg-bg-surface-2 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleShowTransactions}
            className="w-full text-left px-4 py-2 text-text-primary text-[0.567rem] md:text-xs hover:bg-bg-surface-2 transition-colors"
          >
            Show Transactions
          </button>
          <button
            onClick={handleRemove}
            className="w-full text-left px-4 py-2 text-danger text-[0.567rem] md:text-xs hover:bg-bg-surface-2 transition-colors"
          >
            Remove
          </button>
        </div>
      )}
    </>
  )
}

function NetWorth() {
  const { baseCurrency, convert, exchangeRates } = useCurrency()
  const { uid } = useAuth()
  const { isIncognito } = useIncognito()
  const { rapidApiKey } = useApiKeys()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch', { incognito: isIncognito })
  const formatUsd = (value: number) => formatMoney(value, 'USD', 'ch', { incognito: isIncognito })
  
  // Load data from DataContext (includes merged Perpetuals data)
  const { data, loading: dataLoading } = useData()
  // Use local state for items/transactions that we can edit and save
  // Initialize from DataContext, but allow local updates
  const [netWorthItems, setNetWorthItems] = useState<NetWorthItem[]>([])
  const [transactions, setTransactions] = useState<NetWorthTransaction[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const isManuallySaving = useRef(false)
  
  // Sync with DataContext when it updates (this ensures we get the merged Perpetuals data)
  useEffect(() => {
    if (data.netWorthItems.length > 0 || netWorthItems.length === 0) {
      setNetWorthItems(data.netWorthItems)
    }
    if (data.transactions.length > 0 || transactions.length === 0) {
      setTransactions(data.transactions)
    }
  }, [data.netWorthItems, data.transactions])

  // Store current crypto prices (ticker -> USD price)
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({})
  const [cryptoPricesLastUpdate, setCryptoPricesLastUpdate] = useState<number>(0)
  // Store current stock/index fund/commodity prices (ticker -> USD price)
  const [stockPrices, setStockPrices] = useState<Record<string, number>>({})
  const [stockPricesLastUpdate, setStockPricesLastUpdate] = useState<number>(0)
  const [usdToChfRate, setUsdToChfRate] = useState<number | null>(null)
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false)

  // Load platforms from Firestore (data items come from DataContext)
  useEffect(() => {
    if (!uid) return

    const loadPlatformsData = async () => {
      try {
        const defaultPlatforms: Platform[] = [
          { id: 'physical', name: 'Physical', order: 0 },
          { id: 'raiffeisen', name: 'Raiffeisen', order: 0 },
          { id: 'revolut', name: 'Revolut', order: 0 },
          { id: 'yuh', name: 'yuh!', order: 0 },
          { id: 'saxo', name: 'SAXO', order: 0 },
          { id: 'mexc', name: 'MEXC', order: 0 },
          { id: 'bingx', name: 'BingX', order: 0 },
          { id: 'exodus', name: 'Exodus', order: 0 },
          { id: 'trezor', name: 'Trezor', order: 0 },
          { id: 'ledger', name: 'Ledger', order: 0 },
          { id: 'ibkr', name: 'IBKR', order: 0 },
          { id: 'ubs', name: 'UBS', order: 0 },
          { id: 'property', name: 'Property', order: 0 },
          { id: 'wallet', name: 'Wallet', order: 0 },
          { id: 'other', name: 'Other', order: 0 },
        ]
        const loadedPlatforms = await loadPlatforms(defaultPlatforms, uid)
        setPlatforms(loadedPlatforms)
      } catch (error) {
        console.error('Failed to load platforms:', error)
      }
    }

    loadPlatformsData()
  }, [uid])

  // Perpetuals data is refreshed by DataContext, no need to refresh here

  // ⚠️ REMOVED: Auto-save useEffect hooks
  // These caused "last write wins" conflicts when Device B synced stale data.
  // Now we only save on explicit user actions (add, edit, delete) using per-document saves.

  // Helper function to remove undefined values from an object (Firestore doesn't allow undefined)
  const removeUndefined = <T extends Record<string, any>>(obj: T): Partial<T> => {
    const cleaned: Partial<T> = {}
    Object.keys(obj).forEach(key => {
      if (obj[key] !== undefined) {
        cleaned[key as keyof T] = obj[key]
      }
    })
    return cleaned
  }

  // Fetch crypto prices and USD→CHF rate for all crypto items
  const fetchAllCryptoPrices = async (showLoading = false) => {
    if (showLoading) {
      setIsRefreshingPrices(true)
    }
    
    try {
    const cryptoItems = netWorthItems.filter(item => item.category === 'Crypto')
      if (cryptoItems.length === 0) {
        // Still fetch USD→CHF rate even if no crypto items
        try {
          const { usdToChfRate: rate } = await fetchCryptoData([])
          if (rate !== null) {
            setUsdToChfRate(rate)
          }
        } catch (error) {
          console.error('Error fetching USD→CHF rate:', error)
        }
        return
      }

    const tickers = cryptoItems.map(item => item.name.trim().toUpperCase())
    const uniqueTickers = [...new Set(tickers)]
    
      const { prices, usdToChfRate: rate } = await fetchCryptoData(uniqueTickers)
      
      // Update crypto prices
      setCryptoPrices(prev => ({ ...prev, ...prices }))
      
      // Update USD→CHF rate
      if (rate !== null) {
        setUsdToChfRate(rate)
      }
      
      setCryptoPricesLastUpdate(Date.now())
      } catch (error) {
      console.error('Error fetching crypto data:', error)
    } finally {
      if (showLoading) {
        setIsRefreshingPrices(false)
      }
    }
  }

  // Fetch stock/index fund/commodity prices for all relevant items
  const fetchAllStockPrices = async (showLoading = false) => {
    if (showLoading) {
      setIsRefreshingPrices(true)
    }
    
    try {
      const stockItems = netWorthItems.filter(item => 
        item.category === 'Index Funds' || 
        item.category === 'Stocks' || 
        item.category === 'Commodities'
      )
      
      if (stockItems.length === 0) {
        return
      }

      const tickers = stockItems.map(item => item.name.trim().toUpperCase())
      const uniqueTickers = [...new Set(tickers)]
      
      const prices = await fetchStockPrices(uniqueTickers, rapidApiKey)
      
      // Update stock prices
      setStockPrices(prev => ({ ...prev, ...prices }))
      
      setStockPricesLastUpdate(Date.now())
    } catch (error) {
      console.error('Error fetching stock prices:', error)
    } finally {
      if (showLoading) {
        setIsRefreshingPrices(false)
      }
    }
  }

  // Fetch all prices (crypto and stocks)
  const fetchAllPrices = async (showLoading = false) => {
    if (showLoading) {
      setIsRefreshingPrices(true)
    }
    
    try {
      // Fetch both in parallel
      await Promise.all([
        fetchAllCryptoPrices(false),
        fetchAllStockPrices(false),
      ])
    } finally {
      if (showLoading) {
        setIsRefreshingPrices(false)
      }
    }
  }

  // Fetch prices on mount and set up 5-minute interval
  useEffect(() => {
    // Fetch immediately
    fetchAllPrices()

    // Set up interval to fetch every 5 minutes (300000 ms)
    const interval = setInterval(() => {
      fetchAllPrices()
    }, 300000) // 5 minutes

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netWorthItems]) // Re-fetch when items change
  const [activeCategory, setActiveCategory] = useState<NetWorthCategory | null>(null)
  const [transactionItemId, setTransactionItemId] = useState<string | null>(null)
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [showTransactionsItemId, setShowTransactionsItemId] = useState<string | null>(null)

  const groupedItems = useMemo(
    () =>
      netWorthItems.reduce(
        (acc, item) => {
          if (!acc[item.category]) {
            acc[item.category] = []
          }
          acc[item.category].push(item)
          return acc
        },
        {} as Record<NetWorthCategory, NetWorthItem[]>
      ),
    [netWorthItems]
  )

  // Calculate total net worth by summing all category subtotals (same logic as category sections)
  // Calculate total net worth using shared calculation service
  const totalNetWorth = useMemo(() => {
    const result = NetWorthCalculationService.calculateTotals(
      netWorthItems,
      transactions,
      cryptoPrices,
      stockPrices,
      usdToChfRate,
      convert
    )
    return result.totalNetWorthChf
  }, [netWorthItems, transactions, cryptoPrices, stockPrices, usdToChfRate, convert])

  // Calculate USD value for total net worth
  const totalNetWorthInUsd = useMemo(
    () => totalNetWorth * (exchangeRates?.rates['USD'] || 1),
    [totalNetWorth, exchangeRates]
  )


  const handleAddItem = async (
    category: NetWorthCategory,
    data: { name: string; currency: string; platform: string; monthlyDepreciationChf?: number }
  ) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : String(Date.now())

    const newItem: NetWorthItem = {
      id,
      category,
      name: data.name,
      currency: data.currency,
      platform: data.platform,
      ...(data.monthlyDepreciationChf !== undefined && { monthlyDepreciationChf: data.monthlyDepreciationChf }),
    }

    // Update local state immediately (optimistic update)
    setNetWorthItems((prev) => [...prev, newItem])
    
    // Save to Firestore (per-document upsert with conflict detection)
    if (uid) {
      const cleanedItem = removeUndefined(newItem) as NetWorthItem
      const result = await saveNetWorthItem(cleanedItem, uid)
      if (!result.success) {
        console.error('[NetWorth] Failed to save new item:', result.reason)
        // Optionally revert optimistic update on error
        // For now, we keep it and let the user retry
      }
    }
    
    // Don't close the modal here - let the modal close itself after transaction is saved
    
    // Return the item ID so it can be used for creating the transaction
    return id
  }
  
  const handleAddItemWithTransaction = async (
    category: NetWorthCategory,
    data: { name: string; currency: string; platform: string },
    transactionData?: Omit<NetWorthTransaction, 'id' | 'itemId'>
  ) => {
    const itemId = await handleAddItem(category, data)
    
    // If transaction data is provided, create the transaction
    if (transactionData && itemId) {
      const transactionId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `tx-${Date.now()}`
      
      const newTransaction: NetWorthTransaction = {
        id: transactionId,
        itemId,
        ...transactionData,
      }
      
      // Update local state immediately (optimistic update)
      setTransactions((prev) => [...prev, newTransaction])
      
      // Save to Firestore (per-document upsert with conflict detection)
      if (uid) {
        const cleanedTransaction = removeUndefined(newTransaction) as NetWorthTransaction
        const result = await saveNetWorthTransaction(cleanedTransaction, uid)
        if (!result.success) {
          console.error('[NetWorth] Failed to save new transaction:', result.reason)
        }
      }
    }
  }

  const handleAddTransaction = (itemId: string) => {
    setTransactionItemId(itemId)
  }

  const handleSaveTransaction = async (transaction: Omit<NetWorthTransaction, 'id'>) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `tx-${Date.now()}`

    const newTransaction: NetWorthTransaction = {
      id,
      ...transaction,
    }

    // Remove undefined values before saving (Firestore doesn't allow undefined)
    const cleanedTransaction = removeUndefined(newTransaction) as NetWorthTransaction

    if (import.meta.env.DEV) {
      console.log('[NetWorth] Saving transaction:', cleanedTransaction)
    }

    // Update local state immediately (optimistic update)
    setTransactions((prev) => [...prev, newTransaction])
    
    // Save to Firestore (per-document upsert with conflict detection)
    if (uid) {
      const result = await saveNetWorthTransaction(cleanedTransaction, uid)
      if (!result.success) {
        console.error('[NetWorth] Failed to save transaction:', result.reason)
        // Optionally revert optimistic update on error
        // For now, we keep it and let the user retry
      }
    }
    
    // Only clear transactionItemId if we're in the Add Transaction modal context
    // (not when called from Add Item modal)
    if (transactionItemId) {
      setTransactionItemId(null)
    }
  }

  const handleEditTransaction = (transactionId: string) => {
    setEditingTransactionId(transactionId)
    setShowTransactionsItemId(null) // Close the transactions modal
  }

  const handleUpdateTransaction = async (transactionId: string, transaction: Omit<NetWorthTransaction, 'id'>) => {
    // Find the existing transaction to get its updatedAt timestamp for conflict detection
    const existingTransaction = transactions.find(tx => tx.id === transactionId)
    const clientUpdatedAt = existingTransaction?.updatedAt 
      ? new Date((existingTransaction.updatedAt as any).toMillis?.() || existingTransaction.updatedAt)
      : null

    // Update local state immediately (optimistic update)
    setTransactions((prev) => {
      return prev.map((tx) => (tx.id === transactionId ? { ...tx, ...transaction } : tx))
    })
    
    // Save to Firestore (per-document upsert with conflict detection)
    if (uid) {
      const updatedTransaction: NetWorthTransaction = {
        id: transactionId,
        ...transaction,
      }
      const cleanedTransaction = removeUndefined(updatedTransaction) as NetWorthTransaction
      const result = await saveNetWorthTransaction(cleanedTransaction, uid, {
        clientUpdatedAt,
      })
      if (!result.success) {
        console.error('[NetWorth] Failed to save updated transaction:', result.reason)
        // Optionally revert optimistic update on error
        // For now, we keep it and let the user retry
      }
    }
    
    setEditingTransactionId(null)
  }

  const handleDeleteTransaction = async (transactionId: string) => {
    // Find the existing transaction to get its updatedAt timestamp for conflict detection
    const existingTransaction = transactions.find(tx => tx.id === transactionId)
    const clientUpdatedAt = existingTransaction?.updatedAt 
      ? new Date((existingTransaction.updatedAt as any).toMillis?.() || existingTransaction.updatedAt)
      : null

    // Update local state immediately (optimistic update)
    setTransactions((prev) => prev.filter((tx) => tx.id !== transactionId))
    
    // Delete from Firestore (with conflict detection)
    if (uid) {
      const result = await deleteNetWorthTransaction(transactionId, uid, {
        clientUpdatedAt,
      })
      if (!result.success) {
        console.error('[NetWorth] Failed to delete transaction:', result.reason)
        // Optionally revert optimistic update on error
        // For now, we keep it and let the user retry
      }
    }
  }

  const handleShowMenu = (itemId: string, buttonElement: HTMLButtonElement) => {
    // This function is kept for interface compatibility but ItemMenu manages its own menu now
  }

  const handleRemoveItem = async (itemId: string) => {
    if (window.confirm('Are you sure you want to remove this item? All associated transactions will also be removed.')) {
      // Find the existing item to get its updatedAt timestamp for conflict detection
      const existingItem = netWorthItems.find(item => item.id === itemId)
      const clientUpdatedAt = existingItem?.updatedAt 
        ? new Date((existingItem.updatedAt as any).toMillis?.() || existingItem.updatedAt)
        : null

      // Find all transactions for this item
      const transactionsToDelete = transactions.filter(tx => tx.itemId === itemId)

      // Update local state immediately (optimistic update)
      setNetWorthItems((prev) => prev.filter(i => i.id !== itemId))
      setTransactions((prev) => prev.filter(tx => tx.itemId !== itemId))
      
      // Delete from Firestore (per-document deletes with conflict detection)
      if (uid) {
        // Delete the item
        const itemResult = await deleteNetWorthItem(itemId, uid, {
          clientUpdatedAt,
        })
        if (!itemResult.success) {
          console.error('[NetWorth] Failed to delete item:', itemResult.reason)
        }

        // Delete all associated transactions
        await Promise.all(
          transactionsToDelete.map(async (tx) => {
            const txClientUpdatedAt = tx.updatedAt 
              ? new Date((tx.updatedAt as any).toMillis?.() || tx.updatedAt)
              : null
            const result = await deleteNetWorthTransaction(tx.id, uid, {
              clientUpdatedAt: txClientUpdatedAt,
            })
            if (!result.success) {
              console.error(`[NetWorth] Failed to delete transaction ${tx.id}:`, result.reason)
            }
          })
        )
      }
    }
  }

  const handleShowTransactions = (itemId: string) => {
    setShowTransactionsItemId(itemId)
  }

  const handleEditItem = (itemId: string) => {
    setEditingItemId(itemId)
  }

  const handleSaveEditItem = async (itemId: string, newName: string, currency: string, platform: string, monthlyDepreciationChf?: number) => {
    // Find the existing item to get its updatedAt timestamp for conflict detection
    const existingItem = netWorthItems.find(item => item.id === itemId)
    const clientUpdatedAt = existingItem?.updatedAt 
      ? new Date((existingItem.updatedAt as any).toMillis?.() || existingItem.updatedAt)
      : null

    // Update local state immediately (optimistic update)
    setNetWorthItems((prev) =>
      prev.map((item) => 
        item.id === itemId 
          ? { 
              ...item, 
              name: newName.trim(), 
              currency, 
              platform,
              ...(monthlyDepreciationChf !== undefined && { monthlyDepreciationChf })
            } 
          : item
      )
    )
    
    // Save to Firestore (per-document upsert with conflict detection)
    if (uid && existingItem) {
      const updatedItem: NetWorthItem = {
        ...existingItem,
        name: newName.trim(),
        currency,
        platform,
        ...(monthlyDepreciationChf !== undefined && { monthlyDepreciationChf }),
      }
      const cleanedItem = removeUndefined(updatedItem) as NetWorthItem
      const result = await saveNetWorthItem(cleanedItem, uid, {
        clientUpdatedAt,
      })
      if (!result.success) {
        console.error('[NetWorth] Failed to save edited item:', result.reason)
        // Optionally revert optimistic update on error
        // For now, we keep it and let the user retry
      }
    }
    
    setEditingItemId(null)
  }

  return (
    <div className="min-h-screen px-2 lg:px-6 pt-4 pb-12 lg:pt-6 lg:pb-16">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Net Worth</Heading>
        
        {/* Total Net Worth */}
        <div className="bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
          <div className="mb-6 pb-4 border-b border-border-strong">
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-2">
              <Heading level={2}>Total Net Worth</Heading>
              </div>
              <TotalText variant={totalNetWorth >= 0 ? 'inflow' : 'outflow'} className="mt-1">
                {formatCurrency(totalNetWorth)}
              </TotalText>
              <TotalText variant={totalNetWorthInUsd >= 0 ? 'inflow' : 'outflow'} className="mt-1">
                {formatUsd(totalNetWorthInUsd)}
              </TotalText>
            </div>
          </div>
        </div>

        {/* Grouped Categories */}
        <div className="space-y-6">
          {categoryOrder.map((category) => {
            const items = groupedItems[category] || []

            return (
              <NetWorthCategorySection
                key={category}
                category={category}
                items={items}
                transactions={transactions}
                cryptoPrices={cryptoPrices}
                stockPrices={stockPrices}
                usdToChfRate={usdToChfRate}
                platforms={platforms}
                onAddClick={() => setActiveCategory(category)}
                onAddTransaction={handleAddTransaction}
                onShowMenu={handleShowMenu}
                onRemoveItem={handleRemoveItem}
                onShowTransactions={handleShowTransactions}
                onEditItem={handleEditItem}
              />
            )
          })}
        </div>

        {/* Add Item Modal */}
        {activeCategory && (
          <AddNetWorthItemModal
            category={activeCategory}
            platforms={platforms}
            onClose={() => setActiveCategory(null)}
            onSubmit={handleAddItem}
            onSaveTransaction={(itemId, transaction) => {
              handleSaveTransaction({
                ...transaction,
                itemId,
              } as Omit<NetWorthTransaction, 'id'>)
            }}
          />
        )}

        {/* Add Transaction Modal */}
        {transactionItemId && (
          <AddTransactionModal
            item={netWorthItems.find(i => i.id === transactionItemId)!}
            transactions={transactions}
            onClose={() => setTransactionItemId(null)}
            onSave={handleSaveTransaction}
          />
        )}

        {/* Show Transactions Modal */}
        {showTransactionsItemId && (
          <ShowTransactionsModal
            item={netWorthItems.find(i => i.id === showTransactionsItemId)!}
            transactions={transactions.filter(tx => tx.itemId === showTransactionsItemId)}
            cryptoPrices={cryptoPrices}
            platforms={platforms}
            onClose={() => setShowTransactionsItemId(null)}
            onEdit={handleEditTransaction}
            onDelete={handleDeleteTransaction}
          />
        )}

        {/* Edit Item Modal */}
        {editingItemId && (
          <EditNetWorthItemModal
            item={netWorthItems.find(i => i.id === editingItemId)!}
            platforms={platforms}
            onClose={() => setEditingItemId(null)}
            onSave={handleSaveEditItem}
          />
        )}

        {/* Edit Transaction Modal */}
        {editingTransactionId && (() => {
          const transaction = transactions.find(tx => tx.id === editingTransactionId)
          if (!transaction) return null
          const item = netWorthItems.find(i => i.id === transaction.itemId)
          if (!item) return null
          return (
            <AddTransactionModal
              item={item}
              transaction={transaction}
              transactions={transactions}
              onClose={() => setEditingTransactionId(null)}
              onSave={(updatedTransaction) => {
                handleUpdateTransaction(editingTransactionId, updatedTransaction)
              }}
            />
          )
        })()}

      </div>
    </div>
  )
}

// Add Item Modal
interface AddNetWorthItemModalProps {
  category: NetWorthCategory
  platforms: Platform[]
  onClose: () => void
  onSubmit: (
    category: NetWorthCategory,
    data: { name: string; currency: string; platform: string; monthlyDepreciationChf?: number }
  ) => Promise<string> | string | void // Returns itemId if available
  onSaveTransaction?: (itemId: string, transaction: Omit<NetWorthTransaction, 'id' | 'itemId'>) => void
}

function AddNetWorthItemModal({ category, platforms, onClose, onSubmit, onSaveTransaction }: AddNetWorthItemModalProps) {
  const { convert } = useCurrency()
  const { rapidApiKey } = useApiKeys()
  const isCrypto = category === 'Crypto'
  const isStockCategory = category === 'Index Funds' || category === 'Stocks' || category === 'Commodities'
  // Categories where price per item is always 1 (no need to show input)
  const categoriesWithoutPricePerItem: NetWorthCategory[] = ['Cash', 'Bank Accounts', 'Retirement Funds', 'Real Estate', 'Perpetuals']
  const hidePricePerItem = categoriesWithoutPricePerItem.includes(category)
  
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [pricePerItem, setPricePerItem] = useState('')
  const [monthlyDepreciationChf, setMonthlyDepreciationChf] = useState('')
  // For Crypto, Index Funds, Stocks, and Commodities, currency is always USD. For others, default to CHF.
  const [currency, setCurrency] = useState<CurrencyCode>(isCrypto || isStockCategory ? 'USD' : 'CHF')
  const [platform, setPlatform] = useState('Physical')
  const isDepreciatingAsset = category === 'Depreciating Assets'
  // For date input, use YYYY-MM-DD format (HTML5 date input format)
  const [date, setDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoadingPrice, setIsLoadingPrice] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  
  // Fetch coin price when name is entered for Crypto items (debounced by 1 second)
  useEffect(() => {
    if (isCrypto && name.trim()) {
      const ticker = name.trim().toUpperCase()
      
      // Debounce: wait 1 second after user stops typing
      const debounceTimer = setTimeout(() => {
        setIsLoadingPrice(true)
        setPriceError(null)

        fetchCryptoPrices([ticker])
          .then((prices) => {
            const price = prices[ticker]
            if (price !== undefined && price !== null) {
              // Set the USD price directly from API (always in USD for crypto)
              setPricePerItem(price.toString())
              setPriceError(null)
            } else {
              setPriceError(`Could not fetch price for ${ticker}. Please enter price manually.`)
            }
          })
          .catch((err) => {
            setPriceError(`Failed to fetch price for ${ticker}. Please enter price manually.`)
          })
          .finally(() => {
            setIsLoadingPrice(false)
          })
      }, 1000) // Wait 1 second after user stops typing

      // Cleanup: clear timeout if user continues typing
      return () => clearTimeout(debounceTimer)
    } else if (isCrypto && !name.trim()) {
      // Clear price when name is cleared
      setPricePerItem('')
      setPriceError(null)
      setIsLoadingPrice(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCrypto, name]) // Run when name changes for crypto items

  // Fetch stock/index fund/commodity price when name is entered (debounced by 1 second)
  useEffect(() => {
    if (isStockCategory && name.trim() && rapidApiKey) {
      const ticker = name.trim().toUpperCase()
      
      // Debounce: wait 1 second after user stops typing
      const debounceTimer = setTimeout(() => {
        setIsLoadingPrice(true)
        setPriceError(null)

        fetchStockPrices([ticker], rapidApiKey)
          .then((prices) => {
            const price = prices[ticker]
            if (price !== undefined && price !== null) {
              // Set the USD price directly from API (always in USD for stocks/index funds/commodities)
              setPricePerItem(price.toString())
              setPriceError(null)
            } else {
              setPriceError(`Could not fetch price for ${ticker}. Please enter price manually.`)
            }
          })
          .catch((err) => {
            setPriceError(`Failed to fetch price for ${ticker}. Please enter price manually.`)
          })
          .finally(() => {
            setIsLoadingPrice(false)
          })
      }, 1000) // Wait 1 second after user stops typing

      // Cleanup: clear timeout if user continues typing
      return () => clearTimeout(debounceTimer)
    } else if (isStockCategory && !name.trim()) {
      // Clear price when name is cleared
      setPricePerItem('')
      setPriceError(null)
      setIsLoadingPrice(false)
    } else if (isStockCategory && name.trim() && !rapidApiKey) {
      // Show warning if API key is not configured
      setPriceError('RapidAPI key not configured. Please set it in Settings to fetch prices automatically.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStockCategory, name, rapidApiKey]) // Run when name changes for stock categories

  // Calculate total balance for all categories
  const totalBalance = useMemo(() => {
    const parsedAmount = Number(amount) || 0
    // For categories without price per item, price is always 1
    const parsedPrice = hidePricePerItem ? 1 : (Number(pricePerItem) || 0)
    return parsedAmount * parsedPrice
  }, [amount, pricePerItem, hidePricePerItem])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Please enter an item name.')
      return
    }

    if (!date) {
      setError('Please select a date.')
        return
      }
    const parsedDate = date // Already in YYYY-MM-DD format

    // For all categories, use the same format
    const parsedAmount = Number(amount)
    // For categories without price per item, price is always 1
    const parsedPricePerItem = hidePricePerItem ? 1 : Number(pricePerItem)

    if (!amount || Number.isNaN(parsedAmount) || parsedAmount === 0) {
      setError('Please enter a valid amount (can be positive for buy or negative for sell).')
          return
        }

    // Only validate price per item for categories that require it
    if (!hidePricePerItem) {
      if (!pricePerItem || Number.isNaN(parsedPricePerItem) || parsedPricePerItem <= 0) {
        setError('Please enter a valid price per item greater than 0.')
        return
      }
    }

    // For Crypto, Index Funds, Stocks, and Commodities, currency is always USD
    const itemCurrency = isCrypto || isStockCategory ? 'USD' : currency

    // Validate monthly depreciation for Depreciating Assets
    if (isDepreciatingAsset) {
      const parsedDepreciation = Number(monthlyDepreciationChf)
      if (!monthlyDepreciationChf || Number.isNaN(parsedDepreciation) || parsedDepreciation <= 0) {
        setError('Please enter a valid monthly depreciation amount greater than 0.')
        return
      }
    }

    // Create the item first and get its ID
    const newItemIdResult = onSubmit(category, {
      name: name.trim(),
      currency: itemCurrency,
      platform,
      ...(isDepreciatingAsset && { monthlyDepreciationChf: Number(monthlyDepreciationChf) }),
    })
    const newItemId = newItemIdResult instanceof Promise ? await newItemIdResult : newItemIdResult

    // Create the initial transaction
    if (onSaveTransaction && newItemId) {
      const side: 'buy' | 'sell' = parsedAmount > 0 ? 'buy' : 'sell'
      const holdingsAmount = Math.abs(parsedAmount)
      
      // Convert price per item to CHF for storage
      // For categories without price per item, price is always 1
      const pricePerItemChf = convert(parsedPricePerItem, itemCurrency as CurrencyCode)

        onSaveTransaction(newItemId, {
        side,
        currency: itemCurrency,
        amount: holdingsAmount, // Holdings quantity
        pricePerItem: parsedPricePerItem, // Original price in original currency
        pricePerItemChf, // Price in CHF
        date: parsedDate,
      })
    }

    // Reset form
    setName('')
    setAmount('')
    setPricePerItem('')
    setMonthlyDepreciationChf('')
    setCurrency(isCrypto ? 'USD' : 'CHF')
    setPlatform('Physical')
    // Reset date to today in YYYY-MM-DD format
    const now = new Date()
    setDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`)
    
    // Close modal
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-bg-surface-1 border border-border-strong rounded-card shadow-card px-3 py-3 lg:p-6 relative" onClick={(e) => e.stopPropagation()}>
        <Heading level={2} className="mb-4">
          Add Item – {category}
        </Heading>

        {error && (
          <div className="mb-3 text-[0.567rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1">
              Category
            </label>
            <div className="text-text-primary text-xs md:text-sm">{category}</div>
          </div>

          <div>
            <label
              className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
              htmlFor="nw-item-name"
            >
              Item
            </label>
            <input
              id="nw-item-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              placeholder="Enter item name"
              autoFocus
            />
          </div>

          {/* For all categories - same format */}
              <div>
                <label
                  className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                  htmlFor="nw-currency"
                >
                  Currency
                </label>
            {(isCrypto || isStockCategory) ? (
              <div className="w-full bg-bg-surface-2 border border-border-subtle rounded-input pl-3 pr-8 py-2 text-text-muted text-xs md:text-sm cursor-not-allowed">
                USD
              </div>
            ) : (
                <select
                  id="nw-currency"
                  value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input pl-3 pr-8 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                >
                  <option value="CHF">CHF</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
            )}
          </div>

              <div>
                <label
                  className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
              htmlFor="nw-amount"
                >
              Amount (holdings)
                </label>
                <input
              id="nw-amount"
                  type="number"
              step={(isCrypto || isStockCategory) ? "0.00000001" : "0.0001"}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              placeholder="Positive for buy, negative for sell"
                />
              </div>

          {/* Only show price per item field for categories that need it */}
          {!hidePricePerItem && (
                  <div>
                    <label
                      className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                htmlFor="nw-price-per-item"
                    >
                Price per Item ({(isCrypto || isStockCategory) ? 'USD' : currency})
                {isLoadingPrice && (isCrypto || isStockCategory) && (
                        <span className="ml-2 text-text-muted text-[0.4725rem] md:text-[0.567rem]">(fetching...)</span>
                      )}
                    </label>
                    <input
                id="nw-price-per-item"
                      type="number"
                step={(isCrypto || isStockCategory) ? "any" : "0.01"}
                      min="0"
                value={pricePerItem}
                onChange={(e) => setPricePerItem(e.target.value)}
                      className={`w-full bg-bg-surface-2 border rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue ${
                        priceError ? 'border-warning' : 'border-border-subtle'
                      }`}
                placeholder={(isCrypto || isStockCategory) ? "e.g. 50000, 3000, 1.00" : "e.g. 150.50"}
                disabled={isLoadingPrice && (isCrypto || isStockCategory)}
                    />
                    {priceError && (
                      <p className="mt-1 text-[0.4725rem] md:text-[0.567rem] text-warning">
                        {priceError}
                      </p>
                    )}
                  </div>
          )}

          {/* Monthly depreciation field for Depreciating Assets */}
          {isDepreciatingAsset && (
            <div>
              <label
                className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                htmlFor="nw-monthly-depreciation"
              >
                Monthly Depreciation (CHF)
              </label>
              <input
                id="nw-monthly-depreciation"
                type="number"
                step="0.01"
                min="0"
                value={monthlyDepreciationChf}
                onChange={(e) => setMonthlyDepreciationChf(e.target.value)}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                placeholder="e.g. 100.00"
              />
            </div>
          )}

                <div>
                  <label
                    className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
              htmlFor="nw-total-balance"
                  >
              Total balance of this transaction ({(isCrypto || isStockCategory) ? 'USD' : currency})
                  </label>
                  <input
              id="nw-total-balance"
              type="text"
              value={totalBalance !== 0 ? totalBalance.toFixed(2) : ''}
              readOnly
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-muted text-xs md:text-sm cursor-not-allowed"
              placeholder="Calculated automatically"
                  />
                </div>

          <div>
            <label
              className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
              htmlFor="nw-platform"
            >
              Platform
            </label>
            <select
              id="nw-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input pl-3 pr-8 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
            >
              {platforms.length > 0 ? (
                platforms.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))
              ) : (
                <option value="Physical">Physical</option>
              )}
            </select>
          </div>

              <div>
                <label
                  className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
              htmlFor="nw-date"
                >
              Date (DD/MM/YYYY)
                </label>
            <div className="relative flex items-center">
                <input
                id="nw-date-display"
                type="text"
                value={date ? formatDate(date) : ''}
                readOnly
                onClick={() => {
                  const dateInput = document.getElementById('nw-date') as HTMLInputElement
                  if (dateInput) {
                    if (dateInput.showPicker) {
                      dateInput.showPicker()
                    } else {
                      dateInput.click()
                    }
                  }
                }}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 pr-10 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue cursor-pointer"
                placeholder="DD/MM/YYYY"
              />
              <input
                id="nw-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                className="absolute right-0 opacity-0 w-10 h-full cursor-pointer"
                style={{ cursor: 'pointer' }}
              />
              <button
                type="button"
                onClick={() => {
                  const dateInput = document.getElementById('nw-date') as HTMLInputElement
                  if (dateInput) {
                    if (dateInput.showPicker) {
                      dateInput.showPicker()
                    } else {
                      dateInput.click()
                    }
                  }
                }}
                className="absolute right-2 cursor-pointer text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-[0.567rem] md:text-xs bg-bg-surface-2 border border-border-subtle text-text-primary hover:bg-bg-surface-3 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-full text-[0.567rem] md:text-xs bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] font-semibold hover:brightness-110 transition-all duration-200 shadow-card"
            >
              Add Item
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Edit Net Worth Item Modal
interface EditNetWorthItemModalProps {
  item: NetWorthItem
  platforms: Platform[]
  onClose: () => void
  onSave: (itemId: string, newName: string, currency: string, platform: string, monthlyDepreciationChf?: number) => void
}

function EditNetWorthItemModal({ item, platforms, onClose, onSave }: EditNetWorthItemModalProps) {
  const isCrypto = item.category === 'Crypto'
  const isStockCategory = item.category === 'Index Funds' || item.category === 'Stocks' || item.category === 'Commodities'
  const isDepreciatingAsset = item.category === 'Depreciating Assets'
  const [name, setName] = useState(item.name)
  const [platform, setPlatform] = useState(item.platform)
  const [monthlyDepreciationChf, setMonthlyDepreciationChf] = useState(
    item.monthlyDepreciationChf?.toString() || ''
  )
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Please enter an item name.')
      return
    }

    // Validate monthly depreciation for Depreciating Assets
    if (isDepreciatingAsset) {
      const parsedDepreciation = Number(monthlyDepreciationChf)
      if (!monthlyDepreciationChf || Number.isNaN(parsedDepreciation) || parsedDepreciation <= 0) {
        setError('Please enter a valid monthly depreciation amount greater than 0.')
        return
      }
    }

    // Currency cannot be changed - always use item's original currency
    onSave(
      item.id, 
      name.trim(), 
      item.currency, 
      platform,
      isDepreciatingAsset ? Number(monthlyDepreciationChf) : undefined
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-bg-surface-1 border border-border-strong rounded-card shadow-card px-3 py-3 lg:p-6 relative" onClick={(e) => e.stopPropagation()}>
        <Heading level={2} className="mb-4">
          Edit Item
        </Heading>

        {error && (
          <div className="mb-3 text-[0.567rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1">
              Category
            </label>
            <div className="text-text-primary text-xs md:text-sm">{item.category}</div>
          </div>

          {(isCrypto || isStockCategory) ? (
            <>
              <div>
                <label
                  className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                  htmlFor="edit-currency"
                >
                  Currency
                </label>
                <div className="w-full bg-bg-surface-2 border border-border-subtle rounded-input pl-3 pr-8 py-2 text-text-muted text-xs md:text-sm cursor-not-allowed">
                  USD
                </div>
                <p className="mt-1 text-[0.4725rem] md:text-[0.567rem] text-text-muted">
                  Currency cannot be changed after item creation
                </p>
              </div>
            <div>
              <label
                className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                htmlFor="edit-platform"
              >
                Platform
              </label>
              <select
                id="edit-platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input pl-3 pr-8 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              >
                  {platforms.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            </>
          ) : (
            <>
              <div>
                <label
                  className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                  htmlFor="edit-currency"
                >
                  Currency
                </label>
                <div className="w-full bg-bg-surface-2 border border-border-subtle rounded-input pl-3 pr-8 py-2 text-text-muted text-xs md:text-sm cursor-not-allowed">
                  {item.currency}
                </div>
                <p className="mt-1 text-[0.4725rem] md:text-[0.567rem] text-text-muted">
                  Currency cannot be changed after item creation
                </p>
              </div>
              <div>
                <label
                  className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                  htmlFor="edit-platform"
                >
                  Platform
                </label>
                <select
                  id="edit-platform"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input pl-3 pr-8 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                >
                  {platforms.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label
              className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
              htmlFor="edit-item-name"
            >
              Item Name
            </label>
            <input
              id="edit-item-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              autoFocus
            />
          </div>

          {/* Monthly depreciation field for Depreciating Assets */}
          {isDepreciatingAsset && (
            <div>
              <label
                className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                htmlFor="edit-monthly-depreciation"
              >
                Monthly Depreciation (CHF)
              </label>
              <input
                id="edit-monthly-depreciation"
                type="number"
                step="0.01"
                min="0"
                value={monthlyDepreciationChf}
                onChange={(e) => setMonthlyDepreciationChf(e.target.value)}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                placeholder="e.g. 100.00"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-[0.567rem] md:text-xs bg-bg-surface-2 border border-border-subtle text-text-primary hover:bg-bg-surface-3 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-full text-[0.567rem] md:text-xs bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] font-semibold hover:brightness-110 transition-all duration-200 shadow-card"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Add Transaction Modal
interface AddTransactionModalProps {
  item: NetWorthItem
  transaction?: NetWorthTransaction // If provided, we're editing
  transactions?: NetWorthTransaction[] // All transactions for calculating current balance
  onClose: () => void
  onSave: (transaction: Omit<NetWorthTransaction, 'id'>) => void
}

// Categories that don't need price per item (1 unit = 1 CHF equivalent)
const categoriesWithoutPricePerItem: NetWorthCategory[] = ['Cash', 'Bank Accounts', 'Real Estate']

type TransactionTab = 'buy' | 'sell'

function AddTransactionModal({ item, transaction, transactions = [], onClose, onSave }: AddTransactionModalProps) {
  const { baseCurrency, convert, exchangeRates } = useCurrency()
  const { rapidApiKey } = useApiKeys()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch')
  const formatUsd = (value: number) => formatMoney(value, 'USD', 'ch')
  const isEditing = !!transaction
  const isCrypto = item.category === 'Crypto'
  const isStockCategory = item.category === 'Index Funds' || item.category === 'Stocks' || item.category === 'Commodities'
  // Categories where price per item is always 1 (no need to show input)
  const categoriesWithoutPricePerItem: NetWorthCategory[] = ['Cash', 'Bank Accounts', 'Retirement Funds', 'Real Estate', 'Perpetuals']
  const hidePricePerItem = categoriesWithoutPricePerItem.includes(item.category)
  // Categories that support Buy/Sell and Adjustment modes
  const supportsAdjustmentMode: NetWorthCategory[] = [
    'Crypto', 'Cash', 'Bank Accounts', 'Retirement Funds', 'Stocks', 
    'Commodities', 'Real Estate', 'Depreciating Assets'
  ]
  const canUseAdjustmentMode = supportsAdjustmentMode.includes(item.category)
  
  // For all categories, use original pricePerItem if available, otherwise convert from CHF
  const getInitialPrice = () => {
    if (!transaction) return ''
    if (isCrypto || isStockCategory) {
      // For crypto and stock categories, always fetch from API (handled in useEffect)
      return ''
    }
    // For all categories: use original pricePerItem if available, otherwise convert from CHF
    if (transaction.pricePerItem !== undefined) {
      return transaction.pricePerItem.toString()
    }
    // Fallback: convert from CHF to original currency
      const baseAmount = convert(transaction.pricePerItemChf, 'CHF')
    const originalCurrency = transaction.currency as CurrencyCode
    if (originalCurrency !== 'CHF' && exchangeRates && exchangeRates.rates[originalCurrency]) {
      // Convert from baseCurrency to original currency
      const originalAmount = baseAmount / exchangeRates.rates[originalCurrency]
      return originalAmount.toString()
    }
      return transaction.pricePerItemChf.toString()
    }
  
  // Transaction mode selector (Buy/Sell mode vs Adjustment mode) for supported categories
  // In Buy/Sell mode: positive amount = buy, negative amount = sell
  // In Adjustment mode: amount can be positive or negative
  const [isAdjustmentMode, setIsAdjustmentMode] = useState<boolean>(() => {
    if (canUseAdjustmentMode && transaction) {
      return transaction.cryptoType === 'ADJUSTMENT'
    }
    return false // Default to Buy/Sell mode for new transactions
  })
  
  // Transaction reason/note (available for all transaction types)
  const [adjustmentReason, setAdjustmentReason] = useState(() => transaction?.adjustmentReason || '')
  
  // Determine side from amount: positive = buy, negative = sell
  const getSideFromAmount = (amountValue: string): TransactionTab => {
    const parsed = Number(amountValue)
    if (isNaN(parsed) || parsed === 0) {
      // Default to buy if no amount or editing existing transaction
      return transaction?.side || 'buy'
    }
    return parsed > 0 ? 'buy' : 'sell'
  }

  const [inputMode, setInputMode] = useState<'amount' | 'balance'>('amount')
  const [amount, setAmount] = useState(() => {
    if (transaction) {
      // For editing, handle different transaction types
      if (canUseAdjustmentMode && transaction.cryptoType === 'ADJUSTMENT') {
        // ADJUSTMENT can be negative, show the signed amount
        return transaction.amount.toString()
      }
      // BUY/SELL: keep the original sign
      return transaction.side === 'sell' ? `-${transaction.amount}` : transaction.amount.toString()
    }
    return '0'
  })
  
  // Derive transactionType from mode and amount (must be after amount is defined)
  const transactionType = useMemo<CryptoTransactionType>(() => {
    if (!canUseAdjustmentMode) return 'BUY' // Not used for unsupported categories
    if (isAdjustmentMode) return 'ADJUSTMENT'
    // In Buy/Sell mode, determine from amount sign
    const parsedAmount = Number(amount)
    if (!isNaN(parsedAmount) && parsedAmount !== 0) {
      return parsedAmount > 0 ? 'BUY' : 'SELL'
    }
    // Default to BUY if amount is 0 or invalid
    return 'BUY'
  }, [canUseAdjustmentMode, isAdjustmentMode, amount])
  
  const [targetHoldings, setTargetHoldings] = useState(() => {
    if (transaction) {
      // For editing, calculate what the holdings was after this transaction
      const relevantTransactions = transactions.filter(tx => 
        tx.itemId === item.id && tx.id !== transaction.id
      )
      // For all categories, use holdings (quantity)
      const holdingsBefore = calculateHoldings(item.id, relevantTransactions)
      return (holdingsBefore + (transaction.side === 'buy' ? 1 : -1) * transaction.amount).toString()
    }
    // Default to current holdings for new transactions
    const relevantTransactions = transactions.filter(tx => tx.itemId === item.id)
    const currentHoldingsValue = calculateHoldings(item.id, relevantTransactions)
    return currentHoldingsValue.toString()
  })
  const [isUpdatingFromAmount, setIsUpdatingFromAmount] = useState(false)
  const [isUpdatingFromHoldings, setIsUpdatingFromHoldings] = useState(false)
  
  // Derive activeTab from amount
  const activeTab = useMemo(() => getSideFromAmount(amount), [amount, transaction])
  const [pricePerItemChf, setPricePerItemChf] = useState(getInitialPrice())
  // For all categories, always use item's currency (cannot be changed)
  // For Crypto, Index Funds, Stocks, and Commodities, currency is always USD
  const [priceCurrency, setPriceCurrency] = useState<CurrencyCode>(() => {
    if (isCrypto || isStockCategory) {
      return 'USD'
    }
    return (item.currency as CurrencyCode) || 'CHF'
  })
  // For date input, use YYYY-MM-DD format (HTML5 date input format)
  const [date, setDate] = useState(() => {
    if (transaction?.date) {
      // Transaction date is already in YYYY-MM-DD format
      return transaction.date
    }
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoadingPrice, setIsLoadingPrice] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  
  // Calculate current holdings for this item, excluding the transaction being edited
  const currentHoldings = useMemo(() => {
    const relevantTransactions = transactions.filter(tx => 
      tx.itemId === item.id && (!transaction || tx.id !== transaction.id)
    )
    return calculateHoldings(item.id, relevantTransactions)
  }, [transactions, item.id, transaction])
  
  // Calculate current balance for display (for crypto: balance value in USD, for others: same as holdings)
  const currentBalance = useMemo(() => {
    // For crypto, calculate balance value (holdings * current price in USD)
    if (isCrypto && pricePerItemChf) {
      const currentPrice = Number(pricePerItemChf)
      if (!isNaN(currentPrice) && currentPrice > 0) {
        return currentHoldings * currentPrice
      }
    }
    
    // For other categories, return holdings (quantity)
    return currentHoldings
  }, [currentHoldings, isCrypto, pricePerItemChf])

  // Fetch coin price when modal opens for Crypto items (both for new transactions and when editing)
  useEffect(() => {
    if (isCrypto && item.name) {
      // For editing, always fetch fresh price from API (in USD)
      // For new transactions, fetch if no price is set
      if (isEditing || !pricePerItemChf) {
        const ticker = item.name.trim().toUpperCase()
        setIsLoadingPrice(true)
        setPriceError(null)

        fetchCryptoPrices([ticker])
          .then((prices) => {
            const price = prices[ticker]
            if (price !== undefined && price !== null) {
              // Set the USD price directly from API (always in USD for crypto)
              setPricePerItemChf(price.toString())
              setPriceError(null)
            } else {
              // If API fails and we're editing, fall back to converting from stored CHF
              if (isEditing && transaction) {
                const baseAmount = convert(transaction.pricePerItemChf, 'CHF')
                if (exchangeRates && exchangeRates.rates['USD']) {
                  const usdAmount = baseAmount * exchangeRates.rates['USD']
                  setPricePerItemChf(usdAmount.toString())
                } else {
                  setPriceError(`Could not fetch price for ${ticker}. Please enter price manually.`)
                }
              } else {
                setPriceError(`Could not fetch price for ${ticker}. Please enter price manually.`)
              }
            }
          })
          .catch((err) => {
            // If API fails and we're editing, fall back to converting from stored CHF
            if (isEditing && transaction) {
              const baseAmount = convert(transaction.pricePerItemChf, 'CHF')
              if (exchangeRates && exchangeRates.rates['USD']) {
                const usdAmount = baseAmount * exchangeRates.rates['USD']
                setPricePerItemChf(usdAmount.toString())
              } else {
                setPriceError(`Failed to fetch price for ${ticker}. Please enter price manually.`)
              }
            } else {
              setPriceError(`Failed to fetch price for ${ticker}. Please enter price manually.`)
            }
          })
          .finally(() => {
            setIsLoadingPrice(false)
          })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCrypto, item.name, isEditing]) // Run when modal opens or when editing

  // Fetch stock/index fund/commodity price when modal opens (both for new transactions and when editing)
  useEffect(() => {
    if (isStockCategory && item.name && rapidApiKey) {
      // For editing, always fetch fresh price from API (in USD)
      // For new transactions, fetch if no price is set
      if (isEditing || !pricePerItemChf) {
        const ticker = item.name.trim().toUpperCase()
        setIsLoadingPrice(true)
        setPriceError(null)

        fetchStockPrices([ticker], rapidApiKey)
          .then((prices) => {
            const price = prices[ticker]
            if (price !== undefined && price !== null) {
              // Set the USD price directly from API (always in USD for stocks/index funds/commodities)
              setPricePerItemChf(price.toString())
              setPriceError(null)
            } else {
              // If API fails and we're editing, fall back to converting from stored CHF
              if (isEditing && transaction) {
                const baseAmount = convert(transaction.pricePerItemChf, 'CHF')
                if (exchangeRates && exchangeRates.rates['USD']) {
                  const usdAmount = baseAmount * exchangeRates.rates['USD']
                  setPricePerItemChf(usdAmount.toString())
                } else {
                  setPriceError(`Could not fetch price for ${ticker}. Please enter price manually.`)
                }
              } else {
                setPriceError(`Could not fetch price for ${ticker}. Please enter price manually.`)
              }
            }
          })
          .catch((err) => {
            // If API fails and we're editing, fall back to converting from stored CHF
            if (isEditing && transaction) {
              const baseAmount = convert(transaction.pricePerItemChf, 'CHF')
              if (exchangeRates && exchangeRates.rates['USD']) {
                const usdAmount = baseAmount * exchangeRates.rates['USD']
                setPricePerItemChf(usdAmount.toString())
              } else {
                setPriceError(`Failed to fetch price for ${ticker}. Please enter price manually.`)
              }
            } else {
              setPriceError(`Failed to fetch price for ${ticker}. Please enter price manually.`)
            }
          })
          .finally(() => {
            setIsLoadingPrice(false)
          })
      }
    } else if (isStockCategory && item.name && !rapidApiKey) {
      // Show warning if API key is not configured
      if (!isEditing || !pricePerItemChf) {
        setPriceError('RapidAPI key not configured. Please set it in Settings to fetch prices automatically.')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStockCategory, item.name, isEditing, rapidApiKey]) // Run when modal opens or when editing

  const totalChf = useMemo(() => {
    const parsedAmount = Number(amount)
    if (isNaN(parsedAmount)) {
      return 0
    }
    // For ADJUSTMENT, there's no price, so total is 0
    if (isCrypto && isAdjustmentMode) {
      return 0
    }
    // Use absolute value for calculation
    const absoluteAmount = Math.abs(parsedAmount)
    // For categories without price per item, price is always 1
    const parsedPrice = hidePricePerItem ? 1 : Number(pricePerItemChf)
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        return 0
      }
    // For all categories, total is in the selected currency (not converted to CHF for display)
    // The total will be converted to CHF when saving
    return absoluteAmount * parsedPrice
  }, [amount, pricePerItemChf, hidePricePerItem, isCrypto, isAdjustmentMode])

  // Update target holdings when amount changes (only in amount mode)
  useEffect(() => {
    if (inputMode !== 'amount' || isUpdatingFromHoldings) return
    
    const parsedAmount = Number(amount)
    if (!isNaN(parsedAmount)) {
      setIsUpdatingFromAmount(true)
      // Add the amount (can be positive or negative) to current holdings
      setTargetHoldings((currentHoldings + parsedAmount).toString())
      setIsUpdatingFromAmount(false)
    }
  }, [amount, currentHoldings, isUpdatingFromHoldings, inputMode])

  // Update amount when target holdings changes (only in holdings mode)
  useEffect(() => {
    if (inputMode !== 'balance' || isUpdatingFromAmount) return
    
    const parsedTarget = Number(targetHoldings)
    if (!isNaN(parsedTarget)) {
      setIsUpdatingFromHoldings(true)
      // Calculate the difference (can be positive or negative)
      const calculatedAmount = parsedTarget - currentHoldings
      setAmount(calculatedAmount.toString())
      setIsUpdatingFromHoldings(false)
    }
  }, [targetHoldings, currentHoldings, isUpdatingFromAmount, inputMode])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!date) {
      setError('Please select a date.')
      return
    }

    // Date input already provides YYYY-MM-DD format, use it directly
    const parsedDate = date

    // Handle transaction types for supported categories
    if (canUseAdjustmentMode && transactionType) {
      // Determine currency based on category
      const transactionCurrency = isCrypto || isStockCategory 
        ? 'USD' 
        : (item.currency as CurrencyCode)
      
      switch (transactionType) {
        case 'BUY':
        case 'SELL': {
          const parsedAmount = Number(amount)
          const parsedPrice = hidePricePerItem ? 1 : Number(pricePerItemChf)

          if (!amount || Number.isNaN(parsedAmount) || parsedAmount === 0) {
            setError('Please enter a valid amount (positive for buy, negative for sell).')
            return
          }
          if (!hidePricePerItem) {
            if (!pricePerItemChf || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
              setError('Please enter a valid price per item greater than 0.')
              return
            }
          }

          // In Buy/Sell mode, amount sign determines buy vs sell
          const absoluteAmount = Math.abs(parsedAmount)
          const side: TransactionTab = parsedAmount > 0 ? 'buy' : 'sell'
          const finalTransactionType: CryptoTransactionType = parsedAmount > 0 ? 'BUY' : 'SELL'
          const pricePerItemChfValue = hidePricePerItem 
            ? 1 
            : convert(parsedPrice, transactionCurrency)

          onSave({
            itemId: item.id,
            side,
            currency: transactionCurrency,
            amount: absoluteAmount,
            pricePerItemChf: pricePerItemChfValue,
            pricePerItem: hidePricePerItem ? 1 : parsedPrice,
            date: parsedDate,
            cryptoType: finalTransactionType,
            adjustmentReason: adjustmentReason || undefined,
          })
          break
        }
        case 'ADJUSTMENT': {
          const parsedAmount = Number(amount)

          if (!amount || Number.isNaN(parsedAmount) || parsedAmount === 0) {
            setError('Please enter a valid amount (can be positive or negative, but not zero).')
            return
          }

          // ADJUSTMENT stores the signed amount directly
          // We still need a side for backward compatibility
          const side: TransactionTab = parsedAmount > 0 ? 'buy' : 'sell'

          onSave({
            itemId: item.id,
            side,
            currency: transactionCurrency,
            amount: parsedAmount, // Store signed amount for ADJUSTMENT
            pricePerItemChf: 0, // ADJUSTMENT doesn't have a price
            pricePerItem: 0,
            date: parsedDate,
            cryptoType: 'ADJUSTMENT',
            adjustmentReason: adjustmentReason || undefined,
          })
          break
        }
      }
    } else {
      // Non-Crypto or legacy transactions
      const parsedAmount = Number(amount)
      const parsedPrice = hidePricePerItem ? 1 : Number(pricePerItemChf)

      if (!amount || Number.isNaN(parsedAmount) || parsedAmount === 0) {
        setError('Please enter a valid amount (positive for buy, negative for sell).')
        return
      }
      if (!hidePricePerItem) {
        if (!pricePerItemChf || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
          setError('Please enter a valid price per item greater than 0.')
          return
        }
      }

      const side: TransactionTab = parsedAmount > 0 ? 'buy' : 'sell'
      const absoluteAmount = Math.abs(parsedAmount)
      const transactionCurrency = (isCrypto || isStockCategory) ? 'USD' : (item.currency as CurrencyCode)
      const pricePerItemChfValue = convert(parsedPrice, transactionCurrency)

      onSave({
        itemId: item.id,
        side,
        currency: transactionCurrency,
        amount: absoluteAmount,
        pricePerItemChf: pricePerItemChfValue,
        pricePerItem: parsedPrice,
        date: parsedDate,
        adjustmentReason: adjustmentReason || undefined,
      })
    }

    // Reset form
    setAmount('0')
    setPricePerItemChf('')
    setAdjustmentReason('')
    if (canUseAdjustmentMode) {
      setIsAdjustmentMode(false)
    }
    // Reset date to today in YYYY-MM-DD format
    const now = new Date()
    setDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-bg-surface-1 border border-border-strong rounded-card shadow-card px-3 py-3 lg:p-6 relative max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <Heading level={2} className="mb-4">
          {isEditing 
            ? `Edit Transaction – ${item.name}`
            : `Add Transaction – ${item.name}`
          }
        </Heading>

        {error && (
          <div className="mb-3 text-[0.567rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Transaction Mode Selection - Switch Button (for supported categories) */}
          {canUseAdjustmentMode && (
            <div>
              <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                Transaction Mode
              </label>
              <div className="relative inline-flex rounded-lg bg-bg-surface-2 border border-border-subtle p-1 w-full" role="group">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentMode(false)}
                  className={`flex-1 px-3 py-2 text-[0.567rem] md:text-xs font-medium rounded-md transition-all duration-200 ${
                    !isAdjustmentMode
                      ? 'bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] shadow-card'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Buy/Sell
                </button>
                <button
                  type="button"
                  onClick={() => setIsAdjustmentMode(true)}
                  className={`flex-1 px-3 py-2 text-[0.567rem] md:text-xs font-medium rounded-md transition-all duration-200 ${
                    isAdjustmentMode
                      ? 'bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] shadow-card'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Adjustment
                </button>
              </div>
            </div>
          )}

          {/* Input Mode Selection - Switch Button */}
          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
              Input Mode
            </label>
            <div className="relative inline-flex rounded-lg bg-bg-surface-2 border border-border-subtle p-1 w-full" role="group">
              <button
                type="button"
                onClick={() => setInputMode('amount')}
                className={`flex-1 px-3 py-2 text-[0.567rem] md:text-xs font-medium rounded-md transition-all duration-200 ${
                  inputMode === 'amount'
                    ? 'bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] shadow-card'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Amount
              </button>
              <button
                type="button"
                onClick={() => setInputMode('balance')}
                className={`flex-1 px-3 py-2 text-[0.567rem] md:text-xs font-medium rounded-md transition-all duration-200 ${
                  inputMode === 'balance'
                    ? 'bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] shadow-card'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                End Holdings
              </button>
            </div>
          </div>

          {/* Amount Input (shown when inputMode === 'amount') */}
          {inputMode === 'amount' && (
            <div>
              <label
                className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                htmlFor="tx-amount"
              >
                Amount (holdings)
              </label>
              <input
                id="tx-amount"
                type="number"
                step={(isCrypto || isStockCategory) ? "0.00000001" : "0.0001"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                placeholder={canUseAdjustmentMode && isAdjustmentMode ? "Can be positive or negative" : "Positive for buy, negative for sell"}
              />
            </div>
          )}

          {/* Target Holdings Input (shown when inputMode === 'balance') */}
          {inputMode === 'balance' && (
            <div>
              <label
                className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                htmlFor="tx-target-holdings"
              >
                End Holdings
              </label>
              <input
                id="tx-target-holdings"
                type="number"
                step={(isCrypto || isStockCategory) ? "0.00000001" : "0.0001"}
                value={targetHoldings}
                onChange={(e) => setTargetHoldings(e.target.value)}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                placeholder="Total holdings after this transaction"
              />
            </div>
          )}

          {/* Only show price per item field for categories that need it and for BUY/SELL transactions */}
          {!hidePricePerItem && canUseAdjustmentMode && !isAdjustmentMode && isCrypto && (
            <div>
              <label
                className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                htmlFor="tx-price"
              >
                Price per Item (USD)
                {isLoadingPrice && (
                  <span className="ml-2 text-text-muted text-[0.4725rem] md:text-[0.567rem]">(fetching...)</span>
                )}
              </label>
              <input
                id="tx-price"
                type="number"
                min="0"
                step="any"
                value={pricePerItemChf}
                onChange={(e) => setPricePerItemChf(e.target.value)}
                className={`w-full bg-bg-surface-2 border rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue ${
                  priceError ? 'border-warning' : 'border-border-subtle'
                }`}
                placeholder="e.g. 50000, 3000, 1.00"
                disabled={isLoadingPrice}
              />
              {priceError && (
                <p className="mt-1 text-[0.4725rem] md:text-[0.567rem] text-warning">
                  {priceError}
                </p>
              )}
            </div>
          )}
          {!hidePricePerItem && (!canUseAdjustmentMode || !isAdjustmentMode) && !isCrypto && (
            <div>
              <label
                className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                htmlFor="tx-price"
              >
                Price per Item ({item.currency})
                {isLoadingPrice && isStockCategory && (
                  <span className="ml-2 text-text-muted text-[0.4725rem] md:text-[0.567rem]">(fetching...)</span>
                )}
              </label>
              <input
                id="tx-price"
                type="number"
                min="0"
                step="0.01"
                value={pricePerItemChf}
                onChange={(e) => setPricePerItemChf(e.target.value)}
                className={`w-full bg-bg-surface-2 border rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue ${
                  priceError ? 'border-warning' : 'border-border-subtle'
                }`}
                placeholder="e.g. 150.50"
                disabled={isLoadingPrice && isStockCategory}
              />
              {priceError && (
                <p className="mt-1 text-[0.4725rem] md:text-[0.567rem] text-warning">
                  {priceError}
                </p>
              )}
            </div>
          )}

            <div>
            <label
              className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
              htmlFor="tx-total-balance"
            >
              Total balance of this transaction ({(isCrypto || isStockCategory) ? 'USD' : item.currency})
              </label>
            <input
              id="tx-total-balance"
              type="text"
              value={totalChf !== 0 ? totalChf.toFixed(2) : ''}
              readOnly
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-muted text-xs md:text-sm cursor-not-allowed"
              placeholder="Calculated automatically"
            />
              </div>

          <div>
            <label
              className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
              htmlFor="tx-date"
            >
              Date (DD/MM/YYYY)
            </label>
            <div className="relative flex items-center">
              <input
                id="tx-date-display"
                type="text"
                value={date ? formatDate(date) : ''}
                readOnly
                onClick={() => {
                  const dateInput = document.getElementById('tx-date') as HTMLInputElement
                  if (dateInput) {
                    if (dateInput.showPicker) {
                      dateInput.showPicker()
                    } else {
                      dateInput.click()
                    }
                  }
                }}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 pr-10 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue cursor-pointer"
                placeholder="DD/MM/YYYY"
              />
            <input
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
                className="absolute right-0 opacity-0 w-10 h-full cursor-pointer"
                style={{ cursor: 'pointer' }}
              />
              <button
                type="button"
                onClick={() => {
                  const dateInput = document.getElementById('tx-date') as HTMLInputElement
                  if (dateInput) {
                    if (dateInput.showPicker) {
                      dateInput.showPicker()
                    } else {
                      dateInput.click()
                    }
                  }
                }}
                className="absolute right-2 cursor-pointer text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Reason/Note field (available for all transaction types) - always at the bottom */}
          <div>
            <label
              className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
              htmlFor="transaction-reason"
            >
              Reason/Note (optional)
            </label>
            <input
              id="transaction-reason"
              type="text"
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              placeholder={canUseAdjustmentMode && isAdjustmentMode ? "e.g., Perp PnL, Manual correction, Fee adjustment" : "e.g., Purchase note, Sale reason, Transaction details"}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-[0.567rem] md:text-xs bg-bg-surface-2 border border-border-subtle text-text-primary hover:bg-bg-surface-3 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-full text-[0.567rem] md:text-xs bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] font-semibold hover:brightness-110 transition-all duration-200 shadow-card"
            >
              {isEditing ? 'Save Changes' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Show Transactions Modal
interface ShowTransactionsModalProps {
  item: NetWorthItem
  transactions: NetWorthTransaction[]
  cryptoPrices?: Record<string, number>
  platforms: Platform[]
  onClose: () => void
  onEdit: (transactionId: string) => void
  onDelete: (transactionId: string) => void
}

function ShowTransactionsModal({ item, transactions, cryptoPrices = {}, platforms, onClose, onEdit, onDelete }: ShowTransactionsModalProps) {
  const { baseCurrency, convert, exchangeRates } = useCurrency()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch')
  const formatUsd = (value: number) => formatMoney(value, 'USD', 'ch')
  const isCrypto = item.category === 'Crypto'
  
  // Calculate balance - Crypto always in USD, others in baseCurrency
  let balanceConverted: number
  if (isCrypto) {
    const coinAmount = calculateCoinAmount(item.id, transactions)
    const ticker = item.name.trim().toUpperCase()
    const currentPriceUsd = cryptoPrices[ticker] || 0
    if (currentPriceUsd > 0) {
      // Crypto is always USD, no conversion
      balanceConverted = coinAmount * currentPriceUsd
    } else {
      // Fallback: reconstruct USD from stored value
      const balanceChf = calculateBalanceChf(item.id, transactions, item, cryptoPrices)
      balanceConverted = convert(balanceChf, 'CHF') * (exchangeRates?.rates['USD'] || 1)
    }
  } else {
    // For non-Crypto, balance is already in CHF, convert to baseCurrency
    balanceConverted = convert(calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert), 'CHF')
  }
  const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4 lg:pl-[270px]" onClick={onClose}>
      <div className="w-full max-w-6xl bg-bg-surface-1 border border-border-strong rounded-card shadow-card px-3 py-3 lg:p-6 relative max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <Heading level={2} className="mb-4">
          Transactions – {item.name}
        </Heading>

        {/* Balance */}
        <div className="mb-6 p-4 bg-bg-surface-2 rounded-input">
          <div className="text-text-secondary text-[0.567rem] md:text-xs mb-1">Balance</div>
          <TotalText variant="neutral">{isCrypto ? formatUsd(balanceConverted) : formatCurrency(balanceConverted)}</TotalText>
        </div>

        {/* Transactions Table */}
        {sortedTransactions.length === 0 ? (
          <div className="text-text-secondary text-[0.567rem] md:text-xs text-center py-8">
            No transactions found.
          </div>
        ) : (
          <div className="overflow-x-auto" style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#39404A #11151C'
          }}>
            <style>{`
              div.overflow-x-auto::-webkit-scrollbar {
                height: 10px;
              }
              div.overflow-x-auto::-webkit-scrollbar-track {
                background: #11151C;
                border-radius: 5px;
              }
              div.overflow-x-auto::-webkit-scrollbar-thumb {
                background: #39404A;
                border-radius: 5px;
                border: 2px solid #11151C;
              }
              div.overflow-x-auto::-webkit-scrollbar-thumb:hover {
                background: #4A5568;
              }
            `}</style>
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left py-2 px-3 text2 font-bold">Date</th>
                  <th className="text-left py-2 px-3 text2 font-bold">Side</th>
                  <th className="text-left py-2 px-3 text2 font-bold">Currency</th>
                  <th className="text-right py-2 px-3 text2 font-bold">Amount</th>
                  <th className="text-right py-2 px-3 text2 font-bold">{isCrypto ? 'Price per item (USD)' : 'Price per item'}</th>
                  <th className="text-right py-2 px-3 text2 font-bold">Total</th>
                  <th className="text-left py-2 px-3 text2 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTransactions.map((tx) => {
                  // Crypto transactions are always in USD, others use baseCurrency
                  let totalConverted: number
                  let priceDisplay: string
                  
                  // Check if this is an ADJUSTMENT transaction (no price)
                  const isAdjustment = tx.cryptoType === 'ADJUSTMENT'
                  
                  if (isAdjustment) {
                    // ADJUSTMENT doesn't have a price
                    totalConverted = 0
                    priceDisplay = '—'
                  } else if (isCrypto) {
                    // Reconstruct original USD price from stored value
                    // When saving: convert(usdPrice, 'USD') converts FROM USD TO baseCurrency_at_save_time
                    // To reverse: usdPrice = stored * rates['USD']_at_save_time
                    // We approximate by treating stored as current baseCurrency, then convert to USD
                    let usdPrice: number
                    if (exchangeRates && exchangeRates.rates['USD']) {
                      // The stored value is in baseCurrency_at_save_time
                      // We approximate by treating it as current baseCurrency
                      // Then: USD = stored * rates['USD'] (where rates['USD'] is USD per 1 baseCurrency)
                      usdPrice = tx.pricePerItemChf * exchangeRates.rates['USD']
                    } else {
                      // Fallback: assume stored value is already USD
                      usdPrice = tx.pricePerItemChf
                    }
                    
                    // Calculate total in USD (Crypto is always USD)
                    totalConverted = tx.amount * usdPrice
                    
                    // Display price in USD
                    priceDisplay = formatUsd(usdPrice)
                  } else {
                    // Check if this is a transaction where amount is the total value (pricePerItemChf === 1)
                    if (tx.pricePerItemChf === 1) {
                      // Amount is the total value in the selected currency
                      totalConverted = tx.amount // Already in original currency
                      priceDisplay = '—' // No price per item for these transactions
                    } else if (tx.pricePerItem !== undefined && tx.currency) {
                      // Use original price per item in original currency
                      const totalInOriginalCurrency = tx.amount * tx.pricePerItem
                      totalConverted = totalInOriginalCurrency // Keep in original currency
                      priceDisplay = formatMoney(tx.pricePerItem, tx.currency as CurrencyCode, 'ch')
                    } else {
                      // Fallback: convert from CHF
                      const totalChf = tx.amount * tx.pricePerItemChf
                      totalConverted = convert(totalChf, 'CHF')
                    const priceConverted = convert(tx.pricePerItemChf, 'CHF')
                    priceDisplay = formatCurrency(priceConverted)
                    }
                  }
                  
                  // Determine transaction type display and sign
                  let typeDisplay: string
                  let typeColor: string
                  let sign: string
                  let amountDisplay: string
                  
                  if (tx.cryptoType === 'ADJUSTMENT') {
                    typeDisplay = 'Adjustment'
                    typeColor = 'text-purple-400'
                    sign = tx.amount >= 0 ? '+' : '-'
                    amountDisplay = tx.amount.toString()
                  } else {
                    // BUY/SELL or legacy
                    typeDisplay = tx.side === 'buy' ? 'Buy' : 'Sell'
                    typeColor = tx.side === 'buy' ? 'text-green-400' : 'text-red-400'
                    sign = tx.side === 'buy' ? '+' : '-'
                    amountDisplay = tx.amount.toString()
                  }
                  
                  return (
                    <tr key={tx.id} className="border-b border-border-subtle">
                      <td className="py-2 px-3 text2">{formatDate(tx.date)}</td>
                      <td className="py-2 px-3 text2">
                        <span className={typeColor}>
                          {typeDisplay}
                        </span>
                        {tx.adjustmentReason && (
                          <div className="text-[0.4725rem] text-text-muted mt-0.5">
                            {tx.adjustmentReason}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text2">{tx.currency}</td>
                      <td className="py-2 px-3 text2 text-right">{amountDisplay}</td>
                      <td className="py-2 px-3 text2 text-right">{priceDisplay}</td>
                      <td className="py-2 px-3 text2 text-right">
                        {isAdjustment ? (
                          <span className="text-text-muted">—</span>
                        ) : (
                          <span className={typeColor}>
                            {sign}{isCrypto 
                              ? formatUsd(totalConverted) 
                              : formatMoney(Math.abs(totalConverted), tx.currency as CurrencyCode, 'ch')
                            }
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onEdit(tx.id)}
                            className="p-1.5 hover:bg-bg-surface-2 rounded-input transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4 text-text-secondary hover:text-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this transaction?')) {
                                onDelete(tx.id)
                              }
                            }}
                            className="p-1.5 hover:bg-bg-surface-2 rounded-input transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4 text-text-secondary hover:text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border-subtle">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full text-[0.567rem] md:text-xs bg-bg-surface-2 border border-border-subtle text-text-primary hover:bg-bg-surface-3 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default NetWorth
