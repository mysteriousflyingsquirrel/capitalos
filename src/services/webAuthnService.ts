const CREDENTIAL_KEY_PREFIX = 'capitalos_webauthn_'
const BIOMETRIC_ENABLED_PREFIX = 'capitalos_biometric_'

function credentialKey(uid: string): string {
  return `${CREDENTIAL_KEY_PREFIX}${uid}`
}

function biometricKey(uid: string): string {
  return `${BIOMETRIC_ENABLED_PREFIX}${uid}`
}

function randomChallenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function isBiometricEnabled(uid: string): boolean {
  return localStorage.getItem(biometricKey(uid)) === 'true'
}

export async function registerBiometric(uid: string, email: string): Promise<boolean> {
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: 'Capitalos', id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(uid),
          name: email || uid,
          displayName: email || 'Capitalos User',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' },  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    }) as PublicKeyCredential | null

    if (!credential) return false

    const rawId = Array.from(new Uint8Array(credential.rawId))
    localStorage.setItem(credentialKey(uid), JSON.stringify(rawId))
    localStorage.setItem(biometricKey(uid), 'true')
    return true
  } catch (err) {
    console.error('[WebAuthn] Registration failed:', err)
    return false
  }
}

export async function verifyBiometric(uid: string): Promise<boolean> {
  try {
    const stored = localStorage.getItem(credentialKey(uid))
    if (!stored) return false

    const rawId = new Uint8Array(JSON.parse(stored))

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [{ id: rawId, type: 'public-key', transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    })

    return !!assertion
  } catch (err) {
    console.error('[WebAuthn] Verification failed:', err)
    return false
  }
}

export function disableBiometric(uid: string): void {
  localStorage.removeItem(credentialKey(uid))
  localStorage.removeItem(biometricKey(uid))
}
