import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import { initializeAdmin, verifyAuth } from '../../lib/firebaseAdmin'
import { mexcPrivateGet, toNumber } from './shared'

/**
 * Returns account equity in USD (USDT) for MEXC futures.
 * Uses a best-effort parse of /api/v1/private/account/assets response.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    initializeAdmin()
    const uid = await verifyAuth(req, res)
    if (!uid) return

    const db = admin.firestore()
    const settingsSnap = await db.collection('users').doc(uid).collection('settings').doc('user').get()
    const apiKeys = (settingsSnap.data()?.apiKeys || {}) as any
    const apiKey = apiKeys.mexcApiKey as string | undefined
    const secretKey = apiKeys.mexcSecretKey as string | undefined
    if (!apiKey || !secretKey) {
      return res.status(400).json({ success: false, error: 'MEXC API keys not configured' })
    }

    const assetsJson: any = await mexcPrivateGet({
      path: '/api/v1/private/account/assets',
      apiKey,
      secretKey,
    })

    // Common shapes:
    // - { data: { ...summaryFields } }
    // - { data: [ { currency: 'USDT', ...fields } ] }
    const data = assetsJson?.data

    // Try summary-style fields first
    const summaryEquity =
      toNumber(data?.equity) ??
      toNumber(data?.accountEquity) ??
      toNumber(data?.totalEquity) ??
      toNumber(data?.totalBalance) ??
      toNumber(data?.balance) ??
      null

    if (summaryEquity !== null) {
      return res.status(200).json({ success: true, data: { equityUsd: summaryEquity } })
    }

    // Try list-of-assets style
    if (Array.isArray(data)) {
      const usdt = data.find((a: any) => (a?.currency || a?.asset || a?.symbol) === 'USDT') || data[0]
      if (usdt) {
        const equity =
          toNumber(usdt.equity) ??
          toNumber(usdt.totalBalance) ??
          toNumber(usdt.balance) ??
          // fallback: walletBalance + unrealized
          (() => {
            const wallet = toNumber(usdt.walletBalance) ?? toNumber(usdt.availableBalance) ?? 0
            const unreal = toNumber(usdt.unrealized) ?? toNumber(usdt.unRealized) ?? 0
            return wallet + unreal
          })()

        return res.status(200).json({ success: true, data: { equityUsd: equity } })
      }
    }

    // Last resort: zero
    return res.status(200).json({ success: true, data: { equityUsd: 0 } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ success: false, error: msg })
  }
}

