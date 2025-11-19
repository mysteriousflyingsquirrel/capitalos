/**
 * Detects if the current browser is iOS Safari or Safari
 * Returns true for iPhone/iPad Safari, false for other browsers
 */
export function isIosSafari(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent

  // Check if it's iOS (iPhone, iPad, iPod)
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent)

  // Check if it's Safari (not Chrome, not Firefox, not WebView)
  // Safari user agent contains "Safari" but not "Chrome" or "CriOS" (Chrome on iOS)
  // Also exclude "FxiOS" (Firefox on iOS) and "EdgiOS" (Edge on iOS)
  const isSafari = /Safari/i.test(userAgent) && 
                   !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent)

  // Return true only if it's iOS AND Safari
  return isIOS && isSafari
}

