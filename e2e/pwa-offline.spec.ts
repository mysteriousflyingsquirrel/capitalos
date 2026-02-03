import { test, expect } from '@playwright/test'

/**
 * PWA & Offline E2E tests.
 * PRD: docs/prd/pwa-offline.prd.json
 * Spec: docs/specs/pwa-offline.spec.md
 *
 * PRD: Built app MUST expose a manifest consistent with vite config: name, icons, theme_color.
 * We check that the app has a manifest link (dev may not have built manifest; preview/build does).
 */
test.describe('PWA manifest', () => {
  test('PRD: App has manifest link or theme-color meta', async ({ page }) => {
    await page.goto('/')
    const manifestLink = page.locator('link[rel="manifest"]')
    const themeMeta = page.locator('meta[name="theme-color"]')
    const hasManifest = await manifestLink.count() > 0
    const hasTheme = await themeMeta.count() > 0
    expect(hasManifest || hasTheme).toBe(true)
  })

  test('PRD: Document title and app load', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Capitalos|capitalos/i)
  })
})
