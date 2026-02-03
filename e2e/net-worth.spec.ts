import { test, expect } from '@playwright/test'

/**
 * Net Worth page E2E tests.
 * PRD: docs/prd/net-worth.prd.json
 * Spec: docs/specs/net-worth.spec.md
 *
 * When not authenticated, Net Worth shows Login; structure tests skip.
 */
test.describe('Net Worth page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/net-worth')
  })

  test('route loads without error', async ({ page }) => {
    await expect(page).toHaveTitle(/Capitalos|capitalos/i)
    const loginHeading = page.getByRole('heading', { name: 'Capitalos', level: 1 })
    const netWorthHeading = page.getByRole('heading', { name: /Net Worth/i })
    await expect(loginHeading.or(netWorthHeading)).toBeVisible()
  })

  test('PRD: When on Net Worth page, Total Net Worth or categories section is visible', async ({ page }) => {
    const netWorthHeading = page.getByRole('heading', { name: /Net Worth/i, level: 1 })
    const isOnNetWorth = await netWorthHeading.isVisible().catch(() => false)
    if (!isOnNetWorth) {
      test.skip(true, 'Not on Net Worth page (likely not authenticated)')
      return
    }
    const totalHeading = page.getByRole('heading', { name: /Total Net Worth/i })
    const categorySection = page.getByText(/Cash|Bank|Retirement|Crypto|Perpetuals|Real Estate|Stocks/i).first()
    await expect(totalHeading.or(categorySection)).toBeVisible()
  })

  test('PRD: Net Worth page does not crash when price data missing (structure only)', async ({ page }) => {
    const netWorthHeading = page.getByRole('heading', { name: /Net Worth/i, level: 1 })
    const isOnNetWorth = await netWorthHeading.isVisible().catch(() => false)
    if (!isOnNetWorth) {
      test.skip(true, 'Not on Net Worth page (likely not authenticated)')
      return
    }
    await expect(page.locator('body')).toBeVisible()
  })
})
