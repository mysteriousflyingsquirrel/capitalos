import React, { useState, useMemo, FormEvent, useRef, useEffect } from 'react'
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import { useIncognito } from '../contexts/IncognitoContext'
import { formatMoney, formatNumber } from '../lib/currency'
import { formatDate, formatDateInput, parseDateInput, getCurrentDateFormatted } from '../lib/dateFormat'
import type { CurrencyCode } from '../lib/currency'
import { fetchCoinPrice } from '../services/coinGeckoService'
import {
  saveNetWorthItems,
  loadNetWorthItems,
  saveNetWorthTransactions,
  loadNetWorthTransactions,
  loadPlatforms,
  type Platform,
} from '../services/storageService'

// TypeScript types
type NetWorthCategory =
  | 'Cash'
  | 'Bank Accounts'
  | 'Funds'
  | 'Stocks'
  | 'Commodities'
  | 'Crypto'
  | 'Real Estate'
  | 'Inventory'

export interface NetWorthItem {
  id: string
  category: NetWorthCategory
  name: string
  platform: string
  currency: string
}

type TransactionSide = 'buy' | 'sell'

export interface NetWorthTransaction {
  id: string
  itemId: string
  side: TransactionSide
  currency: string
  amount: number
  pricePerItemChf: number // Kept for backward compatibility, but will be calculated from pricePerItem and currency
  pricePerItem?: number // Original price per item in original currency (optional for backward compatibility)
  date: string
}

// Empty data - user will add their own data
const mockNetWorthItems: NetWorthItem[] = []
const initialMockTransactions: NetWorthTransaction[] = []

// Category order
const categoryOrder: NetWorthCategory[] = [
  'Cash',
  'Bank Accounts',
  'Funds',
  'Stocks',
  'Commodities',
  'Crypto',
  'Real Estate',
  'Inventory',
]

// Helper function to format CHF
// formatChf will be replaced with currency-aware formatting in the component

// Helper function to calculate balance from transactions
// NOTE: For Crypto items with current prices, this returns USD value (not CHF)
// Callers must convert USD to CHF using the convert function
// For Crypto items without current prices, falls back to transaction-based calculation (returns CHF)
export function calculateBalanceChf(
  itemId: string, 
  transactions: NetWorthTransaction[], 
  item?: NetWorthItem,
  currentCryptoPrices?: Record<string, number>,
  convert?: (amount: number, from: CurrencyCode) => number
): number {
  // For Crypto items, use current price * coin amount
  if (item?.category === 'Crypto' && currentCryptoPrices && item.name) {
    const coinAmount = calculateCoinAmount(itemId, transactions)
    const ticker = item.name.trim().toUpperCase()
    const currentPrice = currentCryptoPrices[ticker]
    if (currentPrice !== undefined && currentPrice > 0) {
      // Price is in USD - returns USD value, caller must convert to CHF
      return coinAmount * currentPrice
    }
  }
  
  // For non-Crypto items or Crypto without current prices, use transaction-based calculation
  // Returns CHF (converts from original currency if available)
  const categoriesWithoutPricePerItem: NetWorthCategory[] = ['Cash', 'Bank Accounts', 'Real Estate', 'Inventory']
  const isCategoryWithoutPricePerItem = item && categoriesWithoutPricePerItem.includes(item.category)
  
  return transactions
    .filter(tx => tx.itemId === itemId)
    .reduce((sum, tx) => {
      const txValue = tx.amount * (tx.side === 'buy' ? 1 : -1)
      
      // For categories without price per item, amount is the total value in the selected currency
      // When pricePerItemChf is 1, it means amount is the total value
      if (isCategoryWithoutPricePerItem || tx.pricePerItemChf === 1) {
        if (tx.currency && convert) {
          // Convert amount from original currency to CHF
          return sum + convert(txValue, tx.currency as CurrencyCode)
        }
        // Fallback: assume CHF
        return sum + txValue
      }
      
      // For categories with price per item, use pricePerItem and currency if available
      if (tx.pricePerItem !== undefined && tx.currency && convert) {
        const priceInOriginalCurrency = tx.pricePerItem
        const totalInOriginalCurrency = txValue * priceInOriginalCurrency
        // Convert to CHF
        return sum + convert(totalInOriginalCurrency, tx.currency as CurrencyCode)
      }
      // Fallback: use pricePerItemChf (already in CHF)
      return sum + txValue * tx.pricePerItemChf
    }, 0)
}

/**
 * Calculate the total amount of coins (quantity) for an item
 * @param itemId - The item ID
 * @param transactions - Array of transactions
 * @returns Total amount of coins (buy transactions add, sell transactions subtract)
 */
export function calculateCoinAmount(itemId: string, transactions: NetWorthTransaction[]): number {
  return transactions
    .filter(tx => tx.itemId === itemId)
    .reduce((sum, tx) => sum + (tx.side === 'buy' ? 1 : -1) * tx.amount, 0)
}

// Helper component: NetWorthCategorySection
interface NetWorthCategorySectionProps {
  category: NetWorthCategory
  items: NetWorthItem[]
  transactions: NetWorthTransaction[]
  cryptoPrices?: Record<string, number>
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
      // For crypto fallback, reconstruct USD from stored value
      const balanceChf = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
      // This is stored in CHF but represents USD originally, so convert back
      return sum + convert(balanceChf, 'CHF') * (exchangeRates?.rates['USD'] || 1)
    }
    // For non-Crypto, balance is already in CHF, convert to baseCurrency
    return sum + convert(calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert), 'CHF')
  }, 0)
  
  // For Crypto, also calculate the subtotal in baseCurrency
  const subtotalInBaseCurrency = category === 'Crypto' ? convert(subtotal, 'USD') : subtotal

  return (
    <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <div className="mb-6 pb-4 border-b border-border-strong">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Heading level={2}>{category}</Heading>
                  {category === 'Crypto' ? (
                    <>
                      <TotalText variant={subtotalInBaseCurrency >= 0 ? 'inflow' : 'outflow'} className="block mt-1">
                        {formatCurrency(subtotalInBaseCurrency)}
                      </TotalText>
                      <TotalText variant={subtotal >= 0 ? 'inflow' : 'outflow'} className="block mt-1">
                        {formatUsd(subtotal)}
                      </TotalText>
                    </>
                  ) : (
                    <TotalText variant={subtotal >= 0 ? 'inflow' : 'outflow'} className="block mt-1">
                      {formatCurrency(subtotal)}
                    </TotalText>
                  )}
                </div>
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
            <span>{category === 'Crypto' ? 'Add Coin' : 'Add Item'}</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {/* Table structure for proper column alignment */}
        <div className="overflow-x-auto">
          <table className="w-full" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              {category === 'Crypto' ? (
                <>
                  <col style={{ width: '70px' }} />
                  <col style={{ width: 'calc((100% - 150px) / 3)' }} />
                  <col style={{ width: 'calc((100% - 150px) / 3)' }} />
                  <col style={{ width: 'calc((100% - 150px) / 3)' }} />
                  <col style={{ width: '80px' }} />
                </>
              ) : (
                <>
                  <col style={{ width: 'calc((100% - 80px) / 3)' }} />
                  <col style={{ width: 'calc((100% - 80px) / 3)' }} />
                  <col style={{ width: 'calc((100% - 80px) / 3)' }} />
                  <col style={{ width: '80px' }} />
                </>
              )}
            </colgroup>
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left pb-2">
                  <Heading level={4}>{category === 'Crypto' ? 'Coin' : 'Item'}</Heading>
                </th>
                {category === 'Crypto' && (
                  <th className="text-right pb-2">
                    <Heading level={4}>Holdings</Heading>
                  </th>
                )}
                <th className="text-right pb-2">
                  <Heading level={4}>Balance</Heading>
                </th>
                <th className="text-right pb-2">
                  <Heading level={4}>Platform</Heading>
                </th>
                <th className="text-right pb-2">
                  <Heading level={4}>Actions</Heading>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={category === 'Crypto' ? 5 : 4} className="py-4 text-center text-text-muted text-[0.567rem] md:text-xs">
                    No items yet. Click "Add Item" to get started.
                  </td>
                </tr>
              ) : (
                // Sort items by balance (high to low)
                [...items].sort((a, b) => {
                  // Calculate balance for item a - Crypto always in USD, others in baseCurrency
                  let balanceA: number
                  if (category === 'Crypto') {
                    const coinAmountA = calculateCoinAmount(a.id, transactions)
                    const tickerA = a.name.trim().toUpperCase()
                    const currentPriceUsdA = cryptoPrices[tickerA] || 0
                    if (currentPriceUsdA > 0) {
                      // Crypto is always USD, no conversion
                      balanceA = coinAmountA * currentPriceUsdA
                    } else {
                      // Fallback: reconstruct USD from stored value
                      const balanceChf = calculateBalanceChf(a.id, transactions, a, cryptoPrices, convert)
                      const { exchangeRates: rates } = useCurrency()
                      balanceA = convert(balanceChf, 'CHF') * (rates?.rates['USD'] || 1)
                    }
                  } else {
                    balanceA = convert(calculateBalanceChf(a.id, transactions, a, cryptoPrices, convert), 'CHF')
                  }

                  // Calculate balance for item b - Crypto always in USD, others in baseCurrency
                  let balanceB: number
                  if (category === 'Crypto') {
                    const coinAmountB = calculateCoinAmount(b.id, transactions)
                    const tickerB = b.name.trim().toUpperCase()
                    const currentPriceUsdB = cryptoPrices[tickerB] || 0
                    if (currentPriceUsdB > 0) {
                      // Crypto is always USD, no conversion
                      balanceB = coinAmountB * currentPriceUsdB
                    } else {
                      // Fallback: reconstruct USD from stored value
                      const balanceChf = calculateBalanceChf(b.id, transactions, b, cryptoPrices, convert)
                      const { exchangeRates: rates } = useCurrency()
                      balanceB = convert(balanceChf, 'CHF') * (rates?.rates['USD'] || 1)
                    }
                  } else {
                    balanceB = convert(calculateBalanceChf(b.id, transactions, b, cryptoPrices, convert), 'CHF')
                  }

                  // Sort high to low
                  return balanceB - balanceA
                }).map((item) => {
                  // For Crypto, calculate balance as coin amount * current price (always USD)
                  let balanceConverted: number
                  if (category === 'Crypto') {
                    const coinAmount = calculateCoinAmount(item.id, transactions)
                    const ticker = item.name.trim().toUpperCase()
                    const currentPriceUsd = cryptoPrices[ticker] || 0
                    if (currentPriceUsd > 0) {
                      // Crypto is always USD, no conversion
                      balanceConverted = coinAmount * currentPriceUsd
                    } else {
                      // Fallback: reconstruct USD from stored value
                      const balanceChf = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
                      balanceConverted = convert(balanceChf, 'CHF') * (exchangeRates?.rates['USD'] || 1)
                    }
                  } else {
                    balanceConverted = convert(calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert), 'CHF')
                  }
                  const coinAmount = category === 'Crypto' ? calculateCoinAmount(item.id, transactions) : 0
                  return (
                    <tr key={item.id} className="border-b border-border-subtle last:border-b-0">
                      <td className="py-2">
                        <div className="text2 truncate">{item.name}</div>
                      </td>
                      {category === 'Crypto' && (
                        <td className="py-2 text-right">
                          <div className="text2 whitespace-nowrap">
                            {formatCoinAmount(coinAmount, isIncognito)}
                          </div>
                        </td>
                      )}
                      <td className="py-2 text-right">
                        <div className="text2 whitespace-nowrap">
                          {category === 'Crypto' ? formatUsd(balanceConverted) : formatCurrency(balanceConverted)}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text2 truncate">{item.platform}</span>
                          {platforms.length > 0 && !platforms.some(p => p.name === item.platform) && (
                            <svg
                              className="w-4 h-4 text-warning flex-shrink-0"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                              title="Platform has been removed. Please update this item."
                            >
                              <path
                                fillRule="evenodd"
                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center justify-end -space-x-1">
                          <button
                            onClick={() => onAddTransaction(item.id)}
                            className="p-1.5 hover:bg-bg-surface-2 rounded-input transition-colors"
                            title="Add Transaction"
                          >
                            <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        className="p-1.5 hover:bg-bg-surface-2 rounded-input transition-colors"
        title="Options"
      >
        <svg className="w-4 h-4 text-text-secondary" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      </button>
      {menuOpen && menuPosition && (
        <div
          ref={menuRef}
          className="fixed z-[100] bg-bg-surface-1 border border-border-strong rounded-card shadow-card py-2 min-w-[180px]"
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
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch', { incognito: isIncognito })
  
  // Load data from Firestore on mount
  const [netWorthItems, setNetWorthItems] = useState<NetWorthItem[]>([])
  const [transactions, setTransactions] = useState<NetWorthTransaction[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  // Store current crypto prices (ticker -> USD price)
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({})
  const [cryptoPricesLastUpdate, setCryptoPricesLastUpdate] = useState<number>(0)

  // Load data from Firestore on mount and when uid changes
  useEffect(() => {
    if (!uid) {
      setNetWorthItems([])
      setTransactions([])
      setDataLoading(false)
      return
    }

    const loadData = async () => {
      setDataLoading(true)
      try {
        const defaultPlatforms: Platform[] = [
          { id: 'physical', name: 'Physical', order: 0 },
          { id: 'raiffeisen', name: 'Raiffeisen', order: 0 },
          { id: 'revolut', name: 'Revolut', order: 0 },
          { id: 'yuh', name: 'yuh!', order: 0 },
          { id: 'saxo', name: 'SAXO', order: 0 },
          { id: 'kraken', name: 'Kraken', order: 0 },
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
        const [items, txs, loadedPlatforms] = await Promise.all([
          loadNetWorthItems(mockNetWorthItems, uid),
          loadNetWorthTransactions(initialMockTransactions, uid),
          loadPlatforms(defaultPlatforms, uid),
        ])
        setNetWorthItems(items)
        setTransactions(txs)
        setPlatforms(loadedPlatforms)
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setDataLoading(false)
      }
    }

    loadData()
  }, [uid])

  // Save to Firestore whenever data changes
  useEffect(() => {
    if (uid && !dataLoading) {
      saveNetWorthItems(netWorthItems, uid).catch((error) => {
        console.error('Failed to save net worth items:', error)
      })
    }
  }, [netWorthItems, uid, dataLoading])

  useEffect(() => {
    if (uid && !dataLoading) {
      saveNetWorthTransactions(transactions, uid).catch((error) => {
        console.error('Failed to save transactions:', error)
      })
    }
  }, [transactions, uid, dataLoading])

  // Fetch crypto prices for all crypto items
  const fetchAllCryptoPrices = async () => {
    const cryptoItems = netWorthItems.filter(item => item.category === 'Crypto')
    if (cryptoItems.length === 0) return

    const tickers = cryptoItems.map(item => item.name.trim().toUpperCase())
    const uniqueTickers = [...new Set(tickers)]
    
    const pricePromises = uniqueTickers.map(async (ticker) => {
      try {
        const price = await fetchCoinPrice(ticker)
        return { ticker, price: price || null }
      } catch (error) {
        return { ticker, price: null }
      }
    })

    const results = await Promise.all(pricePromises)
    const newPrices: Record<string, number> = {}
    
    results.forEach(({ ticker, price }) => {
      if (price !== null) {
        newPrices[ticker] = price
      }
    })

    setCryptoPrices(prev => ({ ...prev, ...newPrices }))
    setCryptoPricesLastUpdate(Date.now())
  }

  // Fetch prices on mount and set up hourly interval
  useEffect(() => {
    // Fetch immediately
    fetchAllCryptoPrices()

    // Set up interval to fetch every hour (3600000 ms)
    const interval = setInterval(() => {
      fetchAllCryptoPrices()
    }, 3600000) // 1 hour

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netWorthItems]) // Re-fetch when crypto items change
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

  const totalNetWorth = useMemo(
    () => netWorthItems.reduce((sum, item) => {
      if (item.category === 'Crypto') {
        // For Crypto: use current price * coin amount (always in USD)
        // But convert to baseCurrency for the total
        const coinAmount = calculateCoinAmount(item.id, transactions)
        const ticker = item.name.trim().toUpperCase()
        const currentPriceUsd = cryptoPrices[ticker] || 0
        if (currentPriceUsd > 0) {
          // Crypto is in USD, convert to baseCurrency for total
          const cryptoValueUsd = coinAmount * currentPriceUsd
          return sum + convert(cryptoValueUsd, 'USD')
        }
        // Fallback: reconstruct USD from stored value, then convert to baseCurrency
        const balanceChf = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
        const cryptoValueUsd = convert(balanceChf, 'CHF') * (exchangeRates?.rates['USD'] || 1)
        return sum + convert(cryptoValueUsd, 'USD')
      }
      // For non-Crypto items, balance is already in CHF, convert to baseCurrency
      return sum + convert(calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert), 'CHF')
    }, 0),
    [netWorthItems, transactions, cryptoPrices, convert, exchangeRates]
  )


  const handleAddItem = (
    category: NetWorthCategory,
    data: { name: string; currency: string; platform: string }
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
    }

    setNetWorthItems((prev) => [...prev, newItem])
    // Don't close the modal here - let the modal close itself after transaction is saved
    
    // Return the item ID so it can be used for creating the transaction
    return id
  }
  
  const handleAddItemWithTransaction = (
    category: NetWorthCategory,
    data: { name: string; currency: string; platform: string },
    transactionData?: Omit<NetWorthTransaction, 'id' | 'itemId'>
  ) => {
    const itemId = handleAddItem(category, data)
    
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
      
      setTransactions((prev) => [...prev, newTransaction])
    }
  }

  const handleAddTransaction = (itemId: string) => {
    setTransactionItemId(itemId)
  }

  const handleSaveTransaction = (transaction: Omit<NetWorthTransaction, 'id'>) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `tx-${Date.now()}`

    const newTransaction: NetWorthTransaction = {
      id,
      ...transaction,
    }

    setTransactions((prev) => [...prev, newTransaction])
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

  const handleUpdateTransaction = (transactionId: string, transaction: Omit<NetWorthTransaction, 'id'>) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === transactionId ? { ...tx, ...transaction } : tx))
    )
    setEditingTransactionId(null)
  }

  const handleDeleteTransaction = (transactionId: string) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== transactionId))
  }

  const handleShowMenu = (itemId: string, buttonElement: HTMLButtonElement) => {
    // This function is kept for interface compatibility but ItemMenu manages its own menu now
  }

  const handleRemoveItem = (itemId: string) => {
    if (window.confirm('Are you sure you want to remove this item? All associated transactions will also be removed.')) {
      setNetWorthItems((prev) => prev.filter(i => i.id !== itemId))
      setTransactions((prev) => prev.filter(tx => tx.itemId !== itemId))
    }
  }

  const handleShowTransactions = (itemId: string) => {
    setShowTransactionsItemId(itemId)
  }

  const handleEditItem = (itemId: string) => {
    setEditingItemId(itemId)
  }

  const handleSaveEditItem = (itemId: string, newName: string, currency: string, platform: string) => {
    setNetWorthItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, name: newName.trim(), currency, platform } : item))
    )
    setEditingItemId(null)
  }

  return (
    <div className="min-h-screen bg-[#050A1A] px-2 py-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Net Worth</Heading>
        
        {/* Total Net Worth */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
          <div className="mb-6 pb-4 border-b border-border-strong">
            <div className="flex flex-col">
              <Heading level={2}>Total Net Worth</Heading>
              <TotalText variant={totalNetWorth >= 0 ? 'inflow' : 'outflow'} className="mt-1">
                {formatCurrency(totalNetWorth)}
              </TotalText>
            </div>
          </div>
        </div>

        {/* Grouped Categories */}
        <div className="space-y-4">
          {categoryOrder.map((category) => {
            const items = groupedItems[category] || []

            return (
              <NetWorthCategorySection
                key={category}
                category={category}
                items={items}
                transactions={transactions}
                cryptoPrices={cryptoPrices}
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
    data: { name: string; currency: string; platform: string }
  ) => string | void // Returns itemId if available
  onSaveTransaction?: (itemId: string, transaction: Omit<NetWorthTransaction, 'id' | 'itemId'>) => void
}

function AddNetWorthItemModal({ category, platforms, onClose, onSubmit, onSaveTransaction }: AddNetWorthItemModalProps) {
  const { convert } = useCurrency()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<CurrencyCode>('CHF')
  const [platform, setPlatform] = useState('Physical')
  const [date, setDate] = useState(getCurrentDateFormatted())
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Please enter an item name.')
      return
    }

    const parsedAmount = Number(amount)
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount greater than 0.')
      return
    }

    if (!date) {
      setError('Please enter a date in DD/MM/YYYY format.')
      return
    }

    // Validate date format
    const parsedDate = parseDateInput(date)
    if (!parsedDate) {
      setError('Please enter a valid date in DD/MM/YYYY format.')
      return
    }

    // Create the item first and get its ID
    const newItemId = onSubmit(category, {
      name: name.trim(),
      currency: currency,
      platform,
    })

    // Create the initial transaction with the amount in the selected currency
    // For all categories, amount represents the total value in the selected currency
    if (onSaveTransaction && newItemId) {
      onSaveTransaction(newItemId, {
        side: 'buy',
        currency: currency,
        amount: parsedAmount, // Store original amount in original currency
        pricePerItemChf: 1, // For all items, amount is the total value
        date: parsedDate,
      })
    }

    // Reset form
    setName('')
    setAmount('')
    setCurrency('CHF')
    setPlatform('Physical')
    setDate(getCurrentDateFormatted())
    
    // Close modal
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-6 relative" onClick={(e) => e.stopPropagation()}>
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

          <div>
            <label
              className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
              htmlFor="nw-amount"
            >
              Amount ({currency})
            </label>
            <input
              id="nw-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              placeholder="e.g. 1000, 5000, 10000"
            />
          </div>

          <div>
            <label
              className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
              htmlFor="nw-currency"
            >
              Currency
            </label>
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
              Date
            </label>
            <input
              id="nw-date"
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="DD/MM/YYYY"
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
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
  onSave: (itemId: string, newName: string, currency: string, platform: string) => void
}

function EditNetWorthItemModal({ item, platforms, onClose, onSave }: EditNetWorthItemModalProps) {
  const isCrypto = item.category === 'Crypto'
  const [name, setName] = useState(item.name)
  const [currency, setCurrency] = useState(item.currency)
  const [platform, setPlatform] = useState(item.platform)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Please enter an item name.')
      return
    }

    onSave(item.id, name.trim(), currency, platform)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-6 relative" onClick={(e) => e.stopPropagation()}>
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

          {isCrypto ? (
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
          ) : (
            <>
              <div>
                <label
                  className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                  htmlFor="edit-currency"
                >
                  Currency
                </label>
                <select
                  id="edit-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input pl-3 pr-8 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                >
                  <option value="CHF">CHF</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
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
  onClose: () => void
  onSave: (transaction: Omit<NetWorthTransaction, 'id'>) => void
}

// Categories that don't need price per item (1 unit = 1 CHF equivalent)
const categoriesWithoutPricePerItem: NetWorthCategory[] = ['Cash', 'Bank Accounts', 'Real Estate', 'Inventory']

type TransactionTab = 'buy' | 'sell'

function AddTransactionModal({ item, transaction, onClose, onSave }: AddTransactionModalProps) {
  const { baseCurrency, convert, exchangeRates } = useCurrency()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch')
  const isEditing = !!transaction
  const needsPricePerItem = !categoriesWithoutPricePerItem.includes(item.category)
  const isCrypto = item.category === 'Crypto'
  
  // For Crypto transactions being edited, convert stored CHF price back to USD for display
  // For non-Crypto, use original pricePerItem if available, otherwise convert from CHF
  const getInitialPrice = () => {
    if (!transaction || !needsPricePerItem) return ''
    if (isCrypto) {
      // For crypto, always fetch from API (handled in useEffect)
      return ''
    }
    // For non-crypto: use original pricePerItem if available, otherwise convert from CHF
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
  
  const [activeTab, setActiveTab] = useState<TransactionTab>(transaction?.side || 'buy')
  const [amount, setAmount] = useState(transaction?.amount.toString() || '')
  const [pricePerItemChf, setPricePerItemChf] = useState(getInitialPrice())
  const [priceCurrency, setPriceCurrency] = useState<CurrencyCode>(
    (transaction?.currency as CurrencyCode) || (item.currency as CurrencyCode) || 'CHF'
  )
  const [date, setDate] = useState(transaction?.date ? formatDateInput(transaction.date) : getCurrentDateFormatted())
  const [error, setError] = useState<string | null>(null)
  const [isLoadingPrice, setIsLoadingPrice] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)

  // Fetch coin price when modal opens for Crypto items (both for new transactions and when editing)
  useEffect(() => {
    if (isCrypto && needsPricePerItem && item.name) {
      // For editing, always fetch fresh price from API (in USD)
      // For new transactions, fetch if no price is set
      if (isEditing || !pricePerItemChf) {
        const ticker = item.name.trim().toUpperCase()
        setIsLoadingPrice(true)
        setPriceError(null)

        fetchCoinPrice(ticker)
          .then((price) => {
            if (price !== null) {
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
  }, [isCrypto, needsPricePerItem, item.name, isEditing]) // Run when modal opens or when editing

  const totalChf = useMemo(() => {
    const parsedAmount = Number(amount)
    if (isNaN(parsedAmount)) {
      return 0
    }
    if (needsPricePerItem) {
      const parsedPrice = Number(pricePerItemChf)
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        return 0
      }
      return parsedAmount * parsedPrice
    } else {
      // For categories without price per item, amount directly represents the value in CHF
      return parsedAmount
    }
  }, [amount, pricePerItemChf, needsPricePerItem])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const parsedAmount = Number(amount)
    const parsedPrice = Number(pricePerItemChf)

    if (!amount || Number.isNaN(parsedAmount)) {
      setError('Please enter a valid amount.')
      return
    }
    if (needsPricePerItem) {
      if (!pricePerItemChf || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
        setError(isCrypto ? 'Please enter a valid price per coin (USD) greater than 0.' : 'Please enter a valid price per item greater than 0.')
        return
      }
    }
    if (!date) {
      setError('Please enter a date in DD/MM/YYYY format.')
      return
    }
    
    // Parse date from DD/MM/YYYY to YYYY-MM-DD for storage
    const parsedDate = parseDateInput(date)
    if (!parsedDate) {
      setError('Please enter a valid date in DD/MM/YYYY format.')
      return
    }

    if (isCrypto && needsPricePerItem) {
      // For Crypto: convert USD price to CHF for storage
      const pricePerCoinChf = convert(parsedPrice, 'USD')
      onSave({
        itemId: item.id,
        side: activeTab,
        currency: 'USD', // Store as USD for crypto
        amount: parsedAmount,
        pricePerItemChf: pricePerCoinChf, // Converted to CHF for storage
        pricePerItem: parsedPrice, // Original price in USD
        date: parsedDate,
      })
    } else {
      const transactionCurrency = needsPricePerItem ? priceCurrency : item.currency
      const pricePerItemChfValue = needsPricePerItem 
        ? convert(parsedPrice, priceCurrency as CurrencyCode)
        : 1
      onSave({
        itemId: item.id,
        side: activeTab,
        currency: transactionCurrency,
        amount: parsedAmount,
        pricePerItemChf: pricePerItemChfValue, // Converted to CHF for backward compatibility
        pricePerItem: needsPricePerItem ? parsedPrice : undefined, // Original price per item in original currency
        date: parsedDate,
      })
    }

    setAmount('')
    setPricePerItemChf('')
    setDate(getCurrentDateFormatted())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-6 relative" onClick={(e) => e.stopPropagation()}>
        <Heading level={2} className="mb-4">
          {isEditing 
            ? `Edit Transaction – ${item.name}`
            : `${activeTab === 'buy' ? 'Add Buy Transaction' : 'Add Sell Transaction'} – ${item.name}`
          }
        </Heading>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-border-subtle">
          <button
            type="button"
            onClick={() => setActiveTab('buy')}
            className={`px-4 py-2 text-[0.567rem] md:text-xs font-medium transition-colors ${
              activeTab === 'buy'
                ? 'text-highlight-yellow border-b-2 border-highlight-yellow'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sell')}
            className={`px-4 py-2 text-[0.567rem] md:text-xs font-medium transition-colors ${
              activeTab === 'sell'
                ? 'text-highlight-yellow border-b-2 border-highlight-yellow'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Sell
          </button>
        </div>

        {error && (
          <div className="mb-3 text-[0.567rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        {/* Read-only item info */}
        <div className="mb-4 p-3 bg-bg-surface-2 rounded-input space-y-1">
          <div className="text-text-secondary text-[0.567rem] md:text-xs">
            <span className="font-medium">Item:</span> {item.name}
          </div>
          <div className="text-text-secondary text-[0.567rem] md:text-xs">
            <span className="font-medium">Category:</span> {item.category}
          </div>
          <div className="text-text-secondary text-[0.567rem] md:text-xs">
            <span className="font-medium">Platform:</span> {item.platform}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
              htmlFor="tx-amount"
            >
              {isCrypto ? 'Amount (coins)' : needsPricePerItem ? 'Amount' : 'Amount (CHF)'}
            </label>
            <input
              id="tx-amount"
              type="number"
              step={isCrypto ? "0.00000001" : "0.01"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              placeholder={needsPricePerItem ? "e.g. 0.5, 100, 1" : "e.g. 1000, 5000, 10000"}
            />
          </div>

          {needsPricePerItem && (
            <>
              <div>
                <label
                  className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                  htmlFor="tx-price"
                >
                  {isCrypto ? 'Price per coin (USD)' : `Price per item (${priceCurrency})`}
                  {isLoadingPrice && (
                    <span className="ml-2 text-text-muted text-[0.4725rem] md:text-[0.567rem]">(fetching...)</span>
                  )}
                </label>
                <input
                  id="tx-price"
                  type="number"
                  min="0"
                  step={isCrypto ? "any" : "0.01"}
                  value={pricePerItemChf}
                  onChange={(e) => setPricePerItemChf(e.target.value)}
                  className={`w-full bg-bg-surface-2 border rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue ${
                    priceError ? 'border-warning' : 'border-border-subtle'
                  }`}
                  placeholder={isCrypto ? "e.g. 50000, 3000, 1.00" : "e.g. 40000, 1.5, 100"}
                  disabled={isLoadingPrice}
                />
                {priceError && (
                  <p className="mt-1 text-[0.4725rem] md:text-[0.567rem] text-warning">
                    {priceError}
                  </p>
                )}
              </div>
              {!isCrypto && (
                <div>
                  <label
                    className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                    htmlFor="tx-price-currency"
                  >
                    Currency for Price per Item
                  </label>
                  <select
                    id="tx-price-currency"
                    value={priceCurrency}
                    onChange={(e) => setPriceCurrency(e.target.value as CurrencyCode)}
                    className="w-full bg-bg-surface-2 border border-border-subtle rounded-input pl-3 pr-8 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                  >
                    <option value="CHF">CHF</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              )}
            </>
          )}

          {needsPricePerItem && (
            <div>
              <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1">
                {activeTab === 'buy' ? 'Total spent' : 'Total sold'} {isCrypto ? '(USD)' : `(${priceCurrency})`}
              </label>
              <div className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm">
                {isCrypto 
                  ? formatMoney(totalChf, 'USD', 'ch')
                  : formatMoney(totalChf, priceCurrency, 'ch')
                }
              </div>
            </div>
          )}

          <div>
            <label
              className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
              htmlFor="tx-date"
            >
              Date
            </label>
            <input
              id="tx-date"
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="DD/MM/YYYY"
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
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
              {isEditing ? 'Save Changes' : (activeTab === 'buy' ? 'Add Buy' : 'Add Sell')}
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-4xl bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-6 relative max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
          <div className="overflow-x-auto">
            <table className="w-full">
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
                  
                  if (isCrypto) {
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
                  
                  const sign = tx.side === 'buy' ? '+' : '-'
                  return (
                    <tr key={tx.id} className="border-b border-border-subtle">
                      <td className="py-2 px-3 text2">{formatDate(tx.date)}</td>
                      <td className="py-2 px-3 text2">
                        <span className={tx.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                          {tx.side === 'buy' ? 'Buy' : 'Sell'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text2">{tx.currency}</td>
                      <td className="py-2 px-3 text2 text-right">{tx.amount}</td>
                      <td className="py-2 px-3 text2 text-right">{priceDisplay}</td>
                      <td className="py-2 px-3 text2 text-right">
                        <span className={tx.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                          {sign}{isCrypto 
                            ? formatUsd(totalConverted) 
                            : formatMoney(Math.abs(totalConverted), tx.currency as CurrencyCode, 'ch')
                          }
                        </span>
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
