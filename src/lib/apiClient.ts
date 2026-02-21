import { auth } from '../config/firebase'

/**
 * Make an authenticated POST request to an API endpoint.
 * Automatically attaches the Firebase ID token as a Bearer token.
 */
export async function apiPost<T = unknown>(
  url: string,
  body: Record<string, unknown> = {}
): Promise<Response> {
  const user = auth.currentUser
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (user) {
    const idToken = await user.getIdToken()
    headers['Authorization'] = `Bearer ${idToken}`
  }

  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}
