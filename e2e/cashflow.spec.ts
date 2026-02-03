import { test, expect } from '@playwright/test'

/**
 * Cashflow page E2E tests.
 * PRD: docs/prd/cashflow.prd.json
 * Spec: docs/specs/cashflow.spec.md
 *
 * When not authenticated, Cashflow shows Login; structure tests skip.
 */
test.describe('Cashflow page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cashflow')
  })

  test('route loads without error', async ({ page }) => {
    await expect(page).toHaveTitle(/Capitalos|capitalos/i)
    const loginHeading = page.getByRole('heading', { name: 'Capitalos', level: 1 })
    const cashflowHeading = page.getByRole('heading', { name: /Cashflow/i })
    await expect(loginHeading.or(cashflowHeading)).toBeVisible()
  })

  test('PRD: When on Cashflow page, main heading and inflow/outflow or Platformflow section', async ({ page }) => {
    const cashflowHeading = page.getByRole('heading', { name: /Cashflow/i, level: 1 })
    const isOnCashflow = await cashflowHeading.isVisible().catch(() => false)
    if (!isOnCashflow) {
      test.skip(true, 'Not on Cashflow page (likely not authenticated)')
      return
    }
    const platformflow = page.getByRole('heading', { name: /Platformflow/i })
    const inflowOutflow = page.getByText(/Inflow|Outflow|inflow|outflow/i).first()
    await expect(platformflow.or(inflowOutflow)).toBeVisible()
  })
})
