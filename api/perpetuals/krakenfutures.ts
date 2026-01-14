import crypto from 'crypto'

export type KrakenFuturesCredentials = {
  apiKey: string
  apiSecret: string
}

export function signFuturesRestRequest(args: {
  method: 'GET' | 'POST'
  requestPath: string // e.g. "/derivatives/api/v3/accounts"
  queryString?: string // urlencoded
  bodyString?: string // urlencoded
  nonce: string
  apiSecret: string // base64
}): string {
  const { method, requestPath, queryString, bodyString, nonce, apiSecret } = args

  let secretKey: Buffer
  try {
    secretKey = Buffer.from(apiSecret, 'base64')
  } catch {
    throw new Error('Failed to base64-decode API secret. Ensure the secret is in base64 format.')
  }

  const pathForSignature = requestPath.replace('/derivatives', '')

  let data = ''
  if (queryString) {
    data += queryString
  }
  if (method === 'POST' && bodyString) {
    data += bodyString
  }

  const stringToHash = data + nonce + pathForSignature
  const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('binary')
  const hmac = crypto.createHmac('sha512', secretKey).update(sha256Hash, 'binary').digest('base64')

  return hmac
}

export async function futuresRestRequest<T>(args: {
  baseUrl: string // "https://futures.kraken.com"
  method: 'GET' | 'POST'
  path: string // "/derivatives/api/v3/..."
  query?: Record<string, any>
  body?: Record<string, any>
  creds: KrakenFuturesCredentials
}): Promise<T> {
  const { baseUrl, method, path, query, body, creds } = args

  let queryString = ''
  if (query && Object.keys(query).length > 0) {
    const queryParams = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value))
      }
    }
    queryString = queryParams.toString()
  }

  let bodyString = ''
  if (method === 'POST' && body) {
    bodyString = new URLSearchParams(
      Object.entries(body).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
          acc[key] = String(value)
        }
        return acc
      }, {} as Record<string, string>)
    ).toString()
  }

  const url = new URL(path, baseUrl)
  if (queryString) {
    url.search = queryString
  }

  const nonce = Date.now().toString()

  const signature = signFuturesRestRequest({
    method,
    requestPath: path,
    queryString,
    bodyString,
    nonce,
    apiSecret: creds.apiSecret,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'APIKey': creds.apiKey,
    'Nonce': nonce,
    'Authent': signature,
  }

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: method === 'POST' && bodyString ? bodyString : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Kraken Futures API error (${response.status}): ${errorText}`)
    }

    const jsonData = await response.json()
    return jsonData as T
  } catch (error) {
    throw error
  }
}
