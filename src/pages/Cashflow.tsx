// TypeScript types
import React, { useState, useRef, useEffect, FormEvent } from 'react'
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
    <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
      <div className="mb-6 pb-4 border-b border-border-strong">
        <div className="flex flex-col">
          <Heading level={2}>{title}</Heading>
          {total !== undefined && (
            <TotalText variant={totalColor === 'success' ? 'inflow' : 'outflow'} className="mt-1">
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
  renderTable?: (groupItems: T[]) => React.ReactNode
}

function GroupedList<T extends Record<string, any>>({
  items,
  groupKey,
  groupOrder,
  renderGroupHeader,
  renderItem,
  renderHeader,
  renderAddButton,
  renderTable,
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
            {renderTable ? renderTable(groupItems) : (
              <>
            {renderHeader && renderHeader()}
            <div className="space-y-2">
              {groupItems.map((item) => renderItem(item))}
            </div>
              </>
            )}
            {renderAddButton && renderAddButton(groupName)}
          </div>
        )
      })}
    </div>
  )
}

// Inflow Section Component
interface InflowSectionProps {
  items: InflowItem[]
  onAddItem: (group: InflowGroupName, data: { item: string; amountChf: number; currency: string; provider: string }) => void
  onEditItem: (id: string) => void
  onRemoveItem: (id: string) => void
}

function InflowSection({ items, onAddItem, onEditItem, onRemoveItem }: InflowSectionProps) {
  const inflowGroups: InflowGroupName[] = ['Time', 'Service', 'Worker Bees']
  const totalInflow = items.reduce((sum, item) => sum + item.amountChf, 0)
  const [addItemGroup, setAddItemGroup] = useState<InflowGroupName | null>(null)

  return (
    <>
    <SectionCard title="Inflow" total={totalInflow} totalColor="success">
      <GroupedList
          items={items}
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
                  onClick={() => setAddItemGroup(groupName as InflowGroupName)}
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
        renderTable={(groupItems) => (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 'calc((100% - 80px) / 3)' }} />
                <col style={{ width: 'calc((100% - 80px) / 3)' }} />
                <col style={{ width: 'calc((100% - 80px) / 3)' }} />
                <col style={{ width: '80px' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left pb-2">
                    <Heading level={4}>Item</Heading>
                  </th>
                  <th className="text-right pb-2">
                    <Heading level={4}>Inflow</Heading>
                  </th>
                  <th className="text-right pb-2">
                    <Heading level={4}>Provider</Heading>
                  </th>
                  <th className="text-right pb-2">
                    <Heading level={4}>Actions</Heading>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupItems.map((item) => (
                  <tr key={item.id} className="border-b border-border-subtle last:border-b-0">
                    <td className="py-2">
                      <div className="text2 truncate">{item.item}</div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="text-success text2 whitespace-nowrap">{formatChf(item.amountChf)}</div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="text2 truncate">{item.provider}</div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center justify-end">
                        <CashflowItemMenu
                          itemId={item.id}
                          itemType="inflow"
                          onEdit={() => onEditItem(item.id)}
                          onRemove={() => onRemoveItem(item.id)}
                        />
          </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      />
    </SectionCard>
    {addItemGroup && (
      <AddInflowItemModal
        group={addItemGroup}
        onClose={() => setAddItemGroup(null)}
        onSubmit={(data) => {
          onAddItem(addItemGroup, data)
          setAddItemGroup(null)
        }}
      />
    )}
    </>
  )
}

// Outflow Section Component
interface OutflowSectionProps {
  items: OutflowItem[]
  onAddItem: (group: OutflowGroupName, data: { item: string; amountChf: number; currency: string; receiver: string }) => void
  onEditItem: (id: string) => void
  onRemoveItem: (id: string) => void
}

function OutflowSection({ items, onAddItem, onEditItem, onRemoveItem }: OutflowSectionProps) {
  const outflowGroups: OutflowGroupName[] = ['Fix', 'Variable', 'Shared Variable', 'Investments']
  const totalOutflow = items.reduce((sum, item) => sum + item.amountChf, 0)
  const [addItemGroup, setAddItemGroup] = useState<OutflowGroupName | null>(null)

  return (
    <>
    <SectionCard title="Outflow" total={totalOutflow} totalColor="danger">
      <GroupedList
          items={items}
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
                  onClick={() => setAddItemGroup(groupName as OutflowGroupName)}
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
        renderTable={(groupItems) => (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 'calc((100% - 80px) / 3)' }} />
                <col style={{ width: 'calc((100% - 80px) / 3)' }} />
                <col style={{ width: 'calc((100% - 80px) / 3)' }} />
                <col style={{ width: '80px' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left pb-2">
                    <Heading level={4}>Item</Heading>
                  </th>
                  <th className="text-right pb-2">
                    <Heading level={4}>Outflow</Heading>
                  </th>
                  <th className="text-right pb-2">
                    <Heading level={4}>Receiver</Heading>
                  </th>
                  <th className="text-right pb-2">
                    <Heading level={4}>Actions</Heading>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupItems.map((item) => (
                  <tr key={item.id} className="border-b border-border-subtle last:border-b-0">
                    <td className="py-2">
                      <div className="text2 truncate">{item.item}</div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="text-danger text2 whitespace-nowrap">{formatChf(item.amountChf)}</div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="text2 truncate">{item.receiver}</div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center justify-end">
                        <CashflowItemMenu
                          itemId={item.id}
                          itemType="outflow"
                          onEdit={() => onEditItem(item.id)}
                          onRemove={() => onRemoveItem(item.id)}
                        />
          </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      />
    </SectionCard>
    {addItemGroup && (
      <AddOutflowItemModal
        group={addItemGroup}
        onClose={() => setAddItemGroup(null)}
        onSubmit={(data) => {
          onAddItem(addItemGroup, data)
          setAddItemGroup(null)
        }}
      />
    )}
    </>
  )
}

// Accountflow Section Component
interface AccountflowSectionProps {
  items: AccountflowItem[]
  onAddItem: (platform: AccountPlatform, data: { item: string; inflowChf: number; outflowChf: number; currency: string }) => void
  onEditItem: (id: string) => void
  onRemoveItem: (id: string) => void
}

function AccountflowSection({ items, onAddItem, onEditItem, onRemoveItem }: AccountflowSectionProps) {
  const accountPlatforms: AccountPlatform[] = ['Raiffeisen', 'Revolut', 'yuh!', 'SAXO', 'Kraken']
  const [addItemPlatform, setAddItemPlatform] = useState<AccountPlatform | null>(null)

  return (
    <>
    <SectionCard title="Accountflow">
      <GroupedList
          items={items}
        groupKey="platform"
        groupOrder={accountPlatforms}
        renderGroupHeader={(platformName, groupItems) => {
          return (
            <div className="flex items-start justify-between pb-2 border-b border-border-subtle">
              <Heading level={3}>{platformName}</Heading>
              <div className="flex items-center gap-4">
                <button
                    onClick={() => setAddItemPlatform(platformName as AccountPlatform)}
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
        renderTable={(groupItems) => (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 'calc((100% - 80px) / 3)' }} />
                <col style={{ width: 'calc((100% - 80px) / 3)' }} />
                <col style={{ width: 'calc((100% - 80px) / 3)' }} />
                <col style={{ width: '80px' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left pb-2">
                    <Heading level={4}>Item</Heading>
                  </th>
                  <th className="text-right pb-2">
                    <Heading level={4}>Inflow</Heading>
                  </th>
                  <th className="text-right pb-2">
                    <Heading level={4}>Outflow</Heading>
                  </th>
                  <th className="text-right pb-2">
                    <Heading level={4}>Actions</Heading>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupItems.map((item) => (
                  <tr key={item.id} className="border-b border-border-subtle last:border-b-0">
                    <td className="py-2">
                      <div className="text2 truncate">{item.item}</div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="text-success text2 whitespace-nowrap">{formatChf(item.inflowChf)}</div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="text-danger text2 whitespace-nowrap">{formatChf(item.outflowChf)}</div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center justify-end">
                        <CashflowItemMenu
                          itemId={item.id}
                          itemType="accountflow"
                          onEdit={() => onEditItem(item.id)}
                          onRemove={() => onRemoveItem(item.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      />
    </SectionCard>
    {addItemPlatform && (
      <AddAccountflowItemModal
        platform={addItemPlatform}
        onClose={() => setAddItemPlatform(null)}
        onSubmit={(data) => {
          onAddItem(addItemPlatform, data)
          setAddItemPlatform(null)
        }}
      />
    )}
    </>
  )
}

// Cashflow Item Menu Component (3-dots)
interface CashflowItemMenuProps {
  itemId: string
  itemType: 'inflow' | 'outflow' | 'accountflow'
  onEdit: () => void
  onRemove: () => void
}

function CashflowItemMenu({ itemId, onEdit, onRemove }: CashflowItemMenuProps) {
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

  const handleEdit = () => {
    setMenuOpen(false)
    setMenuPosition(null)
    onEdit()
  }

  const handleRemove = () => {
    setMenuOpen(false)
    setMenuPosition(null)
    onRemove()
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
            className="w-full text-left px-4 py-2 text-text-primary text-[0.525rem] md:text-xs hover:bg-bg-surface-2 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleRemove}
            className="w-full text-left px-4 py-2 text-danger text-[0.525rem] md:text-xs hover:bg-bg-surface-2 transition-colors"
          >
            Remove
          </button>
        </div>
      )}
    </>
  )
}

// Add Inflow Item Modal
interface AddInflowItemModalProps {
  group: InflowGroupName
  onClose: () => void
  onSubmit: (data: { item: string; amountChf: number; currency: string; provider: string }) => void
}

function AddInflowItemModal({ group, onClose, onSubmit }: AddInflowItemModalProps) {
  const [item, setItem] = useState('')
  const [inflow, setInflow] = useState('')
  const [currency, setCurrency] = useState('CHF')
  const [provider, setProvider] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const parsedInflow = Number(inflow)
    if (!item.trim()) {
      setError('Please enter an item name.')
      return
    }
    if (!inflow || Number.isNaN(parsedInflow) || parsedInflow <= 0) {
      setError('Please enter a valid inflow amount greater than 0.')
      return
    }
    if (!provider.trim()) {
      setError('Please enter a provider.')
      return
    }

    onSubmit({
      item: item.trim(),
      amountChf: parsedInflow,
      currency,
      provider: provider.trim(),
    })

    setItem('')
    setInflow('')
    setCurrency('CHF')
    setProvider('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-6 relative" onClick={(e) => e.stopPropagation()}>
        <Heading level={2} className="mb-4">
          Add Item – {group}
        </Heading>

        {error && (
          <div className="mb-3 text-[0.525rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1">
              Group
            </label>
            <div className="text-text-primary text-xs md:text-sm">{group}</div>
          </div>

          <div>
            <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1" htmlFor="inflow-item">
              Item
            </label>
            <input
              id="inflow-item"
              type="text"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1" htmlFor="inflow-amount">
                Inflow
              </label>
              <input
                id="inflow-amount"
                type="number"
                min="0"
                step="0.01"
                value={inflow}
                onChange={(e) => setInflow(e.target.value)}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1" htmlFor="inflow-currency">
                Currency
              </label>
              <select
                id="inflow-currency"
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
          </div>

          <div>
            <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1" htmlFor="inflow-provider">
              Provider
            </label>
            <input
              id="inflow-provider"
              type="text"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
            />
          </div>

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

// Add Outflow Item Modal
interface AddOutflowItemModalProps {
  group: OutflowGroupName
  onClose: () => void
  onSubmit: (data: { item: string; amountChf: number; currency: string; receiver: string }) => void
}

function AddOutflowItemModal({ group, onClose, onSubmit }: AddOutflowItemModalProps) {
  const [item, setItem] = useState('')
  const [outflow, setOutflow] = useState('')
  const [currency, setCurrency] = useState('CHF')
  const [receiver, setReceiver] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const parsedOutflow = Number(outflow)
    if (!item.trim()) {
      setError('Please enter an item name.')
      return
    }
    if (!outflow || Number.isNaN(parsedOutflow) || parsedOutflow <= 0) {
      setError('Please enter a valid outflow amount greater than 0.')
      return
    }
    if (!receiver.trim()) {
      setError('Please enter a receiver.')
      return
    }

    onSubmit({
      item: item.trim(),
      amountChf: parsedOutflow,
      currency,
      receiver: receiver.trim(),
    })

    setItem('')
    setOutflow('')
    setCurrency('CHF')
    setReceiver('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-6 relative" onClick={(e) => e.stopPropagation()}>
        <Heading level={2} className="mb-4">
          Add Item – {group}
        </Heading>

        {error && (
          <div className="mb-3 text-[0.525rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1">
              Group
            </label>
            <div className="text-text-primary text-xs md:text-sm">{group}</div>
          </div>

          <div>
            <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1" htmlFor="outflow-item">
              Item
            </label>
            <input
              id="outflow-item"
              type="text"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1" htmlFor="outflow-amount">
                Outflow
              </label>
              <input
                id="outflow-amount"
                type="number"
                min="0"
                step="0.01"
                value={outflow}
                onChange={(e) => setOutflow(e.target.value)}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1" htmlFor="outflow-currency">
                Currency
              </label>
              <select
                id="outflow-currency"
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
          </div>

          <div>
            <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1" htmlFor="outflow-receiver">
              Receiver
            </label>
            <input
              id="outflow-receiver"
              type="text"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
            />
          </div>

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

// Add Accountflow Item Modal
interface AddAccountflowItemModalProps {
  platform: AccountPlatform
  onClose: () => void
  onSubmit: (data: { item: string; inflowChf: number; outflowChf: number; currency: string }) => void
}

function AddAccountflowItemModal({ platform, onClose, onSubmit }: AddAccountflowItemModalProps) {
  const [item, setItem] = useState('')
  const [type, setType] = useState<'inflow' | 'outflow'>('inflow')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('CHF')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const parsedAmount = Number(amount)
    if (!item.trim()) {
      setError('Please enter an item name.')
      return
    }
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError(`Please enter a valid ${type} amount greater than 0.`)
      return
    }

    onSubmit({
      item: item.trim(),
      inflowChf: type === 'inflow' ? parsedAmount : 0,
      outflowChf: type === 'outflow' ? parsedAmount : 0,
      currency,
    })

    setItem('')
    setType('inflow')
    setAmount('')
    setCurrency('CHF')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-6 relative" onClick={(e) => e.stopPropagation()}>
        <Heading level={2} className="mb-4">
          Add Item – {platform}
        </Heading>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-border-subtle">
          <button
            type="button"
            onClick={() => {
              setType('inflow')
              setAmount('')
            }}
            className={`px-4 py-2 text-[0.525rem] md:text-xs font-medium transition-colors ${
              type === 'inflow'
                ? 'text-highlight-yellow border-b-2 border-highlight-yellow'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Inflow
          </button>
          <button
            type="button"
            onClick={() => {
              setType('outflow')
              setAmount('')
            }}
            className={`px-4 py-2 text-[0.525rem] md:text-xs font-medium transition-colors ${
              type === 'outflow'
                ? 'text-highlight-yellow border-b-2 border-highlight-yellow'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Outflow
          </button>
        </div>

        {error && (
          <div className="mb-3 text-[0.525rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1">
              Platform
            </label>
            <div className="text-text-primary text-xs md:text-sm">{platform}</div>
          </div>

          <div>
            <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1" htmlFor="account-item">
              Item
            </label>
            <input
              id="account-item"
              type="text"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1" htmlFor="account-amount">
                {type === 'inflow' ? 'Inflow' : 'Outflow'}
              </label>
              <input
                id="account-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="block text-text-secondary text-[0.525rem] md:text-xs font-medium mb-1" htmlFor="account-currency">
                Currency
              </label>
              <select
                id="account-currency"
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
          </div>

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

// Main Cashflow Component
function Cashflow() {
  const [inflowItems, setInflowItems] = useState<InflowItem[]>(mockInflowItems)
  const [outflowItems, setOutflowItems] = useState<OutflowItem[]>(mockOutflowItems)
  const [accountflowItems, setAccountflowItems] = useState<AccountflowItem[]>(mockAccountflowItems)

  const handleAddInflowItem = (group: InflowGroupName, data: { item: string; amountChf: number; currency: string; provider: string }) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `inflow-${Date.now()}`
    const newItem: InflowItem = {
      id,
      item: data.item,
      amountChf: data.amountChf,
      provider: data.provider,
      group,
    }
    setInflowItems(prev => [...prev, newItem])
  }

  const handleAddOutflowItem = (group: OutflowGroupName, data: { item: string; amountChf: number; currency: string; receiver: string }) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `outflow-${Date.now()}`
    const newItem: OutflowItem = {
      id,
      item: data.item,
      amountChf: data.amountChf,
      receiver: data.receiver,
      group,
    }
    setOutflowItems(prev => [...prev, newItem])
  }

  const handleAddAccountflowItem = (platform: AccountPlatform, data: { item: string; inflowChf: number; outflowChf: number; currency: string }) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `account-${Date.now()}`
    const spareChf = data.inflowChf - data.outflowChf
    const newItem: AccountflowItem = {
      id,
      item: data.item,
      platform,
      inflowChf: data.inflowChf,
      outflowChf: data.outflowChf,
      spareChf,
    }
    setAccountflowItems(prev => [...prev, newItem])
  }

  const handleEditInflowItem = (id: string) => {
    console.log('Edit inflow item', id)
  }

  const handleEditOutflowItem = (id: string) => {
    console.log('Edit outflow item', id)
  }

  const handleEditAccountflowItem = (id: string) => {
    console.log('Edit accountflow item', id)
  }

  const handleRemoveInflowItem = (id: string) => {
    if (window.confirm('Are you sure you want to remove this item?')) {
      setInflowItems(prev => prev.filter(item => item.id !== id))
    }
  }

  const handleRemoveOutflowItem = (id: string) => {
    if (window.confirm('Are you sure you want to remove this item?')) {
      setOutflowItems(prev => prev.filter(item => item.id !== id))
    }
  }

  const handleRemoveAccountflowItem = (id: string) => {
    if (window.confirm('Are you sure you want to remove this item?')) {
      setAccountflowItems(prev => prev.filter(item => item.id !== id))
    }
  }

  return (
    <div className="min-h-screen bg-[#050A1A] px-2 py-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Cashflow</Heading>
        
        {/* Inflow Section */}
        <InflowSection
          items={inflowItems}
          onAddItem={handleAddInflowItem}
          onEditItem={handleEditInflowItem}
          onRemoveItem={handleRemoveInflowItem}
        />

        {/* Outflow Section */}
        <OutflowSection
          items={outflowItems}
          onAddItem={handleAddOutflowItem}
          onEditItem={handleEditOutflowItem}
          onRemoveItem={handleRemoveOutflowItem}
        />

        {/* Accountflow Section - Full width */}
        <div>
          <AccountflowSection
            items={accountflowItems}
            onAddItem={handleAddAccountflowItem}
            onEditItem={handleEditAccountflowItem}
            onRemoveItem={handleRemoveAccountflowItem}
          />
        </div>
      </div>
    </div>
  )
}

export default Cashflow

