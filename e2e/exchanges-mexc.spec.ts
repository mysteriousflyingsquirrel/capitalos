import { test, expect } from '@playwright/test'

/**
 * MEXC page E2E tests.
 * PRD: docs/prd/exchanges-mexc.prd.json
 * Spec: docs/specs/exchanges-mexc.spec.md
 *
 * When not authenticated, MEXC shows Login; structure tests skip.
 * PRD: If keys not configured, page MUST not crash and MUST show empty tables or N/A performance.
 */
const MEXC_PATH = '/exchanges/mexc'

test.describe('MEXC page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(MEXC_PATH)
  })

  test('route loads without error', async ({ page }) => {
    await expect(page).toHaveURL(new RegExp(`(login|${MEXC_PATH.replace(/\//g, '\\/')})`))
    await expect(page).toHaveTitle(/Capitalos|capitalos/i)
  })

  test('PRD: When on MEXC page, Performance section exists with 24h/7d/30d/90d boxes', async ({ page }) => {
    const mexcHeading = page.getByRole('heading', { name: 'MEXC', level: 1 })
    const isOnMexc = await mexcHeading.isVisible().catch(() => false)
    if (!isOnMexc) {
      test.skip(true, 'Not on MEXC page (likely not authenticated)')
      return
    }
    const perfHeading = page.getByRole('heading', { name: 'Performance', level: 2 })
    await expect(perfHeading).toBeVisible()
    await expect(page.getByText(/24-Hour PnL|7-Day|30-Day|90-Day|N\/A/i).first()).toBeVisible()
  })

  test('PRD: When on MEXC page, Positions and Open Orders sections exist; no crash', async ({ page }) => {
    const mexcHeading = page.getByRole('heading', { name: 'MEXC', level: 1 })
    const isOnMexc = await mexcHeading.isVisible().catch(() => false)
    if (!isOnMexc) {
      test.skip(true, 'Not on MEXC page (likely not authenticated)')
      return
    }
    await expect(page.getByRole('heading', { name: 'Positions', level: 2 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Open Orders', level: 2 })).toBeVisible()
    const tableOrEmpty = page.getByRole('table').or(page.getByText('No positions').or(page.getByText('No open orders')))
    await expect(tableOrEmpty.first()).toBeVisible()
  })
})
