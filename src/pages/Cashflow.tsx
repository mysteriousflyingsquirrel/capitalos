// TypeScript types
import React, { useState, useRef, useEffect, FormEvent } from 'react'
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import { formatMoney, formatNumber } from '../lib/currency'
import {
  saveCashflowInflowItems,
  loadCashflowInflowItems,
  saveCashflowOutflowItems,
  loadCashflowOutflowItems,
  saveCashflowAccountflowMappings,
  loadCashflowAccountflowMappings,
} from '../services/storageService'

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

const accountPlatforms: AccountPlatform[] = ['Raiffeisen', 'Revolut', 'yuh!', 'SAXO', 'Kraken']

interface AccountflowItem {
  id: string
  item: string
  platform: AccountPlatform
  inflowChf: number
  outflowChf: number
  spareChf: number
}

type MappingKind = 'inflowToAccount' | 'accountToOutflow' | 'accountToAccount'

type InflowEndpointMode = 'group' | 'item'
type OutflowEndpointMode = 'group' | 'item'

interface InflowToAccountMapping {
  id: string
  kind: 'inflowToAccount'
  mode: InflowEndpointMode
  group?: InflowGroupName
  inflowItemId?: string
  account: AccountPlatform
}

interface AccountToOutflowMapping {
  id: string
  kind: 'accountToOutflow'
  mode: OutflowEndpointMode
  group?: OutflowGroupName
  outflowItemId?: string
  account: AccountPlatform
}

interface AccountToAccountMapping {
  id: string
  kind: 'accountToAccount'
  fromAccount: AccountPlatform
  toAccount: AccountPlatform
  amountChf: number
}

type AccountflowMapping =
  | InflowToAccountMapping
  | AccountToOutflowMapping
  | AccountToAccountMapping

// Empty data - user will add their own data
const mockInflowItems: InflowItem[] = []
const mockOutflowItems: OutflowItem[] = []
const mockAccountflowItems: AccountflowItem[] = []

// Helper function to format CHF
// formatChf will be replaced with currency-aware formatting in the component

// Helper functions for mapping amounts
function getInflowGroupSum(group: InflowGroupName, items: InflowItem[]): number {
  return items
    .filter(i => i.group === group)
    .reduce((sum, i) => sum + i.amountChf, 0)
}

function getOutflowGroupSum(group: OutflowGroupName, items: OutflowItem[]): number {
  return items
    .filter(i => i.group === group)
    .reduce((sum, i) => sum + i.amountChf, 0)
}

function computeMappingAmount(
  mapping: AccountflowMapping,
  inflowItems: InflowItem[],
  outflowItems: OutflowItem[]
): number {
  if (mapping.kind === 'inflowToAccount') {
    if (mapping.mode === 'group' && mapping.group) {
      return getInflowGroupSum(mapping.group, inflowItems)
    } else if (mapping.mode === 'item' && mapping.inflowItemId) {
      const item = inflowItems.find(i => i.id === mapping.inflowItemId)
      return item ? item.amountChf : 0
    }
  } else if (mapping.kind === 'accountToOutflow') {
    if (mapping.mode === 'group' && mapping.group) {
      return getOutflowGroupSum(mapping.group, outflowItems)
    } else if (mapping.mode === 'item' && mapping.outflowItemId) {
      const item = outflowItems.find(i => i.id === mapping.outflowItemId)
      return item ? item.amountChf : 0
    }
  } else if (mapping.kind === 'accountToAccount') {
    return mapping.amountChf
  }
  return 0
}

// Helper component: SectionCard
interface SectionCardProps {
  title: string
  children: React.ReactNode
  total?: number
  totalColor?: 'success' | 'danger'
}

function SectionCard({ title, children, total, totalColor = 'success' }: SectionCardProps) {
  const { baseCurrency } = useCurrency()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch')
  
  return (
    <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
      <div className="mb-6 pb-4 border-b border-border-strong">
        <div className="flex flex-col">
          <Heading level={2}>{title}</Heading>
          {total !== undefined && (
            <TotalText variant={totalColor === 'success' ? 'inflow' : 'outflow'} className="mt-1">
              {formatCurrency(total)}
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

        return (
          <div key={groupName} className="space-y-3 pb-4 border-b border-border-strong last:border-b-0">
            {renderGroupHeader(groupName, groupItems)}
            {renderTable ? renderTable(groupItems) : (
              <>
            {renderHeader && renderHeader()}
            <div className="space-y-2">
              {groupItems.length === 0 ? (
                <div className="text-center text-text-muted text-[0.567rem] md:text-xs py-4">
                  No items yet. Click "Add Item" to get started.
                </div>
              ) : (
                groupItems.map((item) => renderItem(item))
              )}
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
  const { baseCurrency, convert } = useCurrency()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch')
  
  const inflowGroups: InflowGroupName[] = ['Time', 'Service', 'Worker Bees']
  const totalInflowChf = items.reduce((sum, item) => sum + item.amountChf, 0)
  const totalInflow = convert(totalInflowChf, 'CHF')
  const [addItemGroup, setAddItemGroup] = useState<InflowGroupName | null>(null)

  return (
    <>
    <SectionCard title="Inflow" total={totalInflow} totalColor="success">
      <GroupedList
          items={items}
        groupKey="group"
        groupOrder={inflowGroups}
        renderGroupHeader={(groupName, groupItems) => {
          const totalChf = groupItems.reduce((sum, item) => sum + item.amountChf, 0)
          const total = convert(totalChf, 'CHF')
          return (
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <div>
                <Heading level={3}>{groupName}</Heading>
                <TotalText variant="inflow" className="block mt-1">
                  {formatCurrency(total)}
                </TotalText>
              </div>
              <button
                  onClick={() => setAddItemGroup(groupName as InflowGroupName)}
                className="py-2 px-3 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg flex items-center justify-center gap-1.5 group"
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
                {groupItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-text-muted text-[0.567rem] md:text-xs">
                      No items yet. Click "Add Item" to get started.
                    </td>
                  </tr>
                ) : (
                  groupItems.map((item) => (
                    <tr key={item.id} className="border-b border-border-subtle last:border-b-0">
                      <td className="py-2">
                        <div className="text2 truncate">{item.item}</div>
                      </td>
                      <td className="py-2 text-right">
                        <div className="text-success text2 whitespace-nowrap">{formatNumber(convert(item.amountChf, 'CHF'), 'ch')}</div>
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
                  ))
                )}
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
  const { baseCurrency, convert } = useCurrency()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch')
  
  const outflowGroups: OutflowGroupName[] = ['Fix', 'Variable', 'Shared Variable', 'Investments']
  const totalOutflowChf = items.reduce((sum, item) => sum + item.amountChf, 0)
  const totalOutflow = convert(totalOutflowChf, 'CHF')
  const [addItemGroup, setAddItemGroup] = useState<OutflowGroupName | null>(null)

  return (
    <>
    <SectionCard title="Outflow" total={totalOutflow} totalColor="danger">
      <GroupedList
          items={items}
        groupKey="group"
        groupOrder={outflowGroups}
        renderGroupHeader={(groupName, groupItems) => {
          const totalChf = groupItems.reduce((sum, item) => sum + item.amountChf, 0)
          const total = convert(totalChf, 'CHF')
          return (
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <div>
                <Heading level={3}>{groupName}</Heading>
                <TotalText variant="outflow" className="block mt-1">
                  {formatCurrency(total)}
                </TotalText>
              </div>
              <button
                  onClick={() => setAddItemGroup(groupName as OutflowGroupName)}
                className="py-2 px-3 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg flex items-center justify-center gap-1.5 group"
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
                {groupItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-text-muted text-[0.567rem] md:text-xs">
                      No items yet. Click "Add Item" to get started.
                    </td>
                  </tr>
                ) : (
                  groupItems.map((item) => (
                    <tr key={item.id} className="border-b border-border-subtle last:border-b-0">
                      <td className="py-2">
                        <div className="text2 truncate">{item.item}</div>
                      </td>
                      <td className="py-2 text-right">
                        <div className="text-danger text2 whitespace-nowrap">{formatNumber(convert(item.amountChf, 'CHF'), 'ch')}</div>
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
                  ))
                )}
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

// Helper functions for mapping labels
function getMappingLabel(
  mapping: AccountflowMapping,
  inflowItems: InflowItem[],
  outflowItems: OutflowItem[]
): string {
  if (mapping.kind === 'inflowToAccount') {
    if (mapping.mode === 'group' && mapping.group) {
      return mapping.group
    } else if (mapping.mode === 'item' && mapping.inflowItemId) {
      const item = inflowItems.find(i => i.id === mapping.inflowItemId)
      return item ? `${item.item} (${item.group})` : 'Unknown item'
    }
  } else if (mapping.kind === 'accountToOutflow') {
    if (mapping.mode === 'group' && mapping.group) {
      return mapping.group
    } else if (mapping.mode === 'item' && mapping.outflowItemId) {
      const item = outflowItems.find(i => i.id === mapping.outflowItemId)
      return item ? `${item.item} (${item.group})` : 'Unknown item'
    }
  } else if (mapping.kind === 'accountToAccount') {
    return `From ${mapping.fromAccount}`
  }
  return 'Unknown'
}

// Accountflow Section Component
interface AccountflowSectionProps {
  mappings: AccountflowMapping[]
  onAddMapping: (mapping: AccountflowMapping) => void
  onRemoveMapping: (id: string) => void
  inflowItems: InflowItem[]
  outflowItems: OutflowItem[]
}

function AccountflowSection({ mappings, onAddMapping, onRemoveMapping, inflowItems, outflowItems }: AccountflowSectionProps) {
  const { baseCurrency, convert } = useCurrency()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch')
  const [showAddMappingModal, setShowAddMappingModal] = useState(false)

  // Helper to get inflow mappings for an account
  const getInflowMappings = (account: AccountPlatform): AccountflowMapping[] => {
    return mappings.filter(m => {
      if (m.kind === 'inflowToAccount' && m.account === account) return true
      if (m.kind === 'accountToAccount' && m.toAccount === account) return true
      return false
    })
  }

  // Helper to get outflow mappings for an account
  const getOutflowMappings = (account: AccountPlatform): AccountflowMapping[] => {
    return mappings.filter(m => {
      if (m.kind === 'accountToOutflow' && m.account === account) return true
      if (m.kind === 'accountToAccount' && m.fromAccount === account) return true
      return false
    })
  }

  // Helper to get label for account-to-account on outflow side
  const getAccountToAccountOutflowLabel = (mapping: AccountToAccountMapping): string => {
    return `To ${mapping.toAccount}`
  }

  return (
    <>
      <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
        <div className="mb-6 pb-4 border-b border-border-strong">
          <div className="flex items-center justify-between">
            <Heading level={2}>Accountflow</Heading>
            <button
              onClick={() => setShowAddMappingModal(true)}
              className="py-2 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-[0.567rem] md:text-xs font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg flex items-center justify-center gap-1.5 group"
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
              <span>Add Mapping</span>
            </button>
          </div>
        </div>

        {/* Account Visualizations */}
        <div className="space-y-8">
          {accountPlatforms.map((account) => {
            const inflowMappings = getInflowMappings(account)
            const outflowMappings = getOutflowMappings(account)

            // Calculate totals
            const totalInflowChf = inflowMappings.reduce((sum, m) => {
              return sum + computeMappingAmount(m, inflowItems, outflowItems)
            }, 0)

            const totalOutflowChf = outflowMappings.reduce((sum, m) => {
              return sum + computeMappingAmount(m, inflowItems, outflowItems)
            }, 0)

            const spareChf = totalInflowChf - totalOutflowChf

            const totalInflow = convert(totalInflowChf, 'CHF')
            const totalOutflow = convert(totalOutflowChf, 'CHF')
            const spare = convert(spareChf, 'CHF')

            return (
              <div key={account} className="space-y-4 pb-4 border-b border-border-strong last:border-b-0">
                {/* Account Header with Totals */}
                <div>
                  <Heading level={3}>{account}</Heading>
                  <div className="mt-1 flex items-center gap-4">
                    <TotalText variant="inflow">
                      {formatCurrency(totalInflow)}
                    </TotalText>
                    <TotalText variant="outflow">
                      {formatCurrency(totalOutflow)}
                    </TotalText>
                    <TotalText variant="spare">
                      {formatCurrency(spare)}
                    </TotalText>
                  </div>
                </div>

                {/* Two Column Layout: Inflow and Outflow */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Inflow Column */}
                  <div className="space-y-3">
                    <Heading level={4} className="mb-2">Inflow</Heading>
                    {inflowMappings.length === 0 ? (
                      <div className="text-text-muted text-[0.567rem] md:text-xs">No inflow mappings</div>
                    ) : (
                      <>
                        {inflowMappings.map((mapping) => {
                          const label = getMappingLabel(mapping, inflowItems, outflowItems)
                          const amountChf = computeMappingAmount(mapping, inflowItems, outflowItems)
                          const amount = convert(amountChf, 'CHF')
                          return (
                            <div key={mapping.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0">
                              <div className="text2 truncate flex-1">{label}</div>
                              <div className="text-success text2 ml-4 whitespace-nowrap">{formatCurrency(amount)}</div>
                            </div>
                          )
                        })}
                      </>
                    )}
                  </div>

                  {/* Outflow Column */}
                  <div className="space-y-3">
                    <Heading level={4} className="mb-2">Outflow</Heading>
                    {outflowMappings.length === 0 ? (
                      <div className="text-text-muted text-[0.567rem] md:text-xs">No outflow mappings</div>
                    ) : (
                      <>
                        {outflowMappings.map((mapping) => {
                          let label = ''
                          if (mapping.kind === 'accountToAccount') {
                            label = getAccountToAccountOutflowLabel(mapping)
                          } else {
                            label = getMappingLabel(mapping, inflowItems, outflowItems)
                          }
                          const amountChf = computeMappingAmount(mapping, inflowItems, outflowItems)
                          const amount = convert(amountChf, 'CHF')
                          return (
                            <div key={mapping.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0">
                              <div className="text2 truncate flex-1">{label}</div>
                              <div className="text-danger text2 ml-4 whitespace-nowrap">{formatCurrency(amount)}</div>
                            </div>
                          )
                        })}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showAddMappingModal && (
        <AddMappingModal
          inflowItems={inflowItems}
          outflowItems={outflowItems}
          onClose={() => setShowAddMappingModal(false)}
          onSubmit={(mapping) => {
            onAddMapping(mapping)
            setShowAddMappingModal(false)
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
            className="w-full text-left px-4 py-2 text-text-primary text-[0.567rem] md:text-xs hover:bg-bg-surface-2 transition-colors"
          >
            Edit
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
          <div className="mb-3 text-[0.567rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1">
              Group
            </label>
            <div className="text-text-primary text-xs md:text-sm">{group}</div>
          </div>

          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="inflow-item">
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

          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="inflow-amount">
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
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="inflow-currency">
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

          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="inflow-provider">
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
          <div className="mb-3 text-[0.567rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1">
              Group
            </label>
            <div className="text-text-primary text-xs md:text-sm">{group}</div>
          </div>

          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="outflow-item">
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

          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="outflow-amount">
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
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="outflow-currency">
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

          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="outflow-receiver">
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

// Add Mapping Modal
interface AddMappingModalProps {
  inflowItems: InflowItem[]
  outflowItems: OutflowItem[]
  onClose: () => void
  onSubmit: (mapping: AccountflowMapping) => void
}

function AddMappingModal({ inflowItems, outflowItems, onClose, onSubmit }: AddMappingModalProps) {
  const { baseCurrency, convert } = useCurrency()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch')
  const [mappingType, setMappingType] = useState<MappingKind>('inflowToAccount')
  const [error, setError] = useState<string | null>(null)

  // InflowToAccount state
  const [inflowToAccountMode, setInflowToAccountMode] = useState<InflowEndpointMode>('group')
  const [inflowToAccountGroup, setInflowToAccountGroup] = useState<InflowGroupName | ''>('')
  const [inflowToAccountItem, setInflowToAccountItem] = useState<string>('')
  const [inflowToAccountTarget, setInflowToAccountTarget] = useState<AccountPlatform | ''>('')

  // AccountToOutflow state
  const [accountToOutflowSource, setAccountToOutflowSource] = useState<AccountPlatform | ''>('')
  const [accountToOutflowMode, setAccountToOutflowMode] = useState<OutflowEndpointMode>('group')
  const [accountToOutflowGroup, setAccountToOutflowGroup] = useState<OutflowGroupName | ''>('')
  const [accountToOutflowItem, setAccountToOutflowItem] = useState<string>('')

  // AccountToAccount state
  const [accountToAccountFrom, setAccountToAccountFrom] = useState<AccountPlatform | ''>('')
  const [accountToAccountTo, setAccountToAccountTo] = useState<AccountPlatform | ''>('')
  const [accountToAccountAmount, setAccountToAccountAmount] = useState<string>('')

  const inflowGroups: InflowGroupName[] = ['Time', 'Service', 'Worker Bees']
  const outflowGroups: OutflowGroupName[] = ['Fix', 'Variable', 'Shared Variable', 'Investments']

  // Calculate computed amounts for display
  const getInflowToAccountAmount = (): number => {
    if (inflowToAccountMode === 'group' && inflowToAccountGroup) {
      return getInflowGroupSum(inflowToAccountGroup, inflowItems)
    } else if (inflowToAccountMode === 'item' && inflowToAccountItem) {
      const item = inflowItems.find(i => i.id === inflowToAccountItem)
      return item ? item.amountChf : 0
    }
    return 0
  }

  const getAccountToOutflowAmount = (): number => {
    if (accountToOutflowMode === 'group' && accountToOutflowGroup) {
      return getOutflowGroupSum(accountToOutflowGroup, outflowItems)
    } else if (accountToOutflowMode === 'item' && accountToOutflowItem) {
      const item = outflowItems.find(i => i.id === accountToOutflowItem)
      return item ? item.amountChf : 0
    }
    return 0
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    let mapping: AccountflowMapping

    if (mappingType === 'inflowToAccount') {
      if (inflowToAccountMode === 'group' && !inflowToAccountGroup) {
        setError('Please select an inflow group.')
        return
      }
      if (inflowToAccountMode === 'item' && !inflowToAccountItem) {
        setError('Please select an inflow item.')
        return
      }
      if (!inflowToAccountTarget) {
        setError('Please select a target account.')
        return
      }

      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `mapping-${Date.now()}`
      mapping = {
        id,
        kind: 'inflowToAccount',
        mode: inflowToAccountMode,
        ...(inflowToAccountMode === 'group' ? { group: inflowToAccountGroup } : { inflowItemId: inflowToAccountItem }),
        account: inflowToAccountTarget,
      }
    } else if (mappingType === 'accountToOutflow') {
      if (!accountToOutflowSource) {
        setError('Please select a source account.')
        return
      }
      if (accountToOutflowMode === 'group' && !accountToOutflowGroup) {
        setError('Please select an outflow group.')
        return
      }
      if (accountToOutflowMode === 'item' && !accountToOutflowItem) {
        setError('Please select an outflow item.')
        return
      }

      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `mapping-${Date.now()}`
      mapping = {
        id,
        kind: 'accountToOutflow',
        mode: accountToOutflowMode,
        ...(accountToOutflowMode === 'group' ? { group: accountToOutflowGroup } : { outflowItemId: accountToOutflowItem }),
        account: accountToOutflowSource,
      }
    } else {
      // accountToAccount
      if (!accountToAccountFrom) {
        setError('Please select a source account.')
        return
      }
      if (!accountToAccountTo) {
        setError('Please select a target account.')
        return
      }
      if (accountToAccountFrom === accountToAccountTo) {
        setError('Source and target accounts must be different.')
        return
      }
      const parsedAmount = Number(accountToAccountAmount)
      if (!accountToAccountAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        setError('Please enter a valid amount greater than 0.')
        return
      }

      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `mapping-${Date.now()}`
      mapping = {
        id,
        kind: 'accountToAccount',
        fromAccount: accountToAccountFrom,
        toAccount: accountToAccountTo,
        amountChf: parsedAmount,
      }
    }

    onSubmit(mapping)

    // Reset form
    setMappingType('inflowToAccount')
    setInflowToAccountMode('group')
    setInflowToAccountGroup('')
    setInflowToAccountItem('')
    setInflowToAccountTarget('')
    setAccountToOutflowSource('')
    setAccountToOutflowMode('group')
    setAccountToOutflowGroup('')
    setAccountToOutflowItem('')
    setAccountToAccountFrom('')
    setAccountToAccountTo('')
    setAccountToAccountAmount('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-6 relative" onClick={(e) => e.stopPropagation()}>
        <Heading level={2} className="mb-4">
          Add Mapping
        </Heading>

        {error && (
          <div className="mb-3 text-[0.567rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mapping Type Selection */}
          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
              Mapping Type
            </label>
            <select
              value={mappingType}
              onChange={(e) => setMappingType(e.target.value as MappingKind)}
              className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
            >
              <option value="inflowToAccount">Inflow to Account</option>
              <option value="accountToOutflow">Account to Outflow</option>
              <option value="accountToAccount">Account to Account Transfer</option>
            </select>
          </div>

          {/* Inflow to Account Form */}
          {mappingType === 'inflowToAccount' && (
            <div className="space-y-4">
              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                  Mode
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="inflow-to-account-mode"
                      value="group"
                      checked={inflowToAccountMode === 'group'}
                      onChange={() => {
                        setInflowToAccountMode('group')
                        setInflowToAccountItem('')
                      }}
                      className="w-4 h-4 text-accent-blue focus:ring-accent-blue"
                    />
                    <span className="text-text-primary text-[0.567rem] md:text-xs">Whole Group</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="inflow-to-account-mode"
                      value="item"
                      checked={inflowToAccountMode === 'item'}
                      onChange={() => {
                        setInflowToAccountMode('item')
                        setInflowToAccountGroup('')
                      }}
                      className="w-4 h-4 text-accent-blue focus:ring-accent-blue"
                    />
                    <span className="text-text-primary text-[0.567rem] md:text-xs">Single Item</span>
                  </label>
                </div>
              </div>

              {inflowToAccountMode === 'group' ? (
                <div>
                  <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="inflow-to-account-group">
                    Inflow Group
                  </label>
                  <select
                    id="inflow-to-account-group"
                    value={inflowToAccountGroup}
                    onChange={(e) => setInflowToAccountGroup(e.target.value as InflowGroupName)}
                    className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                  >
                    <option value="">Select a group...</option>
                    {inflowGroups.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="inflow-to-account-item">
                    Inflow Item
                  </label>
                  <select
                    id="inflow-to-account-item"
                    value={inflowToAccountItem}
                    onChange={(e) => setInflowToAccountItem(e.target.value)}
                    className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                  >
                    <option value="">Select an item...</option>
                    {inflowItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.item} ({item.group})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="inflow-to-account-target">
                  Account (target)
                </label>
                <select
                  id="inflow-to-account-target"
                  value={inflowToAccountTarget}
                  onChange={(e) => setInflowToAccountTarget(e.target.value as AccountPlatform)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                >
                  <option value="">Select an account...</option>
                  {accountPlatforms.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </div>

              {(inflowToAccountGroup || inflowToAccountItem) && (
                <div className="bg-bg-surface-2 rounded-input px-3 py-2">
                  <div className="text-text-secondary text-[0.567rem] md:text-xs mb-1">Computed Amount</div>
                  <div className="text-success text-sm md:text-base font-semibold">{formatCurrency(convert(getInflowToAccountAmount(), 'CHF'))}</div>
                </div>
              )}
            </div>
          )}

          {/* Account to Outflow Form */}
          {mappingType === 'accountToOutflow' && (
            <div className="space-y-4">
              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="account-to-outflow-source">
                  Account (source)
                </label>
                <select
                  id="account-to-outflow-source"
                  value={accountToOutflowSource}
                  onChange={(e) => setAccountToOutflowSource(e.target.value as AccountPlatform)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                >
                  <option value="">Select an account...</option>
                  {accountPlatforms.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                  Mode
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="account-to-outflow-mode"
                      value="group"
                      checked={accountToOutflowMode === 'group'}
                      onChange={() => {
                        setAccountToOutflowMode('group')
                        setAccountToOutflowItem('')
                      }}
                      className="w-4 h-4 text-accent-blue focus:ring-accent-blue"
                    />
                    <span className="text-text-primary text-[0.567rem] md:text-xs">Whole Group</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="account-to-outflow-mode"
                      value="item"
                      checked={accountToOutflowMode === 'item'}
                      onChange={() => {
                        setAccountToOutflowMode('item')
                        setAccountToOutflowGroup('')
                      }}
                      className="w-4 h-4 text-accent-blue focus:ring-accent-blue"
                    />
                    <span className="text-text-primary text-[0.567rem] md:text-xs">Single Item</span>
                  </label>
                </div>
              </div>

              {accountToOutflowMode === 'group' ? (
                <div>
                  <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="account-to-outflow-group">
                    Outflow Group
                  </label>
                  <select
                    id="account-to-outflow-group"
                    value={accountToOutflowGroup}
                    onChange={(e) => setAccountToOutflowGroup(e.target.value as OutflowGroupName)}
                    className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                  >
                    <option value="">Select a group...</option>
                    {outflowGroups.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="account-to-outflow-item">
                    Outflow Item
                  </label>
                  <select
                    id="account-to-outflow-item"
                    value={accountToOutflowItem}
                    onChange={(e) => setAccountToOutflowItem(e.target.value)}
                    className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                  >
                    <option value="">Select an item...</option>
                    {outflowItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.item} ({item.group})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(accountToOutflowGroup || accountToOutflowItem) && (
                <div className="bg-bg-surface-2 rounded-input px-3 py-2">
                  <div className="text-text-secondary text-[0.567rem] md:text-xs mb-1">Computed Amount</div>
                  <div className="text-danger text-sm md:text-base font-semibold">{formatCurrency(convert(getAccountToOutflowAmount(), 'CHF'))}</div>
                </div>
              )}
            </div>
          )}

          {/* Account to Account Transfer Form */}
          {mappingType === 'accountToAccount' && (
            <div className="space-y-4">
              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="account-to-account-from">
                  From Account
                </label>
                <select
                  id="account-to-account-from"
                  value={accountToAccountFrom}
                  onChange={(e) => setAccountToAccountFrom(e.target.value as AccountPlatform)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                >
                  <option value="">Select an account...</option>
                  {accountPlatforms.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="account-to-account-to">
                  To Account
                </label>
                <select
                  id="account-to-account-to"
                  value={accountToAccountTo}
                  onChange={(e) => setAccountToAccountTo(e.target.value as AccountPlatform)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                >
                  <option value="">Select an account...</option>
                  {accountPlatforms
                    .filter(p => p !== accountToAccountFrom)
                    .map((platform) => (
                      <option key={platform} value={platform}>
                        {platform}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="account-to-account-amount">
                  Amount (CHF)
                </label>
                <input
                  id="account-to-account-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={accountToAccountAmount}
                  onChange={(e) => setAccountToAccountAmount(e.target.value)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                />
              </div>
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
              Save Mapping
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
            className={`px-4 py-2 text-[0.567rem] md:text-xs font-medium transition-colors ${
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
            className={`px-4 py-2 text-[0.567rem] md:text-xs font-medium transition-colors ${
              type === 'outflow'
                ? 'text-highlight-yellow border-b-2 border-highlight-yellow'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Outflow
          </button>
        </div>

        {error && (
          <div className="mb-3 text-[0.567rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1">
              Platform
            </label>
            <div className="text-text-primary text-xs md:text-sm">{platform}</div>
          </div>

          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="account-item">
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

          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="account-amount">
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
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="account-currency">
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

// Main Cashflow Component
function Cashflow() {
  const { baseCurrency, convert } = useCurrency()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch')
  const { uid } = useAuth()
  const [inflowItems, setInflowItems] = useState<InflowItem[]>([])
  const [outflowItems, setOutflowItems] = useState<OutflowItem[]>([])
  const [accountflowItems, setAccountflowItems] = useState<AccountflowItem[]>([])
  const [accountflowMappings, setAccountflowMappings] = useState<AccountflowMapping[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  // Load data from Firestore on mount and when uid changes
  useEffect(() => {
    if (!uid) {
      setInflowItems([])
      setOutflowItems([])
      setAccountflowItems([])
      setAccountflowMappings([])
      setDataLoading(false)
      return
    }

    const loadData = async () => {
      setDataLoading(true)
      try {
        const [inflow, outflow, mappings] = await Promise.all([
          loadCashflowInflowItems(mockInflowItems, uid),
          loadCashflowOutflowItems(mockOutflowItems, uid),
          loadCashflowAccountflowMappings([], uid),
        ])
        setInflowItems(inflow)
        setOutflowItems(outflow)
        setAccountflowMappings(mappings)
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setDataLoading(false)
      }
    }

    loadData()
  }, [uid])

  useEffect(() => {
    if (uid && !dataLoading) {
      saveCashflowInflowItems(inflowItems, uid).catch((error) => {
        console.error('Failed to save inflow items:', error)
      })
    }
  }, [inflowItems, uid, dataLoading])

  useEffect(() => {
    if (uid && !dataLoading) {
      saveCashflowOutflowItems(outflowItems, uid).catch((error) => {
        console.error('Failed to save outflow items:', error)
      })
    }
  }, [outflowItems, uid, dataLoading])

  useEffect(() => {
    if (uid && !dataLoading) {
      saveCashflowAccountflowMappings(accountflowMappings, uid).catch((error) => {
        console.error('Failed to save accountflow mappings:', error)
      })
    }
  }, [accountflowMappings, uid, dataLoading])

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

  const handleAddMapping = (mapping: AccountflowMapping) => {
    setAccountflowMappings(prev => [...prev, mapping])
  }

  const handleRemoveMapping = (id: string) => {
    setAccountflowMappings(prev => prev.filter(m => m.id !== id))
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
            mappings={accountflowMappings}
            onAddMapping={handleAddMapping}
            onRemoveMapping={handleRemoveMapping}
            inflowItems={inflowItems}
            outflowItems={outflowItems}
          />
        </div>
      </div>
    </div>
  )
}

export default Cashflow

