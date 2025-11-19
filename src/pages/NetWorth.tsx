import React, { useState, useMemo, FormEvent, useRef, useEffect } from 'react'
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import { formatMoney, formatNumber } from '../lib/currency'
import { formatDate } from '../lib/dateFormat'
import type { CurrencyCode } from '../lib/currency'
import { fetchCoinPrice } from '../services/coinGeckoService'
import {
  saveNetWorthItems,
  loadNetWorthItems,
  saveNetWorthTransactions,
  loadNetWorthTransactions,
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
  pricePerItemChf: number
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
// For Crypto items, this should use current price * coin amount instead
export function calculateBalanceChf(
  itemId: string, 
  transactions: NetWorthTransaction[], 
  item?: NetWorthItem,
  currentCryptoPrices?: Record<string, number>
): number {
  // For Crypto items, use current price * coin amount
  if (item?.category === 'Crypto' && currentCryptoPrices && item.name) {
    const coinAmount = calculateCoinAmount(itemId, transactions)
    const ticker = item.name.trim().toUpperCase()
    const currentPrice = currentCryptoPrices[ticker]
    if (currentPrice !== undefined && currentPrice > 0) {
      // Price is in USD, convert to CHF for balance
      return coinAmount * currentPrice // We'll convert USD to CHF in the display layer
    }
  }
  
  // For non-Crypto items, use the transaction-based calculation
  return transactions
    .filter(tx => tx.itemId === itemId)
    .reduce((sum, tx) => sum + (tx.side === 'buy' ? 1 : -1) * tx.amount * tx.pricePerItemChf, 0)
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
}

// Helper function to format coin amount
function formatCoinAmount(amount: number): string {
  // Format with up to 8 decimal places, removing trailing zeros
  return amount.toFixed(8).replace(/\.?0+$/, '')
}

function NetWorthCategorySection({
  category,
  items,
  transactions,
  cryptoPrices = {},
  onAddClick,
  onAddTransaction,
  onShowMenu,
  onRemoveItem,
  onShowTransactions,
}: NetWorthCategorySectionProps) {
  const { baseCurrency, convert } = useCurrency()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch')
  
  // Calculate subtotal in CHF, then convert to baseCurrency
  const subtotalChf = items.reduce((sum, item) => {
    if (category === 'Crypto') {
      // For Crypto: coin amount * current price
      const coinAmount = calculateCoinAmount(item.id, transactions)
      const ticker = item.name.trim().toUpperCase()
      const currentPriceUsd = cryptoPrices[ticker] || 0
      if (currentPriceUsd > 0) {
        // Convert USD to CHF for balance
        return sum + convert(coinAmount * currentPriceUsd, 'USD')
      }
      // Fallback to transaction-based if price not available
      return sum + calculateBalanceChf(item.id, transactions, item, cryptoPrices)
    }
    return sum + calculateBalanceChf(item.id, transactions, item, cryptoPrices)
  }, 0)
  const subtotal = convert(subtotalChf, 'CHF')

  return (
    <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
      <div className="mb-6 pb-4 border-b border-border-strong">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Heading level={2}>{category}</Heading>
            <TotalText variant={subtotal >= 0 ? 'inflow' : 'outflow'} className="block mt-1">
              {formatCurrency(subtotal)}
            </TotalText>
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
                  <col style={{ width: 'calc((100% - 80px) / 4)' }} />
                  <col style={{ width: 'calc((100% - 80px) / 4)' }} />
                  <col style={{ width: 'calc((100% - 80px) / 4)' }} />
                  <col style={{ width: 'calc((100% - 80px) / 4)' }} />
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
                items.map((item) => {
                  // For Crypto, calculate balance as coin amount * current price
                  let balanceChf: number
                  if (category === 'Crypto') {
                    const coinAmount = calculateCoinAmount(item.id, transactions)
                    const ticker = item.name.trim().toUpperCase()
                    const currentPriceUsd = cryptoPrices[ticker] || 0
                    if (currentPriceUsd > 0) {
                      // Convert USD to CHF for balance
                      balanceChf = convert(coinAmount * currentPriceUsd, 'USD')
                    } else {
                      // Fallback to transaction-based calculation if price not available
                      balanceChf = calculateBalanceChf(item.id, transactions, item, cryptoPrices)
                    }
                  } else {
                    balanceChf = calculateBalanceChf(item.id, transactions, item, cryptoPrices)
                  }
                  const balanceConverted = convert(balanceChf, 'CHF')
                  const coinAmount = category === 'Crypto' ? calculateCoinAmount(item.id, transactions) : 0
                  return (
                    <tr key={item.id} className="border-b border-border-subtle last:border-b-0">
                      <td className="py-2">
                        <div className="text2 truncate">{item.name}</div>
                      </td>
                      {category === 'Crypto' && (
                        <td className="py-2 text-right">
                          <div className="text2 whitespace-nowrap">
                            {formatCoinAmount(coinAmount)}
                          </div>
                        </td>
                      )}
                      <td className="py-2 text-right">
                        <div className="text2 whitespace-nowrap">
                          {formatNumber(balanceConverted, 'ch')}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <div className="text2 truncate">
                          {item.platform}
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
}

function ItemMenu({ itemId, onShowMenu, onRemoveItem, onShowTransactions }: ItemMenuProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  
  return (
    <button
      ref={buttonRef}
      onClick={(e) => {
        e.stopPropagation()
        if (buttonRef.current) {
          onShowMenu(itemId, buttonRef.current)
        }
      }}
      className="p-1.5 hover:bg-bg-surface-2 rounded-input transition-colors"
      title="Options"
    >
      <svg className="w-4 h-4 text-text-secondary" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
      </svg>
    </button>
  )
}

function NetWorth() {
  const { baseCurrency, convert } = useCurrency()
  const { uid } = useAuth()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch')
  
  // Load data from Firestore on mount
  const [netWorthItems, setNetWorthItems] = useState<NetWorthItem[]>([])
  const [transactions, setTransactions] = useState<NetWorthTransaction[]>([])
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
        const [items, txs] = await Promise.all([
          loadNetWorthItems(mockNetWorthItems, uid),
          loadNetWorthTransactions(initialMockTransactions, uid),
        ])
        setNetWorthItems(items)
        setTransactions(txs)
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
  const [showTransactionsItemId, setShowTransactionsItemId] = useState<string | null>(null)
  const [menuOpenItemId, setMenuOpenItemId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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

  const totalNetWorthChf = useMemo(
    () => netWorthItems.reduce((sum, item) => sum + calculateBalanceChf(item.id, transactions), 0),
    [netWorthItems, transactions]
  )
  const totalNetWorth = convert(totalNetWorthChf, 'CHF')

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenItemId(null)
        setMenuPosition(null)
      }
    }

    if (menuOpenItemId) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpenItemId])

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
    const rect = buttonElement.getBoundingClientRect()
    const menuWidth = 180 // min-w-[180px]
    const menuX = rect.left - menuWidth - 8 // 8px gap
    const menuY = rect.top
    
    setMenuOpenItemId(itemId)
    setMenuPosition({ x: menuX, y: menuY })
  }

  const handleRemoveItem = (itemId: string) => {
    if (window.confirm('Are you sure you want to remove this item? All associated transactions will also be removed.')) {
      setNetWorthItems((prev) => prev.filter(i => i.id !== itemId))
      setTransactions((prev) => prev.filter(tx => tx.itemId !== itemId))
      setMenuOpenItemId(null)
      setMenuPosition(null)
    }
  }

  const handleShowTransactions = (itemId: string) => {
    setShowTransactionsItemId(itemId)
    setMenuOpenItemId(null)
    setMenuPosition(null)
  }

  const selectedItem = menuOpenItemId ? netWorthItems.find(i => i.id === menuOpenItemId) : null

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
                onAddClick={() => setActiveCategory(category)}
                onAddTransaction={handleAddTransaction}
                onShowMenu={handleShowMenu}
                onRemoveItem={handleRemoveItem}
                onShowTransactions={handleShowTransactions}
              />
            )
          })}
        </div>

        {/* Add Item Modal */}
        {activeCategory && (
          <AddNetWorthItemModal
            category={activeCategory}
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
            onClose={() => setShowTransactionsItemId(null)}
            onEdit={handleEditTransaction}
            onDelete={handleDeleteTransaction}
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

        {/* Context Menu */}
        {menuOpenItemId && menuPosition && selectedItem && (
          <div
            ref={menuRef}
            className="fixed z-[100] bg-bg-surface-1 border border-border-strong rounded-card shadow-card py-2 min-w-[180px]"
            style={{ left: menuPosition.x, top: menuPosition.y }}
          >
            <button
              onClick={() => handleShowTransactions(menuOpenItemId)}
              className="w-full text-left px-4 py-2 text-text-primary text-[0.567rem] md:text-xs hover:bg-bg-surface-2 transition-colors"
            >
              Show Transactions
            </button>
            <button
              onClick={() => handleRemoveItem(menuOpenItemId)}
              className="w-full text-left px-4 py-2 text-danger text-[0.567rem] md:text-xs hover:bg-bg-surface-2 transition-colors"
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Add Item Modal
interface AddNetWorthItemModalProps {
  category: NetWorthCategory
  onClose: () => void
  onSubmit: (
    category: NetWorthCategory,
    data: { name: string; currency: string; platform: string }
  ) => string | void // Returns itemId if available
  onSaveTransaction?: (itemId: string, transaction: Omit<NetWorthTransaction, 'id' | 'itemId'>) => void
}

function AddNetWorthItemModal({ category, onClose, onSubmit, onSaveTransaction }: AddNetWorthItemModalProps) {
  const { convert } = useCurrency()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('CHF')
  const [platform, setPlatform] = useState('Physical')
  const [error, setError] = useState<string | null>(null)
  
  // Transaction fields for categories without price per item, Crypto, and categories that need price per item (Funds, Stocks, Commodities)
  const needsTransaction = categoriesWithoutPricePerItem.includes(category) || category === 'Crypto' || category === 'Funds' || category === 'Stocks' || category === 'Commodities'
  const isCrypto = category === 'Crypto'
  const needsPricePerItemInTransaction = (category === 'Funds' || category === 'Stocks' || category === 'Commodities')
  const [amount, setAmount] = useState('')
  const [pricePerCoinUsd, setPricePerCoinUsd] = useState('')
  const [pricePerItemChf, setPricePerItemChf] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [isLoadingPrice, setIsLoadingPrice] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  
  // Calculate total spent for Crypto
  const totalSpentUsd = useMemo(() => {
    if (!isCrypto) return 0
    const parsedAmount = Number(amount)
    const parsedPrice = Number(pricePerCoinUsd)
    if (isNaN(parsedAmount) || isNaN(parsedPrice) || parsedAmount <= 0 || parsedPrice <= 0) {
      return 0
    }
    return parsedAmount * parsedPrice
  }, [amount, pricePerCoinUsd, isCrypto])

  // Fetch coin price when coin name changes (for Crypto)
  useEffect(() => {
    if (!isCrypto || !name.trim()) {
      setPriceError(null)
      return
    }

    const ticker = name.trim().toUpperCase()
    setIsLoadingPrice(true)
    setPriceError(null)

    // Debounce the API call
    const timeoutId = setTimeout(async () => {
      try {
        const price = await fetchCoinPrice(ticker)
        if (price !== null) {
          setPricePerCoinUsd(price.toString())
          setPriceError(null)
        } else {
          setPriceError(`Could not fetch price for ${ticker}. Please enter price manually.`)
        }
      } catch (err) {
        setPriceError(`Failed to fetch price for ${ticker}. Please enter price manually.`)
      } finally {
        setIsLoadingPrice(false)
      }
    }, 500) // 500ms debounce

    return () => clearTimeout(timeoutId)
  }, [name, isCrypto])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Please enter an item name.')
      return
    }

    // Validate transaction fields if needed
    if (needsTransaction) {
      const parsedAmount = Number(amount)
      if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        setError('Please enter a valid amount greater than 0.')
        return
      }
      if (isCrypto) {
        const parsedPrice = Number(pricePerCoinUsd)
        if (!pricePerCoinUsd || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
          setError('Please enter a valid price per coin (USD) greater than 0.')
          return
        }
      }
      if (needsPricePerItemInTransaction) {
        const parsedPrice = Number(pricePerItemChf)
        if (!pricePerItemChf || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
          setError('Please enter a valid price per item (CHF) greater than 0.')
          return
        }
      }
      if (!date) {
        setError('Please select a date.')
        return
      }
    }

    // Create the item first and get its ID
    // For Crypto, default currency to USD (since prices are in USD)
    const itemCurrency = isCrypto ? 'USD' : currency
    const newItemId = onSubmit(category, {
      name: name.trim(),
      currency: itemCurrency,
      platform,
    })

    // If transaction is needed and we have an itemId, create the transaction
    // Save transaction BEFORE resetting form values (same as other categories)
    if (needsTransaction && onSaveTransaction && newItemId) {
      if (isCrypto) {
        // For Crypto: convert USD price to CHF for storage
        const pricePerCoinUsdNum = Number(pricePerCoinUsd)
        const pricePerCoinChf = convert(pricePerCoinUsdNum, 'USD')
        onSaveTransaction(newItemId, {
          side: 'buy',
          currency: 'USD', // Store as USD for crypto
          amount: Number(amount),
          pricePerItemChf: pricePerCoinChf, // Converted to CHF for storage
          date,
        })
      } else if (needsPricePerItemInTransaction) {
        // For Funds, Stocks, Commodities: use entered price per item
        onSaveTransaction(newItemId, {
          side: 'buy',
          currency,
          amount: Number(amount),
          pricePerItemChf: Number(pricePerItemChf),
          date,
        })
      } else {
        // For other categories without price per item, use 1
        onSaveTransaction(newItemId, {
          side: 'buy',
          currency,
          amount: Number(amount),
          pricePerItemChf: 1,
          date,
        })
      }
    }

    // Reset form
    setName('')
    setCurrency('CHF')
    setPlatform('Physical')
    setAmount('')
    setPricePerCoinUsd('')
    setPricePerItemChf('')
    setDate(new Date().toISOString().split('T')[0])
    setPriceError(null)
    setIsLoadingPrice(false)
    
    // Close modal
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-6 relative" onClick={(e) => e.stopPropagation()}>
        <Heading level={2} className="mb-4">
          {isCrypto ? 'Add Coin' : `Add Item – ${category}`}
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
              {isCrypto ? 'Coin' : 'Item'}
            </label>
            <input
              id="nw-item-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              placeholder={isCrypto ? 'e.g. BTC, ETH, USDT' : ''}
              autoFocus
            />
          </div>

          {isCrypto ? (
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
                <option value="Physical">Physical</option>
                <option value="Raiffeisen">Raiffeisen</option>
                <option value="Revolut">Revolut</option>
                <option value="yuh!">yuh!</option>
                <option value="SAXO">SAXO</option>
                <option value="Kraken">Kraken</option>
                <option value="MEXC">MEXC</option>
                <option value="BingX">BingX</option>
                <option value="Exodus">Exodus</option>
                <option value="Trezor">Trezor</option>
              </select>
            </div>
          ) : (
            <>
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
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input pl-3 pr-8 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                >
                  <option value="CHF">CHF</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
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
                  <option value="Physical">Physical</option>
                  <option value="Wallet">Wallet</option>
                  <option value="Raiffeisen">Raiffeisen</option>
                  <option value="Revolut">Revolut</option>
                  <option value="yuh!">yuh!</option>
                  <option value="SAXO">SAXO</option>
                  <option value="Kraken">Kraken</option>
                  <option value="Trezor">Trezor</option>
                  <option value="Ledger">Ledger</option>
                  <option value="IBKR">IBKR</option>
                  <option value="UBS">UBS</option>
                  <option value="Property">Property</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </>
          )}

          {needsTransaction && (
            <>
              <div>
                <label
                  className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                  htmlFor="nw-initial-amount"
                >
                  Amount {isCrypto ? '(coins)' : needsPricePerItemInTransaction ? '(shares/units)' : '(CHF)'}
                </label>
                <input
                  id="nw-initial-amount"
                  type="number"
                  min="0"
                  step={isCrypto ? "0.00000001" : "0.01"}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                  placeholder={isCrypto ? 'e.g. 0.5, 1.0, 10.0' : needsPricePerItemInTransaction ? 'e.g. 10, 100, 1000' : 'e.g. 1000, 5000, 10000'}
                />
              </div>

              {isCrypto && (
                <>
                  <div>
                    <label
                      className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                      htmlFor="nw-price-per-coin"
                    >
                      Price per Coin (USD)
                      {isLoadingPrice && (
                        <span className="ml-2 text-text-muted text-[0.4725rem] md:text-[0.567rem]">(fetching...)</span>
                      )}
                    </label>
                    <input
                      id="nw-price-per-coin"
                      type="number"
                      min="0"
                      step="0.0000000001"
                      value={pricePerCoinUsd}
                      onChange={(e) => setPricePerCoinUsd(e.target.value)}
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

                  <div>
                    <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1">
                      Total Spent (USD)
                    </label>
                    <div className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm">
                      {totalSpentUsd > 0 ? formatMoney(totalSpentUsd, 'USD', 'ch') : '0.00 USD'}
                    </div>
                  </div>
                </>
              )}

              {needsPricePerItemInTransaction && (
                <div>
                  <label
                    className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                    htmlFor="nw-price-per-item"
                  >
                    Price per Item (CHF)
                  </label>
                  <input
                    id="nw-price-per-item"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pricePerItemChf}
                    onChange={(e) => setPricePerItemChf(e.target.value)}
                    className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                    placeholder="e.g. 100.50, 50.25, 25.00"
                  />
                </div>
              )}

              <div>
                <label
                  className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                  htmlFor="nw-initial-date"
                >
                  Date
                </label>
                <input
                  id="nw-initial-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                />
              </div>
            </>
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
              {isCrypto ? 'Add Coin' : 'Add Item'}
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
  const { baseCurrency, convert } = useCurrency()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch')
  const isEditing = !!transaction
  const [activeTab, setActiveTab] = useState<TransactionTab>(transaction?.side || 'buy')
  const [amount, setAmount] = useState(transaction?.amount.toString() || '')
  const [pricePerItemChf, setPricePerItemChf] = useState(transaction?.pricePerItemChf.toString() || '')
  const [date, setDate] = useState(transaction?.date || new Date().toISOString().split('T')[0])
  const [error, setError] = useState<string | null>(null)
  const [isLoadingPrice, setIsLoadingPrice] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)

  const needsPricePerItem = !categoriesWithoutPricePerItem.includes(item.category)
  const isCrypto = item.category === 'Crypto'

  // Fetch coin price when modal opens for Crypto items (only if not editing and no price set)
  useEffect(() => {
    if (isCrypto && needsPricePerItem && !isEditing && !pricePerItemChf && item.name) {
      const ticker = item.name.trim().toUpperCase()
      setIsLoadingPrice(true)
      setPriceError(null)

      fetchCoinPrice(ticker)
        .then((price) => {
          if (price !== null) {
            // Set the USD price directly (for crypto, we store USD prices)
            setPricePerItemChf(price.toString())
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount when modal opens

  const totalChf = useMemo(() => {
    const parsedAmount = Number(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
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

    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount greater than 0.')
      return
    }
    if (needsPricePerItem) {
      if (!pricePerItemChf || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
        setError(isCrypto ? 'Please enter a valid price per coin (USD) greater than 0.' : 'Please enter a valid price per item greater than 0.')
        return
      }
    }
    if (!date) {
      setError('Please select a date.')
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
        date,
      })
    } else {
      onSave({
        itemId: item.id,
        side: activeTab,
        currency: item.currency,
        amount: parsedAmount,
        pricePerItemChf: needsPricePerItem ? parsedPrice : 1, // For categories without price per item, use 1 (amount = total value)
        date,
      })
    }

    setAmount('')
    setPricePerItemChf('')
    setDate(new Date().toISOString().split('T')[0])
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
              min="0"
              step={isCrypto ? "0.00000001" : "0.01"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              placeholder={needsPricePerItem ? "e.g. 0.5, 100, 1" : "e.g. 1000, 5000, 10000"}
            />
          </div>

          {needsPricePerItem && (
            <div>
              <label
                className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1"
                htmlFor="tx-price"
              >
                {isCrypto ? 'Price per coin (USD)' : 'Price per item (CHF)'}
                {isLoadingPrice && (
                  <span className="ml-2 text-text-muted text-[0.4725rem] md:text-[0.567rem]">(fetching...)</span>
                )}
              </label>
              <input
                id="tx-price"
                type="number"
                min="0"
                step={isCrypto ? "0.0000000001" : "0.01"}
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
          )}

          {needsPricePerItem && (
            <div>
              <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1">
                {activeTab === 'buy' ? 'Total spent' : 'Total sold'} {isCrypto ? '(USD)' : '(CHF)'}
              </label>
              <div className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm">
                {isCrypto 
                  ? formatMoney(totalChf, 'USD', 'ch')
                  : formatCurrency(convert(totalChf, 'CHF'))
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
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
  onClose: () => void
  onEdit: (transactionId: string) => void
  onDelete: (transactionId: string) => void
}

function ShowTransactionsModal({ item, transactions, cryptoPrices = {}, onClose, onEdit, onDelete }: ShowTransactionsModalProps) {
  const { baseCurrency, convert } = useCurrency()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch')
  
  // Calculate balance - for Crypto use current price * coin amount
  let balanceChf: number
  if (item.category === 'Crypto') {
    const coinAmount = calculateCoinAmount(item.id, transactions)
    const ticker = item.name.trim().toUpperCase()
    const currentPriceUsd = cryptoPrices[ticker] || 0
    if (currentPriceUsd > 0) {
      // Convert USD to CHF for balance
      balanceChf = convert(coinAmount * currentPriceUsd, 'USD')
    } else {
      // Fallback to transaction-based calculation if price not available
      balanceChf = calculateBalanceChf(item.id, transactions, item, cryptoPrices)
    }
  } else {
    balanceChf = calculateBalanceChf(item.id, transactions, item, cryptoPrices)
  }
  const balanceConverted = convert(balanceChf, 'CHF')
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
          <TotalText variant="neutral">{formatCurrency(balanceConverted)}</TotalText>
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
                  <th className="text-right py-2 px-3 text2 font-bold">Price per item</th>
                  <th className="text-right py-2 px-3 text2 font-bold">Total</th>
                  <th className="text-left py-2 px-3 text2 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTransactions.map((tx) => {
                  const totalChf = tx.amount * tx.pricePerItemChf
                  const totalConverted = convert(totalChf, 'CHF')
                  const priceConverted = convert(tx.pricePerItemChf, 'CHF')
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
                      <td className="py-2 px-3 text2 text-right">{formatCurrency(priceConverted)}</td>
                      <td className="py-2 px-3 text2 text-right">
                        <span className={tx.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                          {sign}{formatCurrency(totalConverted)}
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
