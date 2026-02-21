import type { ForecastEntry } from './forecastService'
import type { NetWorthItem, NetWorthTransaction } from '../pages/NetWorth'
import type { InflowItem, OutflowItem } from '../pages/Cashflow'
import { calculateBalanceChf } from './balanceCalculationService'
import { computeMappingAmount } from './cashflowCalculationService'
import type { CurrencyCode } from '../lib/currency'

// Accountflow mapping types (matching Cashflow.tsx structure)
type InflowGroupName = 'Time' | 'Service' | 'Worker Bees'
type OutflowGroupName = 'Fix' | 'Variable' | 'Shared Variable' | 'Investments'
type InflowEndpointMode = 'group' | 'item'
type OutflowEndpointMode = 'group' | 'item'

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

export interface MonthlyProjection {
  month: string // Format: "YYYY-MM"
  startBalance: number
  totalInflows: number
  totalOutflows: number
  endBalance: number
  spareChangeInflow: number
  manualInflows: number
  plannedPayments: number
}

export interface ForecastResult {
  monthlyProjections: MonthlyProjection[]
  lowestBalance: number
  lowestMonth: string | null
  currentBalance: number
  spareChangeInflow: number
}

/**
 * Get current balance for a platform
 * @param platformId - The platform ID
 * @param platformName - The platform name (used in netWorthItems.platform field)
 */
export function getPlatformBalance(
  platformId: string,
  netWorthItems: NetWorthItem[],
  transactions: NetWorthTransaction[],
  cryptoPrices: Record<string, number>,
  stockPrices: Record<string, number>,
  usdToChfRate: number | null,
  convert: (amount: number, from: CurrencyCode) => number,
  platformName?: string
): number {
  if (!netWorthItems) return 0
  if (!transactions) transactions = []
  if (!cryptoPrices) cryptoPrices = {}
  if (!stockPrices) stockPrices = {}
  const platformMatch = platformName || platformId
  const platformItems = netWorthItems.filter(item => item.platform === platformMatch)
  
  if (platformItems.length === 0) {
    return 0
  }

  // Sum balances for all items on this platform
  let totalBalance = 0
  
  for (const item of platformItems) {
    const balance = calculateBalanceChf(
      item.id,
      transactions,
      item,
      cryptoPrices,
      convert
    )
    
    // For Crypto and Perpetuals, balance is in USD, need to convert
    if (item.category === 'Crypto' || item.category === 'Perpetuals') {
      const balanceChf = usdToChfRate && usdToChfRate > 0
        ? balance * usdToChfRate
        : convert(balance, 'USD')
      totalBalance += balanceChf
    } else {
      // For other categories, balance is already in CHF
      totalBalance += balance
    }
  }
  
  return totalBalance
}

/**
 * Get monthly spare-change inflow for a platform
 * @param platformId - The platform ID (which corresponds to platform name in accountflow mappings)
 * @param platformName - The platform name (used in accountflow mappings)
 */
export function getPlatformSpareChangeInflow(
  platformId: string,
  accountflowMappings: AccountflowMapping[],
  inflowItems: InflowItem[],
  outflowItems: OutflowItem[],
  convert: (amount: number, from: CurrencyCode) => number,
  platformName?: string
): number {
  if (!accountflowMappings) return 0
  if (!inflowItems) inflowItems = []
  if (!outflowItems) outflowItems = []
  const accountName = platformName || platformId
  
  const platformMappings = accountflowMappings.filter(mapping => {
    if (mapping.kind === 'inflowToAccount' && mapping.account === accountName) {
      return true
    }
    if (mapping.kind === 'accountToOutflow' && mapping.account === accountName) {
      return true
    }
    if (mapping.kind === 'accountToAccount') {
      return mapping.toAccount === accountName || mapping.fromAccount === accountName
    }
    return false
  })

  // Calculate total inflow and outflow
  let totalInflow = 0
  let totalOutflow = 0

  for (const mapping of platformMappings) {
    const amount = computeMappingAmount(mapping, inflowItems, outflowItems, convert)
    
    if (mapping.kind === 'inflowToAccount' && mapping.account === accountName) {
      totalInflow += amount
    } else if (mapping.kind === 'accountToOutflow' && mapping.account === accountName) {
      totalOutflow += amount
    } else if (mapping.kind === 'accountToAccount') {
      if (mapping.toAccount === accountName) {
        totalInflow += amount
      } else if (mapping.fromAccount === accountName) {
        totalOutflow += amount
      }
    }
  }

  // Spare change = inflow - outflow
  return totalInflow - totalOutflow
}

/**
 * Calculate 12-month cashflow forecast
 */
export function calculateForecast(
  currentBalance: number,
  spareChangeInflow: number,
  forecastEntries: ForecastEntry[],
  startDate: Date = new Date()
): ForecastResult {
  const monthlyProjections: MonthlyProjection[] = []
  let runningBalance = currentBalance
  let lowestBalance = Infinity
  let lowestMonth: string | null = null

  for (let i = 0; i < 12; i++) {
    const monthDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1)
    const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
    const nextMonthDate = new Date(startDate.getFullYear(), startDate.getMonth() + i + 1, 1)
    
    const startBalance = runningBalance
    
    // Calculate manual inflows in this month
    const manualInflows = forecastEntries
      .filter(entry => {
        if (entry.type !== 'inflow') return false
        const entryDate = new Date(entry.date)
        return entryDate >= monthDate && entryDate < nextMonthDate
      })
      .reduce((sum, entry) => sum + entry.amount, 0)
    
    // Calculate planned payments (outflows) in this month
    const plannedPayments = forecastEntries
      .filter(entry => {
        if (entry.type !== 'outflow') return false
        const entryDate = new Date(entry.date)
        return entryDate >= monthDate && entryDate < nextMonthDate
      })
      .reduce((sum, entry) => sum + entry.amount, 0)
    
    // Add spare-change inflow (monthly automatic)
    const totalInflows = spareChangeInflow + manualInflows
    const totalOutflows = plannedPayments
    
    // Calculate end balance
    runningBalance = startBalance + totalInflows - totalOutflows
    const endBalance = runningBalance
    
    // Track lowest balance
    if (endBalance < lowestBalance) {
      lowestBalance = endBalance
      lowestMonth = monthStr
    }
    
    monthlyProjections.push({
      month: monthStr,
      startBalance,
      totalInflows,
      totalOutflows,
      endBalance,
      spareChangeInflow,
      manualInflows,
      plannedPayments,
    })
  }

  return {
    monthlyProjections,
    lowestBalance,
    lowestMonth,
    currentBalance,
    spareChangeInflow,
  }
}
