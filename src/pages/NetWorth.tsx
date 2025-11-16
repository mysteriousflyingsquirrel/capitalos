import { useState, useMemo, FormEvent } from 'react'
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'

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
  userId?: string
  category: NetWorthCategory
  name: string
  balanceChf: number
  currency: string
  platform: string
  asOf?: string // ISO date string (only for some categories)
}

// Mock data
const mockNetWorthItems: NetWorthItem[] = [
  // Cash
  { id: '1', name: 'Wallet', balanceChf: 250, currency: 'CHF', platform: 'Physical', category: 'Cash' },
  { id: '2', name: 'Emergency Cash', balanceChf: 500, currency: 'CHF', platform: 'Physical', category: 'Cash' },
  
  // Bank Accounts
  { id: '3', name: 'Main Account', balanceChf: 12000, currency: 'CHF', platform: 'Raiffeisen', category: 'Bank Accounts' },
  { id: '4', name: 'Savings Account', balanceChf: 5000, currency: 'CHF', platform: 'Raiffeisen', category: 'Bank Accounts' },
  { id: '5', name: 'Business Account', balanceChf: 8000, currency: 'CHF', platform: 'UBS', category: 'Bank Accounts' },
  
  // Funds
  { id: '6', name: 'Swiss Equity Fund', balanceChf: 25000, currency: 'CHF', platform: 'Saxo', category: 'Funds', asOf: '2025-01-01' },
  { id: '7', name: 'Global Index Fund', balanceChf: 15000, currency: 'CHF', platform: 'IBKR', category: 'Funds', asOf: '2025-01-01' },
  
  // Stocks
  { id: '8', name: 'Apple Inc.', balanceChf: 12000, currency: 'CHF', platform: 'IBKR', category: 'Stocks', asOf: '2025-01-01' },
  { id: '9', name: 'Nestlé SA', balanceChf: 8000, currency: 'CHF', platform: 'Saxo', category: 'Stocks', asOf: '2025-01-01' },
  
  // Commodities
  { id: '10', name: 'Gold', balanceChf: 5000, currency: 'CHF', platform: 'Physical', category: 'Commodities', asOf: '2025-01-01' },
  { id: '11', name: 'Silver', balanceChf: 2000, currency: 'CHF', platform: 'Physical', category: 'Commodities', asOf: '2025-01-01' },
  
  // Crypto
  { id: '12', name: 'BTC', balanceChf: 40000, currency: 'CHF', platform: 'Trezor', category: 'Crypto', asOf: '2025-01-01' },
  { id: '13', name: 'ETH', balanceChf: 15000, currency: 'CHF', platform: 'Trezor', category: 'Crypto', asOf: '2025-01-01' },
  { id: '14', name: 'USDC', balanceChf: 5000, currency: 'CHF', platform: 'Ledger', category: 'Crypto', asOf: '2025-01-01' },
  
  // Real Estate
  { id: '15', name: 'Apartment Zurich', balanceChf: 450000, currency: 'CHF', platform: 'Property', category: 'Real Estate' },
  
  // Inventory
  { id: '16', name: 'Electronics', balanceChf: 3000, currency: 'CHF', platform: 'Physical', category: 'Inventory' },
  { id: '17', name: 'Furniture', balanceChf: 5000, currency: 'CHF', platform: 'Physical', category: 'Inventory' },
]

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
const formatChf = (value: number): string => {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
  }).format(value)
}

// Helper component: NetWorthCategorySection
interface NetWorthCategorySectionProps {
  category: NetWorthCategory
  items: NetWorthItem[]
  onAddClick: () => void
}

function NetWorthCategorySection({
  category,
  items,
  onAddClick,
}: NetWorthCategorySectionProps) {
  const subtotal = items.reduce((sum, item) => sum + item.balanceChf, 0)

  return (
    <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-6">
      <div className="mb-6 pb-4 border-b border-border-strong">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Heading level={2}>{category}</Heading>
            <TotalText variant="neutral" className="block mt-1 text-xs md:text-sm">
              {formatChf(subtotal)}
            </TotalText>
          </div>
          <button
            onClick={onAddClick}
            className="py-2 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.525rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg flex items-center justify-center gap-2 group"
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
        </div>
      </div>

      <div className="space-y-3">
          {/* Desktop: Grid layout */}
          <div className="grid grid-cols-3 gap-2 md:gap-4 pb-2 border-b border-border-subtle">
            <Heading level={4} className="font-medium">Item</Heading>
            <Heading level={4} className="font-medium">Balance</Heading>
            <Heading level={4} className="font-medium">Platform</Heading>
          </div>

        {/* Mobile & Desktop: Items */}
        {items.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-3 gap-2 md:gap-4 py-2 border-b border-border-subtle last:border-b-0"
          >
            {/* Item */}
            <div className="text-text-primary text-[0.525rem] md:text-xs truncate">{item.name}</div>
            
            {/* Balance */}
            <div className="text-text-primary text-[0.525rem] md:text-xs truncate">
              {formatChf(item.balanceChf)}
            </div>
            
            {/* Platform */}
            <div className="text-text-secondary text-[0.525rem] md:text-xs truncate">
              {item.platform}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function NetWorth() {
  const [netWorthItems, setNetWorthItems] = useState<NetWorthItem[]>(mockNetWorthItems)
  const [activeCategory, setActiveCategory] = useState<NetWorthCategory | null>(null)

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
    () => netWorthItems.reduce((sum, item) => sum + item.balanceChf, 0),
    [netWorthItems]
  )

  const handleAddItem = (
    category: NetWorthCategory,
    data: { name: string; amount: number; currency: string; platform: string; asOf?: string }
  ) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : String(Date.now())

    const newItem: NetWorthItem = {
      id,
      category,
      name: data.name,
      balanceChf: data.amount,
      currency: data.currency,
      platform: data.platform,
      asOf: data.asOf,
    }

    setNetWorthItems((prev) => [...prev, newItem])
    setActiveCategory(null)
  }

  return (
    <div className="min-h-screen bg-[#050A1A] p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Net Worth</Heading>
        
        {/* Total Net Worth */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-6">
          <Heading level={2} className="mb-2">
            Total Net Worth
          </Heading>
          <TotalText variant="neutral">{formatChf(totalNetWorth)}</TotalText>
        </div>

        {/* Grouped Categories */}
        <div className="space-y-4">
          {categoryOrder.map((category) => {
            const items = groupedItems[category] || []
            if (items.length === 0) return null

            return (
              <NetWorthCategorySection
                key={category}
                category={category}
                items={items}
                onAddClick={() => setActiveCategory(category)}
              />
            )
          })}
        </div>

        {activeCategory && (
          <AddNetWorthItemModal
            category={activeCategory}
            onClose={() => setActiveCategory(null)}
            onSubmit={handleAddItem}
          />
        )}
      </div>
    </div>
  )
}

interface AddNetWorthItemModalProps {
  category: NetWorthCategory
  onClose: () => void
  onSubmit: (
    category: NetWorthCategory,
    data: { name: string; amount: number; currency: string; platform: string; asOf?: string }
  ) => void
}

const CATEGORIES_WITH_DATE: NetWorthCategory[] = ['Funds', 'Stocks', 'Commodities', 'Crypto']

function AddNetWorthItemModal({ category, onClose, onSubmit }: AddNetWorthItemModalProps) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('CHF')
  const [platform, setPlatform] = useState('Physical')
  const [asOf, setAsOf] = useState('')
  const [error, setError] = useState<string | null>(null)

  const requiresDate = CATEGORIES_WITH_DATE.includes(category)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const parsedAmount = Number(amount)
    if (!name.trim()) {
      setError('Please enter an item name.')
      return
    }
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount greater than 0.')
      return
    }
    if (requiresDate && !asOf) {
      setError('Please select a date.')
      return
    }

    onSubmit(category, {
      name: name.trim(),
      amount: parsedAmount,
      currency,
      platform,
      asOf: requiresDate ? asOf : undefined,
    })

    setName('')
    setAmount('')
    setCurrency('CHF')
    setPlatform('Physical')
    setAsOf('')
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-6 relative">
        <Heading level={2} className="mb-4">
          Add Item – {category}
        </Heading>

        {error && (
          <div className="mb-3 text-[0.525rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1">
              Category
            </label>
            <div className="text-text-primary text-xs md:text-sm">{category}</div>
          </div>

          <div>
            <label
              className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1"
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
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1"
                htmlFor="nw-amount"
              >
                Amount
              </label>
              <input
                id="nw-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label
                className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1"
                htmlFor="nw-currency"
              >
                Currency
              </label>
              <select
                id="nw-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              >
                <option value="CHF">CHF</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div>
            <label
              className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1"
              htmlFor="nw-platform"
            >
              Platform
            </label>
            <select
              id="nw-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
            >
              <option value="Physical">Physical</option>
              <option value="Wallet">Wallet</option>
              <option value="Raiffeisen">Raiffeisen</option>
              <option value="Revolut">Revolut</option>
              <option value="yuh!">yuh!</option>
              <option value="SAXO">SAXO</option>
              <option value="Kraken">Kraken</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {requiresDate && (
            <div>
              <label
                className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1"
                htmlFor="nw-asof"
              >
                Date
              </label>
              <input
                id="nw-asof"
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-[0.525rem] md:text-xs bg-bg-surface-2 border border-border-subtle text-text-primary hover:bg-bg-surface-3 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-full text-[0.525rem] md:text-xs bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] font-semibold hover:brightness-110 transition-all duration-200 shadow-card"
            >
              Add Item
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NetWorth

