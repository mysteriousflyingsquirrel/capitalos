/**
 * useValuation Hook
 * 
 * Re-exports from ValuationProvider for consistency.
 * This file provides additional convenience hooks.
 */

import { useMemo } from 'react'
import { 
  useValuation as useValuationProvider,
  useTotalNetWorth as useTotalNetWorthProvider,
  useCategoryTotals as useCategoryTotalsProvider,
} from '../../providers/ValuationProvider'
import type { NetWorthCategory } from '../../services/valuation/valuationTypes'

// Re-export provider hooks
export { 
  useValuationProvider as useValuation,
  useTotalNetWorthProvider as useTotalNetWorth,
  useCategoryTotalsProvider as useCategoryTotals,
}

/**
 * Get a single category total
 */
export function useCategoryTotal(category: NetWorthCategory): {
  totalChf: number
  totalDisplay: number
  itemCount: number
  percentageOfTotal: number
  isLoading: boolean
} {
  const { valuation, isLoading } = useValuationProvider()
  
  return useMemo(() => {
    if (!valuation) {
      return {
        totalChf: 0,
        totalDisplay: 0,
        itemCount: 0,
        percentageOfTotal: 0,
        isLoading,
      }
    }
    
    const categoryData = valuation.categoryTotals[category]
    return {
      totalChf: categoryData.totalBaseCurrency,
      totalDisplay: categoryData.totalDisplayCurrency,
      itemCount: categoryData.itemCount,
      percentageOfTotal: categoryData.percentageOfTotal,
      isLoading,
    }
  }, [valuation, category, isLoading])
}

/**
 * Get asset allocation data (for pie charts)
 */
export function useAssetAllocation(): {
  allocation: Array<{ name: string; value: number; percentage: number }>
  isLoading: boolean
} {
  const { valuation, isLoading } = useValuationProvider()
  
  return useMemo(() => {
    if (!valuation) {
      return { allocation: [], isLoading }
    }
    
    const allocation = Object.entries(valuation.categoryTotals)
      .filter(([_, data]) => data.totalBaseCurrency > 0)
      .map(([name, data]) => ({
        name,
        value: data.totalBaseCurrency,
        percentage: data.percentageOfTotal,
      }))
      .sort((a, b) => b.value - a.value)
    
    return { allocation, isLoading }
  }, [valuation, isLoading])
}

/**
 * Get item valuations for a specific category
 */
export function useCategoryItems(category: NetWorthCategory): {
  items: Array<{
    itemId: string
    name: string
    valueChf: number
    valueDisplay: number
    quantity: number
    priceUsd?: number
  }>
  isLoading: boolean
} {
  const { valuation, isLoading } = useValuationProvider()
  
  return useMemo(() => {
    if (!valuation) {
      return { items: [], isLoading }
    }
    
    const items = valuation.itemValuations
      .filter(item => item.category === category)
      .map(item => ({
        itemId: item.itemId,
        name: item.name,
        valueChf: item.valueInBaseCurrency,
        valueDisplay: item.valueInDisplayCurrency,
        quantity: item.holdings,
        priceUsd: item.currentPrice,
      }))
      .sort((a, b) => b.valueChf - a.valueChf)
    
    return { items, isLoading }
  }, [valuation, category, isLoading])
}
