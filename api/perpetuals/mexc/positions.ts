import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import { initializeAdmin, verifyAuth } from '../../lib/firebaseAdmin'
import { mexcPrivateGet, toNumber } from './shared'

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

    const json: any = await mexcPrivateGet({
      path: '/api/v1/private/position/open_positions',
      apiKey,
      secretKey,
    })

    const positionsRaw: any[] =
      Array.isArray(json?.data) ? json.data :
      Array.isArray(json?.data?.positions) ? json.data.positions :
      Array.isArray(json?.positions) ? json.positions :
      []

    const mapped = positionsRaw.map((p: any, idx: number) => {
      const symbol = (p.symbol || p.contractCode || p.contract || p.market) as string | undefined
      const positionId = p.positionId !== undefined && p.positionId !== null ? String(p.positionId) : String(p.id ?? idx)

      const positionType = toNumber(p.positionType ?? p.posSide ?? p.side)
      const holdVol = toNumber(p.holdVol ?? p.vol ?? p.positionVol ?? p.size) ?? 0
      const entryPrice = toNumber(p.holdAvgPrice ?? p.openAvgPrice ?? p.avgEntryPrice ?? p.entryPrice)
      const liquidationPrice = toNumber(p.liquidatePrice ?? p.liquidationPrice)
      const marginUsed = toNumber(p.im ?? p.margin ?? p.positionMargin) ?? 0
      const unrealizedPnl = toNumber(p.pnl ?? p.unRealizedPnl ?? p.unrealizedPnl) ?? 0
      const leverage = toNumber(p.leverage)

      return {
        id: `mexc-pos-${positionId}`,
        ticker: symbol || 'UNKNOWN',
        margin: marginUsed,
        pnl: unrealizedPnl,
        platform: 'MEXC',
        leverage,
        positionSide: positionType === 1 ? 'LONG' : positionType === 2 ? 'SHORT' : null,
        amountToken: Math.abs(holdVol),
        entryPrice: entryPrice ?? null,
        liquidationPrice: liquidationPrice ?? null,
        fundingFeeUsd: null,
      }
    })

    return res.status(200).json({ success: true, data: mapped })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ success: false, error: msg })
  }
}
