// TypeScript types
import React, { useState, useRef, useEffect, FormEvent } from 'react'
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { useIncognito } from '../contexts/IncognitoContext'
import { formatMoney, formatNumber, type CurrencyCode } from '../lib/currency'
import {
  saveCashflowInflowItem,
  deleteCashflowInflowItem,
  loadCashflowInflowItems,
  saveCashflowOutflowItem,
  deleteCashflowOutflowItem,
  loadCashflowOutflowItems,
  saveCashflowAccountflowMapping,
  deleteCashflowAccountflowMapping,
  loadCashflowAccountflowMappings,
  savePlatform,
  loadPlatforms,
  type Platform,
} from '../services/storageService'
import { getInflowGroupSum, getOutflowGroupSum, computeMappingAmount } from '../services/cashflowCalculationService'

type InflowGroupName = 'Time' | 'Service' | 'Worker Bees'

export interface InflowItem {
  id: string
  item: string
  amountChf: number // Kept for backward compatibility, but will be calculated from amount and currency
  amount: number // Original amount in original currency
  currency: string // Original currency (CHF, EUR, USD)
  provider: string
  group: InflowGroupName
}

type OutflowGroupName = 'Fix' | 'Variable' | 'Shared Variable' | 'Investments'

export interface OutflowItem {
  id: string
  item: string
  amountChf: number // Kept for backward compatibility, but will be calculated from amount and currency
  amount: number // Original amount in original currency
  currency: string // Original currency (CHF, EUR, USD)
  receiver: string
  group: OutflowGroupName
}

type AccountPlatform = string // Now dynamic from stored platforms

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

// Calculation functions moved to cashflowCalculationService.ts

// Helper component: SectionCard
interface SectionCardProps {
  title: string
  children: React.ReactNode
  total?: number
  totalColor?: 'success' | 'danger'
}

function SectionCard({ title, children, total, totalColor = 'success' }: SectionCardProps) {
  const { baseCurrency } = useCurrency()
  const { isIncognito } = useIncognito()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch', { incognito: isIncognito })
  
  return (
    <div className="bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
      {/* Header: title + totals, then separator */}
      <div className="mb-6 pb-4 border-b border-border-strong">
        <Heading level={2}>{title}</Heading>
        {total !== undefined && (
          <TotalText
            variant={totalColor === 'success' ? 'inflow' : 'outflow'}
            className="block mt-1"
          >
            {formatCurrency(total)}
          </TotalText>
        )}
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
  onAddItem: (group: InflowGroupName, data: { item: string; amountChf: number; amount: number; currency: string; provider: string }) => void
  onEditItem: (id: string, data: { item: string; amountChf: number; amount: number; currency: string; provider: string }) => void
  onRemoveItem: (id: string) => void
}

function InflowSection({ items, onAddItem, onEditItem, onRemoveItem }: InflowSectionProps) {
  const { baseCurrency, convert } = useCurrency()
  const { isIncognito } = useIncognito()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch', { incognito: isIncognito })
  
  const inflowGroups: InflowGroupName[] = ['Time', 'Service', 'Worker Bees']
  const totalInflowChf = items.reduce((sum, item) => {
    // Use original amount and currency if available, otherwise fall back to amountChf
    if (item.amount !== undefined && item.currency) {
      return sum + convert(item.amount, item.currency as CurrencyCode)
    }
    return sum + item.amountChf
  }, 0)
  const totalInflow = convert(totalInflowChf, 'CHF')
  const [addItemGroup, setAddItemGroup] = useState<InflowGroupName | null>(null)
  const [editingItem, setEditingItem] = useState<InflowItem | null>(null)

  return (
    <>
    <SectionCard title="Inflow" total={totalInflow} totalColor="success">
      <div className="space-y-6">
        {inflowGroups.map((groupName) => {
          const groupItems = items.filter((i) => i.group === groupName)
          const totalChf = groupItems.reduce((sum, item) => {
            // Use original amount and currency if available, otherwise fall back to amountChf
            if (item.amount !== undefined && item.currency) {
              return sum + convert(item.amount, item.currency as CurrencyCode)
            }
            return sum + item.amountChf
          }, 0)
          const total = convert(totalChf, 'CHF')

          // Sort items: 1st by Provider A-Z, 2nd by amount high-low
          const sortedItems = [...groupItems].sort((a, b) => {
            const providerCompare = a.provider.localeCompare(b.provider)
            if (providerCompare !== 0) return providerCompare
            return b.amountChf - a.amountChf
          })

          return (
            <div key={groupName} className="bg-bg-frame border border-border-subtle rounded-input p-4">
              {/* Title + separator */}
              <div className="mb-4 pb-2 border-b border-border-subtle">
                <div className="flex items-end justify-between gap-3">
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
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-separate" style={{ tableLayout: 'fixed', width: '100%', borderSpacing: '0 6px' }}>
                  <tbody>
                    {sortedItems.length === 0 ? (
                      <tr>
                        <td className="py-4 text-center text-text-muted text-[0.567rem] md:text-xs">
                          No items yet. Click "Add Item" to get started.
                        </td>
                      </tr>
                    ) : (
                      sortedItems.map((item) => (
                        <tr key={item.id}>
                          <td className="p-0 align-top">
                            <div className="flex items-stretch bg-bg-surface-1 border border-border-subtle rounded-input overflow-hidden p-[10px]">
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="text-[0.63rem] md:text-[0.79rem] truncate">{item.item}</div>
                                <div className="text-text-muted text-[0.55rem] md:text-[0.774rem] truncate">
                                  {item.provider}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0 text-right px-2 flex flex-col justify-center">
                                <TotalText variant="inflow" className="text-[0.63rem] md:text-[0.79rem] whitespace-nowrap">
                                  {formatCurrency(
                                    item.amount !== undefined && item.currency
                                      ? convert(item.amount, item.currency as CurrencyCode)
                                      : convert(item.amountChf, 'CHF')
                                  )}
                                </TotalText>
                              </div>
                              <div className="flex-shrink-0 w-3" aria-hidden="true" />
                              <div className="flex-shrink-0 w-px self-stretch bg-border-subtle" aria-hidden="true" />
                              <div className="flex-shrink-0 w-3" aria-hidden="true" />
                              <div className="flex-shrink-0 flex items-center justify-end">
                                <CashflowItemMenu
                                  itemId={item.id}
                                  itemType="inflow"
                                  onEdit={() => setEditingItem(item)}
                                  onRemove={() => onRemoveItem(item.id)}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
    {(addItemGroup || editingItem) && (
      <AddInflowItemModal
        group={editingItem ? editingItem.group : addItemGroup!}
        editingItem={editingItem}
        onClose={() => {
          setAddItemGroup(null)
          setEditingItem(null)
        }}
        onSubmit={(data) => {
          if (editingItem) {
            onEditItem(editingItem.id, data)
            setEditingItem(null)
          } else {
            onAddItem(addItemGroup!, data)
            setAddItemGroup(null)
          }
        }}
      />
    )}
    </>
  )
}

// Outflow Section Component
interface OutflowSectionProps {
  items: OutflowItem[]
  onAddItem: (group: OutflowGroupName, data: { item: string; amountChf: number; amount: number; currency: string; receiver: string }) => void
  onEditItem: (id: string, data: { item: string; amountChf: number; amount: number; currency: string; receiver: string }) => void
  onRemoveItem: (id: string) => void
}

function OutflowSection({ items, onAddItem, onEditItem, onRemoveItem }: OutflowSectionProps) {
  const { baseCurrency, convert } = useCurrency()
  const { isIncognito } = useIncognito()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch', { incognito: isIncognito })
  
  const outflowGroups: OutflowGroupName[] = ['Fix', 'Variable', 'Shared Variable', 'Investments']
  const totalOutflowChf = items.reduce((sum, item) => {
    // Use original amount and currency if available, otherwise fall back to amountChf
    if (item.amount !== undefined && item.currency) {
      return sum + convert(item.amount, item.currency as CurrencyCode)
    }
    return sum + item.amountChf
  }, 0)
  const totalOutflow = convert(totalOutflowChf, 'CHF')
  const [addItemGroup, setAddItemGroup] = useState<OutflowGroupName | null>(null)
  const [editingItem, setEditingItem] = useState<OutflowItem | null>(null)

  return (
    <>
    <SectionCard title="Outflow" total={totalOutflow} totalColor="danger">
      <div className="space-y-6">
        {outflowGroups.map((groupName) => {
          const groupItems = items.filter((i) => i.group === groupName)
          const totalChf = groupItems.reduce((sum, item) => {
            // Use original amount and currency if available, otherwise fall back to amountChf
            if (item.amount !== undefined && item.currency) {
              return sum + convert(item.amount, item.currency as CurrencyCode)
            }
            return sum + item.amountChf
          }, 0)
          const total = convert(totalChf, 'CHF')

          // Sort items: 1st by Receiver A-Z, 2nd by amount high-low
          const sortedItems = [...groupItems].sort((a, b) => {
            const receiverCompare = a.receiver.localeCompare(b.receiver)
            if (receiverCompare !== 0) return receiverCompare
            return b.amountChf - a.amountChf
          })

          return (
            <div key={groupName} className="bg-bg-frame border border-border-subtle rounded-input p-4">
              {/* Title + separator */}
              <div className="mb-4 pb-2 border-b border-border-subtle">
                <div className="flex items-end justify-between gap-3">
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
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-separate" style={{ tableLayout: 'fixed', width: '100%', borderSpacing: '0 6px' }}>
                  <tbody>
                    {sortedItems.length === 0 ? (
                      <tr>
                        <td className="py-4 text-center text-text-muted text-[0.567rem] md:text-xs">
                          No items yet. Click "Add Item" to get started.
                        </td>
                      </tr>
                    ) : (
                      sortedItems.map((item) => (
                        <tr key={item.id}>
                          <td className="p-0 align-top">
                            <div className="flex items-stretch bg-bg-surface-1 border border-border-subtle rounded-input overflow-hidden p-[10px]">
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="text-[0.63rem] md:text-[0.79rem] truncate">{item.item}</div>
                                <div className="text-text-muted text-[0.55rem] md:text-[0.774rem] truncate">
                                  {item.receiver}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0 text-right px-2 flex flex-col justify-center">
                                <TotalText variant="outflow" className="text-[0.63rem] md:text-[0.79rem] whitespace-nowrap">
                                  {formatCurrency(
                                    item.amount !== undefined && item.currency
                                      ? convert(item.amount, item.currency as CurrencyCode)
                                      : convert(item.amountChf, 'CHF')
                                  )}
                                </TotalText>
                              </div>
                              <div className="flex-shrink-0 w-3" aria-hidden="true" />
                              <div className="flex-shrink-0 w-px self-stretch bg-border-subtle" aria-hidden="true" />
                              <div className="flex-shrink-0 w-3" aria-hidden="true" />
                              <div className="flex-shrink-0 flex items-center justify-end">
                                <CashflowItemMenu
                                  itemId={item.id}
                                  itemType="outflow"
                                  onEdit={() => setEditingItem(item)}
                                  onRemove={() => onRemoveItem(item.id)}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
    {(addItemGroup || editingItem) && (
      <AddOutflowItemModal
        group={editingItem ? editingItem.group : addItemGroup!}
        editingItem={editingItem}
        onClose={() => {
          setAddItemGroup(null)
          setEditingItem(null)
        }}
        onSubmit={(data) => {
          if (editingItem) {
            onEditItem(editingItem.id, data)
            setEditingItem(null)
          } else {
            onAddItem(addItemGroup!, data)
            setAddItemGroup(null)
          }
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

// Platformflow Section Component
interface AccountflowSectionProps {
  mappings: AccountflowMapping[]
  platforms: Platform[]
  onAddMapping: (mapping: AccountflowMapping) => void
  onEditMapping: (mapping: AccountflowMapping) => void
  onRemoveMapping: (id: string) => void
  inflowItems: InflowItem[]
  outflowItems: OutflowItem[]
}

function AccountflowSection({ mappings, platforms, onAddMapping, onEditMapping, onRemoveMapping, inflowItems, outflowItems }: AccountflowSectionProps) {
  const { baseCurrency, convert } = useCurrency()
  const { isIncognito } = useIncognito()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch', { incognito: isIncognito })
  const [showAddMappingModal, setShowAddMappingModal] = useState(false)
  const [editingMapping, setEditingMapping] = useState<AccountflowMapping | null>(null)
  const [preselectedAccount, setPreselectedAccount] = useState<AccountPlatform | null>(null)
  const [showEmptyPlatforms, setShowEmptyPlatforms] = useState(false)
  
  // Helper to get label for account-to-account mappings
  const getAccountToAccountLabel = (mapping: AccountToAccountMapping, account: AccountPlatform): string => {
    if (mapping.toAccount === account) {
      return `From ${mapping.fromAccount}`
    } else {
      return `To ${mapping.toAccount}`
    }
  }

  // Helper to get all mappings for an account (both inflow and outflow)
  const getAccountMappings = (account: AccountPlatform): Array<{
    mapping: AccountflowMapping
    type: 'inflow' | 'outflow'
    label: string
  }> => {
    const result: Array<{
      mapping: AccountflowMapping
      type: 'inflow' | 'outflow'
      label: string
    }> = []

    mappings.forEach(m => {
      if (m.kind === 'inflowToAccount' && m.account === account) {
        result.push({
          mapping: m,
          type: 'inflow',
          label: getMappingLabel(m, inflowItems, outflowItems)
        })
      } else if (m.kind === 'accountToOutflow' && m.account === account) {
        result.push({
          mapping: m,
          type: 'outflow',
          label: getMappingLabel(m, inflowItems, outflowItems)
        })
      } else if (m.kind === 'accountToAccount') {
        if (m.toAccount === account) {
          // This is an inflow to this account
          result.push({
            mapping: m,
            type: 'inflow',
            label: getAccountToAccountLabel(m, account)
          })
        } else if (m.fromAccount === account) {
          // This is an outflow from this account
          result.push({
            mapping: m,
            type: 'outflow',
            label: getAccountToAccountLabel(m, account)
          })
        }
      }
    })

    return result
  }

  // Helper function to render a platform card
  const renderPlatformCard = (platform: Platform) => {
    const account = platform.name as AccountPlatform
    const accountMappings = getAccountMappings(account)

    // Calculate totals
    const totalInflowChf = accountMappings
      .filter(m => m.type === 'inflow')
      .reduce((sum, m) => sum + computeMappingAmount(m.mapping, inflowItems, outflowItems, convert), 0)

    const totalOutflowChf = accountMappings
      .filter(m => m.type === 'outflow')
      .reduce((sum, m) => sum + computeMappingAmount(m.mapping, inflowItems, outflowItems, convert), 0)

    const spareChf = totalInflowChf - totalOutflowChf

    const totalInflow = convert(totalInflowChf, 'CHF')
    const totalOutflow = convert(totalOutflowChf, 'CHF')
    const spare = convert(spareChf, 'CHF')

    // Sort mappings: 1st priority Inflow first, then Outflow; within each type, sort by amount high-low
    const sortedMappings = [...accountMappings].sort((a, b) => {
      // First priority: Inflow items first (type === 'inflow' comes before 'outflow')
      if (a.type !== b.type) {
        return a.type === 'inflow' ? -1 : 1
      }
      // Second priority: Within same type, sort by amount high-low
      const amountA = computeMappingAmount(a.mapping, inflowItems, outflowItems, convert)
      const amountB = computeMappingAmount(b.mapping, inflowItems, outflowItems, convert)
      return amountB - amountA
    })

    return (
      <div key={account} className="bg-bg-frame border border-border-subtle rounded-input p-4">
        {/* Title + separator */}
        <div className="mb-4 pb-2 border-b border-border-subtle">
          <div className="flex items-end justify-between gap-3">
            <div>
              <Heading level={3}>{account}</Heading>
              <div className="mt-1 flex flex-col gap-1">
                <TotalText variant="inflow">{formatCurrency(totalInflow)}</TotalText>
                <TotalText variant="outflow">{formatCurrency(totalOutflow)}</TotalText>
                <TotalText variant="spare">{formatCurrency(spare)}</TotalText>
              </div>
            </div>
            <button
              onClick={() => {
                setPreselectedAccount(account)
                setShowAddMappingModal(true)
              }}
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

        {/* Content */}
        {/* Unified Table with Item, Inflow/Outflow (combined), Actions */}
        {sortedMappings.length === 0 ? (
          <div className="text-text-muted text-[0.567rem] md:text-xs">No mappings</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate" style={{ tableLayout: 'fixed', width: '100%', borderSpacing: '0 6px' }}>
              <tbody>
                {sortedMappings.map(({ mapping, type, label }) => {
                  const amountChf = computeMappingAmount(mapping, inflowItems, outflowItems, convert)
                  const amount = convert(amountChf, 'CHF')
                  return (
                    <tr key={mapping.id}>
                      <td className="p-0 align-top">
                        <div className="flex items-stretch bg-bg-surface-1 border border-border-subtle rounded-input overflow-hidden p-[10px]">
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="text-[0.63rem] md:text-[0.79rem] truncate">{label}</div>
                          </div>
                          <div className="flex-1 min-w-0 text-right px-2 flex flex-col justify-center">
                            <TotalText
                              variant={type === 'inflow' ? 'inflow' : 'outflow'}
                              className="text-[0.63rem] md:text-[0.79rem] whitespace-nowrap"
                            >
                              {formatCurrency(amount)}
                            </TotalText>
                          </div>
                          <div className="flex-shrink-0 w-3" aria-hidden="true" />
                          <div className="flex-shrink-0 w-px self-stretch bg-border-subtle" aria-hidden="true" />
                          <div className="flex-shrink-0 w-3" aria-hidden="true" />
                          <div className="flex-shrink-0 flex items-center justify-end">
                            <CashflowItemMenu
                              itemId={mapping.id}
                              itemType="accountflow"
                              onEdit={() => setEditingMapping(mapping)}
                              onRemove={() => onRemoveMapping(mapping.id)}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // Separate platforms into those with mappings and those without
  const platformsWithMappings: Array<{ platform: Platform; inflow: number }> = []
  const platformsWithoutMappings: Platform[] = []

  platforms.forEach(platform => {
    const account = platform.name as AccountPlatform
    const accountMappings = getAccountMappings(account)
    
    if (accountMappings.length > 0) {
      // Calculate total inflow for sorting
      const totalInflowChf = accountMappings
        .filter(m => m.type === 'inflow')
        .reduce((sum, m) => sum + computeMappingAmount(m.mapping, inflowItems, outflowItems, convert), 0)
      platformsWithMappings.push({ platform, inflow: totalInflowChf })
    } else {
      platformsWithoutMappings.push(platform)
    }
  })

  // Sort platforms with mappings by highest inflow first
  platformsWithMappings.sort((a, b) => b.inflow - a.inflow)

  return (
    <>
      <div className="bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
        <div className="mb-6 pb-4 border-b border-border-strong">
          <Heading level={2}>Platformflow</Heading>
        </div>

        {/* Account Visualizations */}
        <div className="space-y-8">
          {platforms.length > 0 ? (
            <>
              {/* Platforms with mappings - sorted by highest inflow */}
              {platformsWithMappings.map(({ platform }) => renderPlatformCard(platform))}

              {/* Platforms without mappings - collapsible section */}
              {platformsWithoutMappings.length > 0 && (
                <div className="border-t-2 border-border-strong pt-6 mt-6">
                  <button
                    onClick={() => setShowEmptyPlatforms(!showEmptyPlatforms)}
                    className="w-full flex items-center justify-between bg-bg-surface-2 border border-border-subtle hover:border-[#DAA520] rounded-input px-4 py-3 transition-all duration-200 hover:shadow-card group"
                  >
                    <div className="flex items-center gap-3">
                      <svg
                        className={`w-5 h-5 text-[#DAA520] transition-transform duration-200 ${showEmptyPlatforms ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                      <span className="text-text-primary text-xs md:text-sm font-semibold">
                        Platforms without mappings
                      </span>
                      <span className="bg-bg-surface-3 text-text-secondary text-[0.567rem] md:text-xs font-medium px-2 py-0.5 rounded-full">
                        {platformsWithoutMappings.length}
                      </span>
                    </div>
                    <span className="text-text-secondary text-[0.567rem] md:text-xs group-hover:text-[#DAA520] transition-colors">
                      {showEmptyPlatforms ? 'Hide' : 'Show'}
                    </span>
                  </button>
                  {showEmptyPlatforms && (
                    <div className="space-y-8 mt-6">
                      {platformsWithoutMappings.map(platform => renderPlatformCard(platform))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-text-muted text-[0.567rem] md:text-xs py-4">
              No platforms available. Please add platforms in Settings.
            </div>
          )}
        </div>
      </div>

      {(showAddMappingModal || editingMapping) && (
        <AddMappingModal
          inflowItems={inflowItems}
          outflowItems={outflowItems}
          platforms={platforms}
          editingMapping={editingMapping}
          preselectedAccount={preselectedAccount}
          onClose={() => {
            setShowAddMappingModal(false)
            setEditingMapping(null)
            setPreselectedAccount(null)
          }}
          onSubmit={(mapping) => {
            if (editingMapping) {
              onEditMapping(mapping)
              setEditingMapping(null)
            } else {
              onAddMapping(mapping)
              setShowAddMappingModal(false)
            }
            setPreselectedAccount(null)
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
        className="p-0"
        title="Options"
      >
        <svg className="w-6 h-6 text-text-secondary" fill="currentColor" viewBox="0 0 24 24">
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
  editingItem?: InflowItem | null
  onClose: () => void
  onSubmit: (data: { item: string; amountChf: number; amount: number; currency: string; provider: string }) => void
}

function AddInflowItemModal({ group, editingItem, onClose, onSubmit }: AddInflowItemModalProps) {
  const { convert } = useCurrency()
  const [item, setItem] = useState('')
  const [inflow, setInflow] = useState('')
  const [currency, setCurrency] = useState<CurrencyCode>('CHF')
  const [provider, setProvider] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Populate form when editing
  useEffect(() => {
    if (editingItem) {
      setItem(editingItem.item)
      // Use original amount and currency if available, otherwise fall back to amountChf in CHF
      if (editingItem.amount !== undefined && editingItem.currency) {
        setInflow(editingItem.amount.toString())
        setCurrency(editingItem.currency as CurrencyCode)
      } else {
        // Backward compatibility: assume CHF
        setInflow(editingItem.amountChf.toString())
        setCurrency('CHF')
      }
      setProvider(editingItem.provider)
    } else {
      setItem('')
      setInflow('')
      setCurrency('CHF')
      setProvider('')
    }
  }, [editingItem])

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

    // Convert to CHF for backward compatibility (amountChf field)
    const amountChf = convert(parsedInflow, currency)

    onSubmit({
      item: item.trim(),
      amountChf, // Converted to CHF for backward compatibility
      amount: parsedInflow, // Original amount
      currency, // Original currency
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
          {editingItem ? 'Edit Item' : 'Add Item'} – {group}
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
              {editingItem ? 'Save Changes' : 'Add Item'}
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
  editingItem?: OutflowItem | null
  onClose: () => void
  onSubmit: (data: { item: string; amountChf: number; amount: number; currency: string; receiver: string }) => void
}

function AddOutflowItemModal({ group, editingItem, onClose, onSubmit }: AddOutflowItemModalProps) {
  const { convert } = useCurrency()
  const [item, setItem] = useState('')
  const [outflow, setOutflow] = useState('')
  const [currency, setCurrency] = useState<CurrencyCode>('CHF')
  const [receiver, setReceiver] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Populate form when editing
  useEffect(() => {
    if (editingItem) {
      setItem(editingItem.item)
      // Use original amount and currency if available, otherwise fall back to amountChf in CHF
      if (editingItem.amount !== undefined && editingItem.currency) {
        setOutflow(editingItem.amount.toString())
        setCurrency(editingItem.currency as CurrencyCode)
      } else {
        // Backward compatibility: assume CHF
        setOutflow(editingItem.amountChf.toString())
        setCurrency('CHF')
      }
      setReceiver(editingItem.receiver)
    } else {
      setItem('')
      setOutflow('')
      setCurrency('CHF')
      setReceiver('')
    }
  }, [editingItem])

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

    // Convert to CHF for backward compatibility (amountChf field)
    const amountChf = convert(parsedOutflow, currency)

    onSubmit({
      item: item.trim(),
      amountChf, // Converted to CHF for backward compatibility
      amount: parsedOutflow, // Original amount
      currency, // Original currency
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
          {editingItem ? 'Edit Item' : 'Add Item'} – {group}
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
              {editingItem ? 'Save Changes' : 'Add Item'}
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
  platforms: Platform[]
  editingMapping?: AccountflowMapping | null
  preselectedAccount?: AccountPlatform | null
  onClose: () => void
  onSubmit: (mapping: AccountflowMapping) => void
}

function AddMappingModal({ inflowItems, outflowItems, platforms, editingMapping, preselectedAccount, onClose, onSubmit }: AddMappingModalProps) {
  const { baseCurrency, convert } = useCurrency()
  const { isIncognito } = useIncognito()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch', { incognito: isIncognito })
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

  // Populate form when editing or when account is preselected
  useEffect(() => {
    if (editingMapping) {
      setMappingType(editingMapping.kind)
      
      if (editingMapping.kind === 'inflowToAccount') {
        setInflowToAccountMode(editingMapping.mode)
        if (editingMapping.mode === 'group') {
          setInflowToAccountGroup(editingMapping.group || '')
          setInflowToAccountItem('')
        } else {
          setInflowToAccountItem(editingMapping.inflowItemId || '')
          setInflowToAccountGroup('')
        }
        setInflowToAccountTarget(editingMapping.account)
      } else if (editingMapping.kind === 'accountToOutflow') {
        setAccountToOutflowSource(editingMapping.account)
        setAccountToOutflowMode(editingMapping.mode)
        if (editingMapping.mode === 'group') {
          setAccountToOutflowGroup(editingMapping.group || '')
          setAccountToOutflowItem('')
        } else {
          setAccountToOutflowItem(editingMapping.outflowItemId || '')
          setAccountToOutflowGroup('')
        }
      } else if (editingMapping.kind === 'accountToAccount') {
        setAccountToAccountFrom(editingMapping.fromAccount)
        setAccountToAccountTo(editingMapping.toAccount)
        setAccountToAccountAmount(editingMapping.amountChf.toString())
      }
    } else {
      // Reset form when not editing
      setMappingType('inflowToAccount')
      setInflowToAccountMode('group')
      setInflowToAccountGroup('')
      setInflowToAccountItem('')
      // Pre-select account if provided
      setInflowToAccountTarget(preselectedAccount || '')
      setAccountToOutflowSource(preselectedAccount || '')
      setAccountToOutflowMode('group')
      setAccountToOutflowGroup('')
      setAccountToOutflowItem('')
      setAccountToAccountFrom(preselectedAccount || '')
      setAccountToAccountTo('')
      setAccountToAccountAmount('')
    }
  }, [editingMapping, preselectedAccount])

  // Calculate computed amounts for display
  const getInflowToAccountAmount = (): number => {
    if (inflowToAccountMode === 'group' && inflowToAccountGroup) {
      return getInflowGroupSum(inflowToAccountGroup, inflowItems, convert)
    } else if (inflowToAccountMode === 'item' && inflowToAccountItem) {
      const item = inflowItems.find(i => i.id === inflowToAccountItem)
      if (!item) return 0
      // Use original amount and currency if available, otherwise fall back to amountChf
      if (item.amount !== undefined && item.currency) {
        return convert(item.amount, item.currency as CurrencyCode)
      }
      return item.amountChf
    }
    return 0
  }

  const getAccountToOutflowAmount = (): number => {
    if (accountToOutflowMode === 'group' && accountToOutflowGroup) {
      return getOutflowGroupSum(accountToOutflowGroup, outflowItems, convert)
    } else if (accountToOutflowMode === 'item' && accountToOutflowItem) {
      const item = outflowItems.find(i => i.id === accountToOutflowItem)
      if (!item) return 0
      // Use original amount and currency if available, otherwise fall back to amountChf
      if (item.amount !== undefined && item.currency) {
        return convert(item.amount, item.currency as CurrencyCode)
      }
      return item.amountChf
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
      const targetPlatform = editingMapping ? inflowToAccountTarget : (preselectedAccount || inflowToAccountTarget)
      if (!targetPlatform) {
        setError('Target platform is required.')
        return
      }

      const id = editingMapping?.id || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `mapping-${Date.now()}`)
      mapping = {
        id,
        kind: 'inflowToAccount',
        mode: inflowToAccountMode,
        ...(inflowToAccountMode === 'group' ? { group: inflowToAccountGroup } : { inflowItemId: inflowToAccountItem }),
        account: targetPlatform,
      }
    } else if (mappingType === 'accountToOutflow') {
      const sourcePlatform = editingMapping ? accountToOutflowSource : (preselectedAccount || accountToOutflowSource)
      if (!sourcePlatform) {
        setError('Source platform is required.')
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

      const id = editingMapping?.id || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `mapping-${Date.now()}`)
      mapping = {
        id,
        kind: 'accountToOutflow',
        mode: accountToOutflowMode,
        ...(accountToOutflowMode === 'group' ? { group: accountToOutflowGroup } : { outflowItemId: accountToOutflowItem }),
        account: sourcePlatform,
      }
    } else {
      // accountToAccount
      const fromPlatform = editingMapping ? accountToAccountFrom : (preselectedAccount || accountToAccountFrom)
      if (!fromPlatform) {
        setError('Source platform is required.')
        return
      }
      if (!accountToAccountTo) {
        setError('Please select a target platform.')
        return
      }
      if (fromPlatform === accountToAccountTo) {
        setError('Source and target platforms must be different.')
        return
      }
      const parsedAmount = Number(accountToAccountAmount)
      if (!accountToAccountAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        setError('Please enter a valid amount greater than 0.')
        return
      }

      const id = editingMapping?.id || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `mapping-${Date.now()}`)
      mapping = {
        id,
        kind: 'accountToAccount',
        fromAccount: fromPlatform,
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
          {editingMapping ? 'Edit Mapping' : 'Add Mapping'}
        </Heading>

        {error && (
          <div className="mb-3 text-[0.567rem] md:text-xs text-danger bg-bg-surface-2 border border-danger/40 rounded-input px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mapping Type Selection - Fancy Toggle Switch */}
          <div>
            <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
              Mapping Type
            </label>
            <div className="relative inline-flex rounded-lg bg-bg-surface-2 border border-border-subtle p-1 w-full" role="group">
              <button
                type="button"
                onClick={() => {
                  setMappingType('inflowToAccount')
                }}
                className={`flex-1 px-3 py-2 text-[0.567rem] md:text-xs font-medium rounded-md transition-all duration-200 ${
                  mappingType === 'inflowToAccount'
                    ? 'bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] shadow-card'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Inflow to Platform
              </button>
              <button
                type="button"
                onClick={() => {
                  setMappingType('accountToOutflow')
                }}
                className={`flex-1 px-3 py-2 text-[0.567rem] md:text-xs font-medium rounded-md transition-all duration-200 ${
                  mappingType === 'accountToOutflow'
                    ? 'bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] shadow-card'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Platform to Outflow
              </button>
              <button
                type="button"
                onClick={() => {
                  setMappingType('accountToAccount')
                  // When switching to accountToAccount, set from account to preselected if available
                  if (preselectedAccount && !accountToAccountFrom) {
                    setAccountToAccountFrom(preselectedAccount)
                  }
                }}
                className={`flex-1 px-3 py-2 text-[0.567rem] md:text-xs font-medium rounded-md transition-all duration-200 ${
                  mappingType === 'accountToAccount'
                    ? 'bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] shadow-card'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Platform Transfer
              </button>
            </div>
          </div>

          {/* Inflow to Platform Form */}
          {mappingType === 'inflowToAccount' && (
            <div className="space-y-4">
              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                  Mode
                </label>
                <div className="relative inline-flex rounded-lg bg-bg-surface-2 border border-border-subtle p-1" role="group">
                  <button
                    type="button"
                    onClick={() => {
                      setInflowToAccountMode('group')
                      setInflowToAccountItem('')
                    }}
                    className={`px-4 py-2 text-[0.567rem] md:text-xs font-medium rounded-md transition-all duration-200 ${
                      inflowToAccountMode === 'group'
                        ? 'bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] shadow-card'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Whole Group
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInflowToAccountMode('item')
                      setInflowToAccountGroup('')
                    }}
                    className={`px-4 py-2 text-[0.567rem] md:text-xs font-medium rounded-md transition-all duration-200 ${
                      inflowToAccountMode === 'item'
                        ? 'bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] shadow-card'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Single Item
                  </button>
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
                    {[...inflowItems].sort((a, b) => {
                      const indexA = inflowGroups.indexOf(a.group)
                      const indexB = inflowGroups.indexOf(b.group)
                      if (indexA !== indexB) {
                        return indexA - indexB
                      }
                      // If same group, sort by item name
                      return a.item.localeCompare(b.item)
                    }).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.item} ({item.group})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="inflow-to-account-target">
                  Target Platform
                </label>
                <select
                  id="inflow-to-account-target"
                  value={inflowToAccountTarget}
                  onChange={(e) => setInflowToAccountTarget(e.target.value as AccountPlatform)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                >
                  <option value="">Select a platform...</option>
                  {platforms.map((platform) => (
                    <option key={platform.id} value={platform.name}>
                      {platform.name}
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

          {/* Platform to Outflow Form */}
          {mappingType === 'accountToOutflow' && (
            <div className="space-y-4">
              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-2">
                  Mode
                </label>
                <div className="relative inline-flex rounded-lg bg-bg-surface-2 border border-border-subtle p-1" role="group">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountToOutflowMode('group')
                      setAccountToOutflowItem('')
                    }}
                    className={`px-4 py-2 text-[0.567rem] md:text-xs font-medium rounded-md transition-all duration-200 ${
                      accountToOutflowMode === 'group'
                        ? 'bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] shadow-card'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Whole Group
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountToOutflowMode('item')
                      setAccountToOutflowGroup('')
                    }}
                    className={`px-4 py-2 text-[0.567rem] md:text-xs font-medium rounded-md transition-all duration-200 ${
                      accountToOutflowMode === 'item'
                        ? 'bg-gradient-to-r from-[#DAA520] to-[#B87333] text-[#050A1A] shadow-card'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Single Item
                  </button>
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
                    {[...outflowItems].sort((a, b) => {
                      const indexA = outflowGroups.indexOf(a.group)
                      const indexB = outflowGroups.indexOf(b.group)
                      if (indexA !== indexB) {
                        return indexA - indexB
                      }
                      // If same group, sort by item name
                      return a.item.localeCompare(b.item)
                    }).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.item} ({item.group})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="account-to-outflow-source">
                  Source Platform
                </label>
                <select
                  id="account-to-outflow-source"
                  value={accountToOutflowSource}
                  onChange={(e) => setAccountToOutflowSource(e.target.value as AccountPlatform)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                >
                  <option value="">Select a platform...</option>
                  {platforms.map((platform) => (
                    <option key={platform.id} value={platform.name}>
                      {platform.name}
                    </option>
                  ))}
                </select>
              </div>

              {(accountToOutflowGroup || accountToOutflowItem) && (
                <div className="bg-bg-surface-2 rounded-input px-3 py-2">
                  <div className="text-text-secondary text-[0.567rem] md:text-xs mb-1">Computed Amount</div>
                  <div className="text-danger text-sm md:text-base font-semibold">{formatCurrency(convert(getAccountToOutflowAmount(), 'CHF'))}</div>
                </div>
              )}
            </div>
          )}

          {/* Platform to Platform Transfer Form */}
          {mappingType === 'accountToAccount' && (
            <div className="space-y-4">
              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="account-to-account-from">
                  From Platform
                </label>
                <select
                  id="account-to-account-from"
                  value={accountToAccountFrom}
                  onChange={(e) => setAccountToAccountFrom(e.target.value as AccountPlatform)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                >
                  <option value="">Select a platform...</option>
                  {platforms
                    .filter(p => p.name !== accountToAccountTo)
                    .map((platform) => (
                      <option key={platform.id} value={platform.name}>
                        {platform.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-text-secondary text-[0.567rem] md:text-xs font-medium mb-1" htmlFor="account-to-account-to">
                  To Platform
                </label>
                <select
                  id="account-to-account-to"
                  value={accountToAccountTo}
                  onChange={(e) => setAccountToAccountTo(e.target.value as AccountPlatform)}
                  className="w-full bg-bg-surface-2 border border-border-subtle rounded-input px-3 py-2 text-text-primary text-xs md:text-sm focus:outline-none focus:border-accent-blue"
                >
                  <option value="">Select a platform...</option>
                  {platforms
                    .filter(p => p.name !== accountToAccountFrom)
                    .map((platform) => (
                      <option key={platform.id} value={platform.name}>
                        {platform.name}
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
  const { isIncognito } = useIncognito()
  const formatCurrency = (value: number) => formatMoney(value, baseCurrency, 'ch', { incognito: isIncognito })
  const { uid } = useAuth()
  const [inflowItems, setInflowItems] = useState<InflowItem[]>([])
  const [outflowItems, setOutflowItems] = useState<OutflowItem[]>([])
  const [accountflowItems, setAccountflowItems] = useState<AccountflowItem[]>([])
  const [accountflowMappings, setAccountflowMappings] = useState<AccountflowMapping[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
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
        const [inflow, outflow, mappings, loadedPlatforms] = await Promise.all([
          loadCashflowInflowItems(mockInflowItems, uid),
          loadCashflowOutflowItems(mockOutflowItems, uid),
          loadCashflowAccountflowMappings([], uid),
          loadPlatforms(defaultPlatforms, uid),
        ])
        setInflowItems(inflow)
        setOutflowItems(outflow)
        
        // Filter out mappings for removed platforms
        const platformNames = new Set(loadedPlatforms.map(p => p.name))
        const filteredMappings = mappings.filter(m => {
          if (m.kind === 'inflowToAccount') {
            return platformNames.has(m.account)
          } else if (m.kind === 'accountToOutflow') {
            return platformNames.has(m.account)
          } else if (m.kind === 'accountToAccount') {
            return platformNames.has(m.fromAccount) && platformNames.has(m.toAccount)
          }
          return true
        })
        
        // Remove mappings for deleted platforms (per-document deletes)
        if (filteredMappings.length !== mappings.length) {
          const filteredIds = new Set(filteredMappings.map(m => m.id))
          const removed = mappings.filter(m => !filteredIds.has(m.id))
          await Promise.all(
            removed.map(async (m) => {
              const res = await deleteCashflowAccountflowMapping(m.id, uid)
              if (!res.success) {
                console.error('[Cashflow] Failed to delete mapping for removed platform:', res.reason)
              }
            })
          )
        }
        
        setAccountflowMappings(filteredMappings)
        
        // Calculate and update platform order based on inflow
        const platformInflows = new Map<string, number>()
        filteredMappings.forEach(m => {
          if (m.kind === 'inflowToAccount') {
            const amount = computeMappingAmount(m, inflow, outflow, convert)
            const current = platformInflows.get(m.account) || 0
            platformInflows.set(m.account, current + amount)
          }
        })
        
        // Update platform orders and sort by highest inflow first
        const updatedPlatforms = loadedPlatforms.map(p => ({
          ...p,
          order: platformInflows.get(p.name) || 0
        })).sort((a, b) => b.order - a.order)
        
        setPlatforms(updatedPlatforms)
        
        // Save updated platform orders if they changed
        const orderChanged = updatedPlatforms.some((p, i) => {
          const original = loadedPlatforms.find(op => op.id === p.id)
          return !original || original.order !== p.order
        })
        if (orderChanged) {
          const changed = updatedPlatforms.filter(p => {
            const original = loadedPlatforms.find(op => op.id === p.id)
            return !original || original.order !== p.order
          })
          await Promise.all(
            changed.map(async (p) => {
              const res = await savePlatform(p, uid)
              if (!res.success) {
                console.error('[Cashflow] Failed to save platform order:', res.reason)
              }
            })
          )
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setDataLoading(false)
      }
    }

    loadData()
  }, [uid])

  const getClientUpdatedAt = (obj: any): Date | null => {
    const updatedAt = obj?.updatedAt
    if (!updatedAt) return null
    try {
      const millis = (updatedAt as any).toMillis?.()
      const date = new Date(millis || updatedAt)
      return Number.isFinite(date.getTime()) ? date : null
    } catch {
      return null
    }
  }

  const handleAddInflowItem = async (group: InflowGroupName, data: { item: string; amountChf: number; amount: number; currency: string; provider: string }) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `inflow-${Date.now()}`
    const newItem: InflowItem = {
      id,
      item: data.item,
      amountChf: data.amountChf, // Converted to CHF for backward compatibility
      amount: data.amount, // Original amount
      currency: data.currency, // Original currency
      provider: data.provider,
      group,
    }
    setInflowItems(prev => [...prev, newItem])
    const result = await saveCashflowInflowItem(newItem, uid)
    if (!result.success) {
      console.error('[Cashflow] Failed to save new inflow item:', result.reason)
    }
  }

  const handleAddOutflowItem = async (group: OutflowGroupName, data: { item: string; amountChf: number; amount: number; currency: string; receiver: string }) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `outflow-${Date.now()}`
    const newItem: OutflowItem = {
      id,
      item: data.item,
      amountChf: data.amountChf, // Converted to CHF for backward compatibility
      amount: data.amount, // Original amount
      currency: data.currency, // Original currency
      receiver: data.receiver,
      group,
    }
    setOutflowItems(prev => [...prev, newItem])
    const result = await saveCashflowOutflowItem(newItem, uid)
    if (!result.success) {
      console.error('[Cashflow] Failed to save new outflow item:', result.reason)
    }
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

  const handleEditInflowItem = async (id: string, data: { item: string; amountChf: number; amount: number; currency: string; provider: string }) => {
    const existingItem = inflowItems.find(item => item.id === id)
    const clientUpdatedAt = getClientUpdatedAt(existingItem)

    const updatedItem: InflowItem | null = existingItem
      ? { ...existingItem, item: data.item, amountChf: data.amountChf, amount: data.amount, currency: data.currency, provider: data.provider }
      : null

    setInflowItems(prev => prev.map(item =>
      item.id === id
        ? { ...item, item: data.item, amountChf: data.amountChf, amount: data.amount, currency: data.currency, provider: data.provider }
        : item
    ))

    if (updatedItem) {
      const result = await saveCashflowInflowItem(updatedItem, uid, { clientUpdatedAt })
      if (!result.success) {
        console.error('[Cashflow] Failed to save edited inflow item:', result.reason)
      }
    }
  }

  const handleEditOutflowItem = async (id: string, data: { item: string; amountChf: number; amount: number; currency: string; receiver: string }) => {
    const existingItem = outflowItems.find(item => item.id === id)
    const clientUpdatedAt = getClientUpdatedAt(existingItem)

    const updatedItem: OutflowItem | null = existingItem
      ? { ...existingItem, item: data.item, amountChf: data.amountChf, amount: data.amount, currency: data.currency, receiver: data.receiver }
      : null

    setOutflowItems(prev => prev.map(item =>
      item.id === id
        ? { ...item, item: data.item, amountChf: data.amountChf, amount: data.amount, currency: data.currency, receiver: data.receiver }
        : item
    ))

    if (updatedItem) {
      const result = await saveCashflowOutflowItem(updatedItem, uid, { clientUpdatedAt })
      if (!result.success) {
        console.error('[Cashflow] Failed to save edited outflow item:', result.reason)
      }
    }
  }

  const handleEditAccountflowItem = (id: string) => {
    if (import.meta.env.DEV) console.log('Edit accountflow item', id)
  }

  const handleRemoveInflowItem = async (id: string) => {
    if (window.confirm('Are you sure you want to remove this item?')) {
      const existingItem = inflowItems.find(item => item.id === id)
      const clientUpdatedAt = getClientUpdatedAt(existingItem)
      setInflowItems(prev => prev.filter(item => item.id !== id))
      const result = await deleteCashflowInflowItem(id, uid, { clientUpdatedAt })
      if (!result.success) {
        console.error('[Cashflow] Failed to delete inflow item:', result.reason)
      }
    }
  }

  const handleRemoveOutflowItem = async (id: string) => {
    if (window.confirm('Are you sure you want to remove this item?')) {
      const existingItem = outflowItems.find(item => item.id === id)
      const clientUpdatedAt = getClientUpdatedAt(existingItem)
      setOutflowItems(prev => prev.filter(item => item.id !== id))
      const result = await deleteCashflowOutflowItem(id, uid, { clientUpdatedAt })
      if (!result.success) {
        console.error('[Cashflow] Failed to delete outflow item:', result.reason)
      }
    }
  }

  const handleRemoveAccountflowItem = (id: string) => {
    if (window.confirm('Are you sure you want to remove this item?')) {
      setAccountflowItems(prev => prev.filter(item => item.id !== id))
    }
  }

  const handleAddMapping = async (mapping: AccountflowMapping) => {
    setAccountflowMappings(prev => [...prev, mapping])
    const result = await saveCashflowAccountflowMapping(mapping, uid)
    if (!result.success) {
      console.error('[Cashflow] Failed to save new mapping:', result.reason)
    }
  }

  const handleEditMapping = async (mapping: AccountflowMapping) => {
    const existing = accountflowMappings.find(m => m.id === mapping.id)
    const clientUpdatedAt = getClientUpdatedAt(existing)
    setAccountflowMappings(prev => prev.map(m => m.id === mapping.id ? mapping : m))
    const result = await saveCashflowAccountflowMapping(mapping, uid, { clientUpdatedAt })
    if (!result.success) {
      console.error('[Cashflow] Failed to save edited mapping:', result.reason)
    }
  }

  const handleRemoveMapping = async (id: string) => {
    if (window.confirm('Are you sure you want to remove this mapping?')) {
      const existing = accountflowMappings.find(m => m.id === id)
      const clientUpdatedAt = getClientUpdatedAt(existing)
      setAccountflowMappings(prev => prev.filter(m => m.id !== id))
      const result = await deleteCashflowAccountflowMapping(id, uid, { clientUpdatedAt })
      if (!result.success) {
        console.error('[Cashflow] Failed to delete mapping:', result.reason)
      }
    }
  }

  if (dataLoading && inflowItems.length === 0 && outflowItems.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-goldenrod mx-auto mb-4"></div>
          <div className="text-text-secondary text-sm">Loading cashflow data...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-2 lg:px-6 pt-4 pb-12 lg:pt-6 lg:pb-16">
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

        {/* Platformflow Section - Full width */}
        <div>
          <AccountflowSection
            mappings={accountflowMappings}
            platforms={platforms}
            onAddMapping={handleAddMapping}
            onEditMapping={handleEditMapping}
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

