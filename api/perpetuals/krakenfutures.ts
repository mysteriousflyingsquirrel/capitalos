import crypto from 'crypto'

/**
 * Kraken Futures REST API Client
 * 
 * Pure REST utilities for Kraken Futures API.
 * No UI state, no WebSocket connections.
 * Provides stable API surface for REST operations.
 */

export type KrakenFuturesCredentials = {
  apiKey: string
  apiSecret: string // base64
}

/**
 * Signs a Kraken Futures REST request
 * 
 * Algorithm:
 * 1. Remove /derivatives from path for signature (per Kraken examples)
 * 2. Construct: data + nonce + path
 * 3. SHA256 hash
 * 4. HMAC-SHA512 with base64-decoded secret
 * 5. Base64 encode result
 * 
 * @param args - Signing parameters
 * @returns Base64-encoded signature
 */
export function signFuturesRestRequest(args: {
  method: 'GET' | 'POST'
  requestPath: string // e.g. "/derivatives/api/v3/accounts"
  queryString?: string // urlencoded
  bodyString?: string // urlencoded
  nonce: string
  apiSecret: string // base64
}): string {
  const { method, requestPath, queryString, bodyString, nonce, apiSecret } = args

  // Step 1: Base64-decode the API secret
  let secretKey: Buffer
  try {
    secretKey = Buffer.from(apiSecret, 'base64')
  } catch {
    throw new Error('Failed to base64-decode API secret. Ensure the secret is in base64 format.')
  }

  // Step 2: Remove /derivatives from path for signature (per Kraken examples)
  const pathForSignature = requestPath.replace('/derivatives', '')

  // Step 3: Construct the data string
  // Format: queryString + bodyString (if POST)
  let data = ''
  if (queryString) {
    data += queryString
  }
  if (method === 'POST' && bodyString) {
    data += bodyString
  }

  // Step 4: Construct the string to hash: data + nonce + path
  const stringToHash = data + nonce + pathForSignature

  // Step 5: SHA-256 hash of the concatenated string (in binary format)
  const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('binary')

  // Step 6: HMAC-SHA512 using the base64-decoded secret and the SHA256 hash (binary)
  const hmac = crypto.createHmac('sha512', secretKey).update(sha256Hash, 'binary').digest('base64')

  return hmac
}

/**
 * Makes a signed REST request to Kraken Futures API
 * 
 * @param args - Request parameters
 * @returns Parsed JSON response
 */
export async function futuresRestRequest<T>(args: {
  baseUrl: string // "https://futures.kraken.com"
  method: 'GET' | 'POST'
  path: string // "/derivatives/api/v3/..."
  query?: Record<string, any>
  body?: Record<string, any>
  creds: KrakenFuturesCredentials
}): Promise<T> {
  const { baseUrl, method, path, query, body, creds } = args

  // Build query string
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

  // Build body string (for POST requests)
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

  // Build full URL
  const url = new URL(path, baseUrl)
  if (queryString) {
    url.search = queryString
  }

  // Generate nonce (timestamp in milliseconds)
  const nonce = Date.now().toString()

  // Sign the request
  const signature = signFuturesRestRequest({
    method,
    requestPath: path,
    queryString,
    bodyString,
    nonce,
    apiSecret: creds.apiSecret,
  })

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'APIKey': creds.apiKey,
    'Nonce': nonce,
    'Authent': signature,
  }

  console.log(`[KrakenFuturesREST] ${method} ${url.toString()}`)
  console.log(`[KrakenFuturesREST] signature path="${path}" queryString="${queryString}" bodyString="${bodyString ? '***' : ''}"`)

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: method === 'POST' && bodyString ? bodyString : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[KrakenFuturesREST] ${method} ${url.toString()} failed:`, {
        status: response.status,
        errorText,
      })
      throw new Error(`Kraken Futures API error (${response.status}): ${errorText}`)
    }

    const jsonData = await response.json()
    return jsonData as T
  } catch (error) {
    console.error(`[KrakenFuturesREST] Request failed for ${method} ${path}:`, error)
    throw error
  }
}
