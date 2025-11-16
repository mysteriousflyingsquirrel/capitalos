
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

interface NetWorthItem {
  id: string
  item: string
  balanceChf: number
  platform: string
  category: NetWorthCategory
}

// Mock data
const mockNetWorthItems: NetWorthItem[] = [
  // Cash
  { id: '1', item: 'Wallet', balanceChf: 250, platform: 'Physical', category: 'Cash' },
  { id: '2', item: 'Emergency Cash', balanceChf: 500, platform: 'Physical', category: 'Cash' },
  
  // Bank Accounts
  { id: '3', item: 'Main Account', balanceChf: 12000, platform: 'Raiffeisen', category: 'Bank Accounts' },
  { id: '4', item: 'Savings Account', balanceChf: 5000, platform: 'Raiffeisen', category: 'Bank Accounts' },
  { id: '5', item: 'Business Account', balanceChf: 8000, platform: 'UBS', category: 'Bank Accounts' },
  
  // Funds
  { id: '6', item: 'Swiss Equity Fund', balanceChf: 25000, platform: 'Saxo', category: 'Funds' },
  { id: '7', item: 'Global Index Fund', balanceChf: 15000, platform: 'IBKR', category: 'Funds' },
  
  // Stocks
  { id: '8', item: 'Apple Inc.', balanceChf: 12000, platform: 'IBKR', category: 'Stocks' },
  { id: '9', item: 'Nestlé SA', balanceChf: 8000, platform: 'Saxo', category: 'Stocks' },
  
  // Commodities
  { id: '10', item: 'Gold', balanceChf: 5000, platform: 'Physical', category: 'Commodities' },
  { id: '11', item: 'Silver', balanceChf: 2000, platform: 'Physical', category: 'Commodities' },
  
  // Crypto
  { id: '12', item: 'BTC', balanceChf: 40000, platform: 'Trezor', category: 'Crypto' },
  { id: '13', item: 'ETH', balanceChf: 15000, platform: 'Trezor', category: 'Crypto' },
  { id: '14', item: 'USDC', balanceChf: 5000, platform: 'Ledger', category: 'Crypto' },
  
  // Real Estate
  { id: '15', item: 'Apartment Zurich', balanceChf: 450000, platform: 'Property', category: 'Real Estate' },
  
  // Inventory
  { id: '16', item: 'Electronics', balanceChf: 3000, platform: 'Physical', category: 'Inventory' },
  { id: '17', item: 'Furniture', balanceChf: 5000, platform: 'Physical', category: 'Inventory' },
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
}

function NetWorthCategorySection({
  category,
  items,
}: NetWorthCategorySectionProps) {
  const subtotal = items.reduce((sum, item) => sum + item.balanceChf, 0)

  return (
    <div className="bg-bg-surface-1 border border-accent-blue rounded-card shadow-card p-6">
      <div className="mb-6 pb-4 border-b border-border-strong">
        <div className="flex items-center justify-between">
          <h2 className="text-text-primary text-xl font-semibold">{category}</h2>
          <span className="text-success text-2xl font-bold">
            {formatChf(subtotal)}
          </span>
        </div>
      </div>

      <div className="space-y-3">
          {/* Desktop: Grid layout */}
          <div className="hidden md:grid md:grid-cols-3 gap-4 pb-2 border-b border-border-subtle">
            <div className="text-text-secondary text-sm font-medium">Item</div>
            <div className="text-text-secondary text-sm font-medium">Balance</div>
            <div className="text-text-secondary text-sm font-medium">Platform</div>
          </div>

          {/* Mobile & Desktop: Items */}
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-1 md:grid-cols-3 md:gap-4 gap-2 py-2 border-b border-border-subtle last:border-b-0"
            >
              {/* Item */}
              <div className="text-text-primary font-medium">{item.item}</div>
              
              {/* Balance */}
              <div className="text-text-primary text-lg font-semibold">
                {formatChf(item.balanceChf)}
              </div>
              
              {/* Platform */}
              <div className="text-text-secondary text-sm md:mt-0 mt-1">
                {item.platform}
              </div>
            </div>
          ))}
          
          {/* Add Item Button */}
          <div className="flex justify-end mt-4">
            <button
              onClick={() => console.log(`Add item to ${category}`)}
              className="py-3 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] font-semibold rounded-full transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 group"
            >
            <svg
              className="w-5 h-5 transition-transform group-hover:rotate-90"
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
    </div>
  )
}

function NetWorth() {
  // Group items by category
  const groupedItems = mockNetWorthItems.reduce(
    (acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = []
      }
      acc[item.category].push(item)
      return acc
    },
    {} as Record<NetWorthCategory, NetWorthItem[]>
  )

  // Calculate total net worth
  const totalNetWorth = mockNetWorthItems.reduce(
    (sum, item) => sum + item.balanceChf,
    0
  )

  return (
    <div className="min-h-screen bg-[#050A1A] p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Total Net Worth */}
        <div className="bg-bg-surface-1 border border-accent-blue rounded-card shadow-card p-6">
          <p className="text-text-secondary text-sm font-medium mb-2">Total Net Worth</p>
          <p className="text-success text-4xl font-bold">{formatChf(totalNetWorth)}</p>
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
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default NetWorth

