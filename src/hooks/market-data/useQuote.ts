/**
 * Hook for fetching a single quote (crypto or market)
 */

import { useState, useEffect } from 'react'
import type { Quote, AssetType } from '../../services/market-data/types'
import type { CurrencyCode } from '../../lib/currency'
import { getPrice as getCryptoPrice } from '../../services/market-data/CryptoPriceService'
import { getPrice as getMarketPrice } from '../../services/market-data/MarketPriceService'
import { getRate } from '../../services/market-data/FxRateService'
import { useApiKeys } from '../../contexts/ApiKeysContext'

interface UseQuoteOptions {
  symbol: string
  assetType: AssetType
  targetCurrency?: CurrencyCode
}

export function useQuote({
  symbol,
  assetType,
  targetCurrency,
}: UseQuoteOptions): {
  quote: Quote | null
  isLoading: boolean
  error: Error | null
} {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const { rapidApiKey } = useApiKeys()

  useEffect(() => {
    let cancelled = false

    const fetchQuote = async () => {
      setIsLoading(true)
      setError(null)

      try {
        let priceUsd: number
        let source: string

        if (assetType === 'crypto') {
          const cryptoPrice = await getCryptoPrice(symbol)
          priceUsd = cryptoPrice.priceUsd
          source = cryptoPrice.source
        } else {
          if (!rapidApiKey) {
            throw new Error('RapidAPI key is required for market prices')
          }
          const marketPrice = await getMarketPrice(symbol, rapidApiKey)
          priceUsd = marketPrice.priceUsd
          source = marketPrice.source
        }

        // Convert to target currency if specified
        let priceInTargetCurrency: number | undefined
        if (targetCurrency && targetCurrency !== 'USD') {
          const fxRate = await getRate('USD', targetCurrency)
          priceInTargetCurrency = priceUsd * fxRate.rate
        }

        if (!cancelled) {
          const result: Quote = {
            symbol,
            assetType,
            priceUsd,
            priceInTargetCurrency,
            targetCurrency,
            timestamp: Date.now(),
            source,
          }
          setQuote(result)
        }
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error(String(err))
          setError(error)
          console.error('[useQuote] Error fetching quote:', error)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchQuote()

    return () => {
      cancelled = true
    }
  }, [symbol, assetType, targetCurrency, rapidApiKey])

  return { quote, isLoading, error }
}
