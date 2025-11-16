// TypeScript types
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'

type InflowGroupName = 'Time' | 'Service' | 'Worker Bees'

interface InflowItem {
  id: string
  item: string
  amountChf: number
  provider: string
  group: InflowGroupName
}

type OutflowGroupName = 'Fix' | 'Variable' | 'Shared Variable' | 'Investments'

interface OutflowItem {
  id: string
  item: string
  amountChf: number
  receiver: string
  group: OutflowGroupName
}

type AccountPlatform = 'Raiffeisen' | 'Revolut' | 'yuh!' | 'SAXO' | 'Kraken'

interface AccountflowItem {
  id: string
  item: string
  platform: AccountPlatform
  inflowChf: number
  outflowChf: number
  spareChf: number
}

// Mock data - Inflow
const mockInflowItems: InflowItem[] = [
  // Time
  { id: 'i1', item: 'Consulting Hours', amountChf: 5000, provider: 'Client A', group: 'Time' },
  { id: 'i2', item: 'Development Work', amountChf: 3000, provider: 'Client B', group: 'Time' },
  { id: 'i3', item: 'Project Management', amountChf: 2000, provider: 'Client C', group: 'Time' },
  
  // Service
  { id: 'i4', item: 'Software License', amountChf: 1500, provider: 'TechCorp', group: 'Service' },
  { id: 'i5', item: 'Maintenance Contract', amountChf: 800, provider: 'ServicePro', group: 'Service' },
  
  // Worker Bees
  { id: 'i6', item: 'Freelance Design', amountChf: 1200, provider: 'Design Studio', group: 'Worker Bees' },
  { id: 'i7', item: 'Content Writing', amountChf: 500, provider: 'Content Agency', group: 'Worker Bees' },
]

// Mock data - Outflow
const mockOutflowItems: OutflowItem[] = [
  // Fix
  { id: 'o1', item: 'Rent', amountChf: 2000, receiver: 'Landlord', group: 'Fix' },
  { id: 'o2', item: 'Insurance', amountChf: 300, receiver: 'Insurance Co', group: 'Fix' },
  { id: 'o3', item: 'Phone Bill', amountChf: 50, receiver: 'Swisscom', group: 'Fix' },
  
  // Variable
  { id: 'o4', item: 'Groceries', amountChf: 400, receiver: 'Migros', group: 'Variable' },
  { id: 'o5', item: 'Restaurants', amountChf: 200, receiver: 'Various', group: 'Variable' },
  
  // Shared Variable
  { id: 'o6', item: 'Utilities', amountChf: 150, receiver: 'EWZ', group: 'Shared Variable' },
  { id: 'o7', item: 'Internet', amountChf: 60, receiver: 'Swisscom', group: 'Shared Variable' },
  
  // Investments
  { id: 'o8', item: 'Stock Purchase', amountChf: 1000, receiver: 'IBKR', group: 'Investments' },
  { id: 'o9', item: 'Crypto Investment', amountChf: 500, receiver: 'Kraken', group: 'Investments' },
]

// Mock data - Accountflow
const mockAccountflowItems: AccountflowItem[] = [
  // Raiffeisen
  { id: 'a1', item: 'Main Account', inflowChf: 8000, outflowChf: 2500, spareChf: 5500, platform: 'Raiffeisen' },
  { id: 'a2', item: 'Savings Account', inflowChf: 2000, outflowChf: 0, spareChf: 2000, platform: 'Raiffeisen' },
  
  // Revolut
  { id: 'a3', item: 'Personal Card', inflowChf: 1500, outflowChf: 800, spareChf: 700, platform: 'Revolut' },
  { id: 'a4', item: 'Business Card', inflowChf: 3000, outflowChf: 1200, spareChf: 1800, platform: 'Revolut' },
  
  // yuh!
  { id: 'a5', item: 'Investment Account', inflowChf: 1000, outflowChf: 500, spareChf: 500, platform: 'yuh!' },
  
  // SAXO
  { id: 'a6', item: 'Trading Account', inflowChf: 5000, outflowChf: 2000, spareChf: 3000, platform: 'SAXO' },
  { id: 'a7', item: 'Investment Portfolio', inflowChf: 3000, outflowChf: 1000, spareChf: 2000, platform: 'SAXO' },
  
  // Kraken
  { id: 'a8', item: 'Crypto Wallet', inflowChf: 2000, outflowChf: 500, spareChf: 1500, platform: 'Kraken' },
]

// Helper function to format CHF
const formatChf = (value: number): string => {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
  }).format(value)
}

// Helper component: SectionCard
interface SectionCardProps {
  title: string
  children: React.ReactNode
  total?: number
  totalColor?: 'success' | 'danger'
}

function SectionCard({ title, children, total, totalColor = 'success' }: SectionCardProps) {
  return (
    <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-6">
      <div className="mb-6 pb-4 border-b border-border-strong">
        <div className="flex items-center justify-between">
          <Heading level={2}>{title}</Heading>
          {total !== undefined && (
            <TotalText variant={totalColor === 'success' ? 'inflow' : 'outflow'}>
              {new Intl.NumberFormat('de-CH', {
                style: 'currency',
                currency: 'CHF',
              }).format(total)}
            </TotalText>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

// Helper component: GroupedList
interface GroupedListProps<T> {
  items: T[]
  groupKey: keyof T
  groupOrder: string[]
  renderGroupHeader: (groupName: string, groupItems: T[]) => React.ReactNode
  renderItem: (item: T) => React.ReactNode
  renderHeader?: () => React.ReactNode
  renderAddButton?: (groupName: string) => React.ReactNode
}

function GroupedList<T extends Record<string, any>>({
  items,
  groupKey,
  groupOrder,
  renderGroupHeader,
  renderItem,
  renderHeader,
  renderAddButton,
}: GroupedListProps<T>) {
  // Group items
  const grouped = items.reduce(
    (acc, item) => {
      const group = String(item[groupKey])
      if (!acc[group]) {
        acc[group] = []
      }
      acc[group].push(item)
      return acc
    },
    {} as Record<string, T[]>
  )

  return (
    <div className="space-y-8">
      {groupOrder.map((groupName) => {
        const groupItems = grouped[groupName] || []
        if (groupItems.length === 0) return null

        return (
          <div key={groupName} className="space-y-3 pb-4 border-b border-border-strong last:border-b-0">
            {renderGroupHeader(groupName, groupItems)}
            {renderHeader && renderHeader()}
            <div className="space-y-2">
              {groupItems.map((item) => renderItem(item))}
            </div>
            {renderAddButton && renderAddButton(groupName)}
          </div>
        )
      })}
    </div>
  )
}

// Inflow Section Component
function InflowSection() {
  const inflowGroups: InflowGroupName[] = ['Time', 'Service', 'Worker Bees']
  const totalInflow = mockInflowItems.reduce((sum, item) => sum + item.amountChf, 0)

  return (
    <SectionCard title="Inflow" total={totalInflow} totalColor="success">
      <GroupedList
        items={mockInflowItems}
        groupKey="group"
        groupOrder={inflowGroups}
        renderGroupHeader={(groupName, groupItems) => {
          const total = groupItems.reduce((sum, item) => sum + item.amountChf, 0)
          return (
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <div>
                <Heading level={3}>{groupName}</Heading>
                <TotalText variant="inflow" className="block mt-1">
                  {formatChf(total)}
                </TotalText>
              </div>
              <button
                onClick={() => console.log(`Add item to ${groupName} (Inflow)`)}
                className="py-2 px-3 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.525rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg flex items-center justify-center gap-1.5 group"
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
          )
        }}
        renderHeader={() => (
          <div className="grid grid-cols-3 gap-2 md:gap-4 pb-2 border-b border-border-subtle">
            <Heading level={4} className="font-medium">Item</Heading>
            <Heading level={4} className="font-medium">Inflow</Heading>
            <Heading level={4} className="font-medium">Provider</Heading>
          </div>
        )}
        renderItem={(item) => (
          <div
            key={item.id}
            className="grid grid-cols-3 gap-2 md:gap-4 py-2 border-b border-border-subtle last:border-b-0"
          >
            <div className="text-text-primary text-[0.525rem] md:text-xs truncate">{item.item}</div>
            <div className="text-success text-[0.525rem] md:text-xs truncate">{formatChf(item.amountChf)}</div>
            <div className="text-text-secondary text-[0.525rem] md:text-xs truncate">{item.provider}</div>
          </div>
        )}
      />
    </SectionCard>
  )
}

// Outflow Section Component
function OutflowSection() {
  const outflowGroups: OutflowGroupName[] = ['Fix', 'Variable', 'Shared Variable', 'Investments']
  const totalOutflow = mockOutflowItems.reduce((sum, item) => sum + item.amountChf, 0)

  return (
    <SectionCard title="Outflow" total={totalOutflow} totalColor="danger">
      <GroupedList
        items={mockOutflowItems}
        groupKey="group"
        groupOrder={outflowGroups}
        renderGroupHeader={(groupName, groupItems) => {
          const total = groupItems.reduce((sum, item) => sum + item.amountChf, 0)
          return (
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <div>
                <Heading level={3}>{groupName}</Heading>
                <TotalText variant="outflow" className="block mt-1">
                  {formatChf(total)}
                </TotalText>
              </div>
              <button
                onClick={() => console.log(`Add item to ${groupName} (Outflow)`)}
                className="py-2 px-3 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.525rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg flex items-center justify-center gap-1.5 group"
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
          )
        }}
        renderHeader={() => (
          <div className="grid grid-cols-3 gap-2 md:gap-4 pb-2 border-b border-border-subtle">
            <Heading level={4} className="font-medium">Item</Heading>
            <Heading level={4} className="font-medium">Outflow</Heading>
            <Heading level={4} className="font-medium">Receiver</Heading>
          </div>
        )}
        renderItem={(item) => (
          <div
            key={item.id}
            className="grid grid-cols-3 gap-2 md:gap-4 py-2 border-b border-border-subtle last:border-b-0"
          >
            <div className="text-text-primary text-[0.525rem] md:text-xs truncate">{item.item}</div>
            <div className="text-danger text-[0.525rem] md:text-xs truncate">{formatChf(item.amountChf)}</div>
            <div className="text-text-secondary text-[0.525rem] md:text-xs truncate">{item.receiver}</div>
          </div>
        )}
      />
    </SectionCard>
  )
}

// Accountflow Section Component
function AccountflowSection() {
  const accountPlatforms: AccountPlatform[] = ['Raiffeisen', 'Revolut', 'yuh!', 'SAXO', 'Kraken']

  return (
    <SectionCard title="Accountflow">
      <GroupedList
        items={mockAccountflowItems}
        groupKey="platform"
        groupOrder={accountPlatforms}
        renderGroupHeader={(platformName, groupItems) => {
          return (
            <div className="flex items-start justify-between pb-2 border-b border-border-subtle">
              <Heading level={3}>{platformName}</Heading>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => console.log(`Add item to ${platformName} (Accountflow)`)}
                  className="py-2 px-3 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.525rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg flex items-center justify-center gap-1.5 group"
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
          )
        }}
        renderHeader={() => (
          <div className="grid grid-cols-3 gap-2 md:gap-4 pb-2 border-b border-border-subtle">
            <Heading level={4} className="font-medium">Item</Heading>
            <Heading level={4} className="font-medium">Inflow</Heading>
            <Heading level={4} className="font-medium">Outflow</Heading>
          </div>
        )}
        renderItem={(item) => (
          <div
            key={item.id}
            className="grid grid-cols-3 gap-2 md:gap-4 py-2 border-b border-border-subtle last:border-b-0"
          >
            <div className="text-text-primary text-[0.525rem] md:text-xs truncate">{item.item}</div>
            <div className="text-success text-[0.525rem] md:text-xs truncate">{formatChf(item.inflowChf)}</div>
            <div className="text-danger text-[0.525rem] md:text-xs truncate">{formatChf(item.outflowChf)}</div>
          </div>
        )}
      />
    </SectionCard>
  )
}

// Main Cashflow Component
function Cashflow() {
  return (
    <div className="min-h-screen bg-[#050A1A] p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Cashflow</Heading>
        
        {/* Inflow Section */}
        <InflowSection />

        {/* Outflow Section */}
        <OutflowSection />

        {/* Accountflow Section - Full width */}
        <div>
          <AccountflowSection />
        </div>
      </div>
    </div>
  )
}

export default Cashflow

