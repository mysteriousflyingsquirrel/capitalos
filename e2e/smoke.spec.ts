import { test, expect } from '@playwright/test'

/**
 * Smoke tests: app loads and main entry points are reachable.
 * PRD/spec: general app stability; no specific PRD.
 */
test.describe('App smoke', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Capitalos|capitalos/i)
  })

  test('login route is reachable', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login/)
  })

  test('main app routes load without crash', async ({ page }) => {
    const routes = ['/', '/login', '/net-worth', '/cashflow', '/analytics', '/settings', '/exchanges/hyperliquid', '/exchanges/mexc']
    for (const route of routes) {
      await page.goto(route)
      await expect(page).toHaveTitle(/Capitalos|capitalos/i)
    }
  })
})
