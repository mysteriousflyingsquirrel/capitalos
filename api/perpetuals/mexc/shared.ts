import crypto from 'crypto'

export function hmacSha256Hex(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex')
}

export function buildSortedQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  entries.sort(([a], [b]) => a.localeCompare(b))
  return entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
}

export async function mexcPrivateGet<T>(args: {
  path: string
  query?: Record<string, unknown>
  apiKey: string
  secretKey: string
}): Promise<T> {
  const baseUrl = 'https://contract.mexc.com'
  const requestTime = Date.now().toString()
  const queryString = args.query ? buildSortedQuery(args.query) : ''
  const signaturePayload = `${args.apiKey}${requestTime}${queryString}`
  const signature = hmacSha256Hex(args.secretKey, signaturePayload)

  const url = new URL(args.path, baseUrl)
  if (queryString) url.search = queryString

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      ApiKey: args.apiKey,
      'Request-Time': requestTime,
      Signature: signature,
      'Recv-Window': '60000',
    },
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`MEXC REST error (${resp.status}): ${text}`)
  }

  return (await resp.json()) as T
}

export async function mexcPrivatePost<T>(args: {
  path: string
  body: Record<string, unknown>
  apiKey: string
  secretKey: string
}): Promise<T> {
  const baseUrl = 'https://contract.mexc.com'
  const requestTime = Date.now().toString()

  const cleanedBody: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args.body || {})) {
    if (v !== null && v !== undefined) cleanedBody[k] = v
  }

  const bodyString = JSON.stringify(cleanedBody)
  const signaturePayload = `${args.apiKey}${requestTime}${bodyString}`
  const signature = hmacSha256Hex(args.secretKey, signaturePayload)

  const url = new URL(args.path, baseUrl)
  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ApiKey: args.apiKey,
      'Request-Time': requestTime,
      Signature: signature,
      'Recv-Window': '60000',
      'Content-Type': 'application/json',
    },
    body: bodyString,
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`MEXC REST error (${resp.status}): ${text}`)
  }

  return (await resp.json()) as T
}

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}
