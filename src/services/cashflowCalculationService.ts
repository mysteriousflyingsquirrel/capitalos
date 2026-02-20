import type { CurrencyCode } from '../lib/currency'

// Types for cashflow calculations
type InflowGroupName = 'Time' | 'Service' | 'Worker Bees'
type OutflowGroupName = 'Fix' | 'Variable' | 'Shared Variable' | 'Investments'
type InflowEndpointMode = 'group' | 'item'
type OutflowEndpointMode = 'group' | 'item'

interface InflowItem {
  id: string
  item: string
  amountChf: number
  amount: number
  currency: string
  provider: string
  group: InflowGroupName
}

interface OutflowItem {
  id: string
  item: string
  amountChf: number
  amount: number
  currency: string
  receiver: string
  group: OutflowGroupName
}

interface InflowToAccountMapping {
  id: string
  kind: 'inflowToAccount'
  mode: InflowEndpointMode
  group?: InflowGroupName
  inflowItemId?: string
  account: string
}

interface AccountToOutflowMapping {
  id: string
  kind: 'accountToOutflow'
  mode: OutflowEndpointMode
  group?: OutflowGroupName
  outflowItemId?: string
  account: string
}

interface AccountToAccountMapping {
  id: string
  kind: 'accountToAccount'
  fromAccount: string
  toAccount: string
  amountChf: number
}

type AccountflowMapping =
  | InflowToAccountMapping
  | AccountToOutflowMapping
  | AccountToAccountMapping

/**
 * Calculate the sum of inflow items for a specific group
 */
export function getInflowGroupSum(
  group: InflowGroupName,
  items: InflowItem[],
  convert: (amount: number, from: CurrencyCode) => number
): number {
  if (!items) return 0
  return items
    .filter(i => i.group === group)
    .reduce((sum, i) => {
      // Use original amount and currency if available, otherwise fall back to amountChf
      if (i.amount !== undefined && i.currency) {
        return sum + convert(i.amount, i.currency as CurrencyCode)
      }
      return sum + i.amountChf
    }, 0)
}

/**
 * Calculate the sum of outflow items for a specific group
 */
export function getOutflowGroupSum(
  group: OutflowGroupName,
  items: OutflowItem[],
  convert: (amount: number, from: CurrencyCode) => number
): number {
  if (!items) return 0
  return items
    .filter(i => i.group === group)
    .reduce((sum, i) => {
      // Use original amount and currency if available, otherwise fall back to amountChf
      if (i.amount !== undefined && i.currency) {
        return sum + convert(i.amount, i.currency as CurrencyCode)
      }
      return sum + i.amountChf
    }, 0)
}

/**
 * Calculate the amount for an accountflow mapping
 */
export function computeMappingAmount(
  mapping: AccountflowMapping,
  inflowItems: InflowItem[],
  outflowItems: OutflowItem[],
  convert: (amount: number, from: CurrencyCode) => number
): number {
  if (!inflowItems) inflowItems = []
  if (!outflowItems) outflowItems = []
  if (mapping.kind === 'inflowToAccount') {
    if (mapping.mode === 'group' && mapping.group) {
      return getInflowGroupSum(mapping.group, inflowItems, convert)
    } else if (mapping.mode === 'item' && mapping.inflowItemId) {
      const item = inflowItems.find(i => i.id === mapping.inflowItemId)
      if (!item) return 0
      // Use original amount and currency if available, otherwise fall back to amountChf
      if (item.amount !== undefined && item.currency) {
        return convert(item.amount, item.currency as CurrencyCode)
      }
      return item.amountChf
    }
  } else if (mapping.kind === 'accountToOutflow') {
    if (mapping.mode === 'group' && mapping.group) {
      return getOutflowGroupSum(mapping.group, outflowItems, convert)
    } else if (mapping.mode === 'item' && mapping.outflowItemId) {
      const item = outflowItems.find(i => i.id === mapping.outflowItemId)
      if (!item) return 0
      // Use original amount and currency if available, otherwise fall back to amountChf
      if (item.amount !== undefined && item.currency) {
        return convert(item.amount, item.currency as CurrencyCode)
      }
      return item.amountChf
    }
  } else if (mapping.kind === 'accountToAccount') {
    return mapping.amountChf
  }
  return 0
}

