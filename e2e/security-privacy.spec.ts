import { test, expect } from '@playwright/test'

/**
 * Security & Privacy E2E tests.
 * PRD: docs/prd/security-privacy.prd.json
 * Spec: docs/specs/security-privacy.spec.md
 */
test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('login page loads and shows heading', async ({ page }) => {
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'Capitalos', level: 1 })).toBeVisible()
  })

  test('login page shows sign-in button', async ({ page }) => {
    const signInButton = page.getByRole('button', { name: /Sign in with Google|Signing in|Redirecting/ })
    await expect(signInButton).toBeVisible()
  })
})

test.describe('Security: authenticated routes when signed out', () => {
  test('PRD: When signed out, navigating to / shows Login (no app data)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Capitalos', level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: /Sign in with Google|Signing in|Redirecting/ })).toBeVisible()
  })

  test('PRD: When signed out, navigating to /settings shows Login', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Capitalos', level: 1 })).toBeVisible()
  })

  test('PRD: When signed out, navigating to /net-worth shows Login', async ({ page }) => {
    await page.goto('/net-worth')
    await expect(page.getByRole('heading', { name: 'Capitalos', level: 1 })).toBeVisible()
  })

  test('PRD: When signed out, navigating to /cashflow shows Login', async ({ page }) => {
    await page.goto('/cashflow')
    await expect(page.getByRole('heading', { name: 'Capitalos', level: 1 })).toBeVisible()
  })

  test('PRD: When signed out, navigating to /exchanges/hyperliquid shows Login', async ({ page }) => {
    await page.goto('/exchanges/hyperliquid')
    await expect(page.getByRole('heading', { name: 'Capitalos', level: 1 })).toBeVisible()
  })

  test('PRD: When signed out, navigating to /exchanges/mexc shows Login', async ({ page }) => {
    await page.goto('/exchanges/mexc')
    await expect(page.getByRole('heading', { name: 'Capitalos', level: 1 })).toBeVisible()
  })
})
