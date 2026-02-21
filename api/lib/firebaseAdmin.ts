import admin from 'firebase-admin'
import type { VercelRequest, VercelResponse } from '@vercel/node'

let initialized = false

export function initializeAdmin(): void {
  if (initialized || admin.apps.length > 0) return

  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson)
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
    } else {
      admin.initializeApp()
    }
    initialized = true
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      initialized = true
      return
    }
    console.error('Failed to initialize Firebase Admin:', error)
    throw new Error(
      `Firebase Admin initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Verify Firebase ID token from the Authorization header.
 * Returns the verified uid or sends a 401 response and returns null.
 */
export async function verifyAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<string | null> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header. Use Bearer <idToken>.' })
    return null
  }

  const idToken = authHeader.slice(7)
  try {
    const decoded = await admin.auth().verifyIdToken(idToken)
    return decoded.uid
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token.' })
    return null
  }
}
