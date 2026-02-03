import { test, expect } from '@playwright/test'

/**
 * Net Worth Transactions E2E tests.
 * PRD: docs/prd/transactions.prd.json
 * Spec: docs/specs/transactions.spec.md
 *
 * When not authenticated, Net Worth shows Login; structure tests skip.
 * Validation messages and CRUD are testable when on Net Worth with items.
 */
test.describe('Transactions (Net Worth)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/net-worth')
  })

  test('route loads without error', async ({ page }) => {
    await expect(page).toHaveTitle(/Capitalos|capitalos/i)
    const loginHeading = page.getByRole('heading', { name: 'Capitalos', level: 1 })
    const netWorthHeading = page.getByRole('heading', { name: /Net Worth/i })
    await expect(loginHeading.or(netWorthHeading)).toBeVisible()
  })

  test('PRD: When on Net Worth page, transaction or category UI is present', async ({ page }) => {
    const netWorthHeading = page.getByRole('heading', { name: /Net Worth/i, level: 1 })
    const isOnNetWorth = await netWorthHeading.isVisible().catch(() => false)
    if (!isOnNetWorth) {
      test.skip(true, 'Not on Net Worth page (likely not authenticated)')
      return
    }
    const hasCategories = await page.getByText(/Cash|Bank|Crypto|Stocks|Transactions|Add transaction/i).first().isVisible().catch(() => false)
    expect(hasCategories).toBe(true)
  })
})
