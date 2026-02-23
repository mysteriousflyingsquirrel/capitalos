import { mexcPrivateGet, toNumber } from '../api/perpetuals/mexc/shared.js'

/**
 * Fetch MEXC futures account equity in USD.
 * Calls the MEXC contract API directly using the provided API keys.
 */
export async function fetchMexcAccountEquityUsd(apiKey: string, secretKey: string): Promise<number | null> {
  const assetsJson: any = await mexcPrivateGet({
    path: '/api/v1/private/account/assets',
    apiKey,
    secretKey,
  })

  const data = assetsJson?.data

  const summaryEquity =
    toNumber(data?.equity) ??
    toNumber(data?.accountEquity) ??
    toNumber(data?.totalEquity) ??
    toNumber(data?.totalBalance) ??
    toNumber(data?.balance) ??
    null

  if (summaryEquity !== null) return summaryEquity

  if (Array.isArray(data)) {
    const usdt = data.find((a: any) => (a?.currency || a?.asset || a?.symbol) === 'USDT') || data[0]
    if (usdt) {
      return (
        toNumber(usdt.equity) ??
        toNumber(usdt.totalBalance) ??
        toNumber(usdt.balance) ??
        (() => {
          const wallet = toNumber(usdt.walletBalance) ?? toNumber(usdt.availableBalance) ?? 0
          const unreal = toNumber(usdt.unrealized) ?? toNumber(usdt.unRealized) ?? 0
          return wallet + unreal
        })()
      )
    }
  }

  return 0
}
