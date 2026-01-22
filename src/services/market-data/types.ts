/**
 * Market Data SSOT Types
 */

import type { CurrencyCode } from '../../lib/currency'

/**
 * FX Rate data structure
 */
export interface FxRate {
  base: CurrencyCode
  quote: CurrencyCode
  rate: number
  timestamp: number
  source: 'fawazahmed0-jsdelivr' | 'fawazahmed0-pages' | 'cache'
}

/**
 * Crypto price data structure
 */
export interface CryptoPrice {
  symbol: string
  priceUsd: number
  timestamp: number
  source: 'cryptocompare' | 'cache'
}

/**
 * Market price (stocks/ETFs/commodities) data structure
 */
export interface MarketPrice {
  symbol: string
  priceUsd: number
  timestamp: number
  source: 'yahoo-rapidapi' | 'cache'
}

/**
 * Asset type for quotes
 */
export type AssetType = 'crypto' | 'stock' | 'etf' | 'commodity'

/**
 * Unified quote request
 */
export interface QuoteRequest {
  symbol: string
  assetType: AssetType
  targetCurrency?: CurrencyCode
}

/**
 * Unified quote response
 */
export interface Quote {
  symbol: string
  assetType: AssetType
  priceUsd: number
  priceInTargetCurrency?: number
  targetCurrency?: CurrencyCode
  timestamp: number
  source: string
}

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * Inflight request tracker
 */
export interface InflightRequest<T> {
  promise: Promise<T>
  timestamp: number
}
