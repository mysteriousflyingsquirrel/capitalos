import { auth } from '../config/firebase'
import { onAuthStateChanged } from 'firebase/auth'

let resolvedUser: typeof auth.currentUser = undefined as any
let userReady: Promise<typeof auth.currentUser> | null = null

function waitForAuth(): Promise<typeof auth.currentUser> {
  if (!userReady) {
    userReady = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe()
        resolvedUser = user
        resolve(user)
      })
    })
  }
  return userReady
}

async function getAuthUser() {
  if (auth.currentUser) return auth.currentUser
  if (resolvedUser !== undefined) return resolvedUser
  return waitForAuth()
}

/**
 * Make an authenticated POST request to an API endpoint.
 * Waits for Firebase Auth to resolve before sending,
 * so the ID token is always attached when the user is logged in.
 */
export async function apiPost(
  url: string,
  body: Record<string, unknown> = {}
): Promise<Response> {
  const user = await getAuthUser()
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
