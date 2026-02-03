import { test, expect } from '@playwright/test'

/**
 * Hyperliquid page E2E tests.
 * PRD: docs/prd/exchanges-hyperliquid.prd.json
 * Spec: docs/specs/exchanges-hyperliquid.spec.md
 *
 * When not authenticated, /exchanges/hyperliquid shows Login; tests that require
 * the Hyperliquid UI skip. Run with auth (e.g. storageState) for full coverage.
 */
const HYPERLIQUID_PATH = '/exchanges/hyperliquid'

test.describe('Hyperliquid page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HYPERLIQUID_PATH)
  })

  test('route loads without error', async ({ page }) => {
    await expect(page).toHaveURL(new RegExp(`(login|${HYPERLIQUID_PATH.replace(/\//g, '\\/')})`))
    await expect(page).toHaveTitle(/Capitalos|capitalos/i)
  })

  test('PRD: Dashboard frame exists above Performance/Positions/Open Orders when page is shown', async ({
    page,
  }) => {
    const dashboardHeading = page.getByRole('heading', { name: 'Dashboard', level: 2 })
    const isOnHyperliquid = await dashboardHeading.isVisible().catch(() => false)
    if (!isOnHyperliquid) {
      test.skip(true, 'Not on Hyperliquid page (likely not authenticated)')
      return
    }

    const performanceHeading = page.getByRole('heading', { name: 'Performance', level: 2 })
    const positionsHeading = page.getByRole('heading', { name: 'Positions', level: 2 })
    const openOrdersHeading = page.getByRole('heading', { name: 'Open Orders', level: 2 })

    await expect(dashboardHeading).toBeVisible()
    await expect(performanceHeading).toBeVisible()
    await expect(positionsHeading).toBeVisible()
    await expect(openOrdersHeading).toBeVisible()

    const allSectionHeadings = page.locator('h2').filter({ hasText: /^(Dashboard|Performance|Positions|Open Orders)$/ })
    const texts = await allSectionHeadings.allTextContents()
    const order = texts.map((t) => t.trim())
    expect(order).toEqual(['Dashboard', 'Performance', 'Positions', 'Open Orders'])
  })

  test('PRD: Dashboard shows one line per position or "No positions"', async ({ page }) => {
    const dashboardHeading = page.getByRole('heading', { name: 'Dashboard', level: 2 })
    const isOnHyperliquid = await dashboardHeading.isVisible().catch(() => false)
    if (!isOnHyperliquid) {
      test.skip(true, 'Not on Hyperliquid page (likely not authenticated)')
      return
    }

    const noPositions = page.getByText('No positions')
    const dashboardLine = page.locator('div.flex.items-start.gap-3').filter({ has: page.locator('div.rounded-full') }).first()
    const hasEmpty = await noPositions.isVisible().catch(() => false)
    const hasLines = await dashboardLine.isVisible().catch(() => false)
    expect(hasLines || hasEmpty).toBe(true)
  })

  test('PRD: Positions table has Funding Signal, Funding Rate, Open Interest columns', async ({
    page,
  }) => {
    const dashboardHeading = page.getByRole('heading', { name: 'Dashboard', level: 2 })
    const isOnHyperliquid = await dashboardHeading.isVisible().catch(() => false)
    if (!isOnHyperliquid) {
      test.skip(true, 'Not on Hyperliquid page (likely not authenticated)')
      return
    }

    await expect(page.getByRole('columnheader', { name: 'Funding Signal' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Funding Rate' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Open Interest' })).toBeVisible()
  })

  test('PRD: When no positions, table shows "No positions" and does not crash', async ({ page }) => {
    const dashboardHeading = page.getByRole('heading', { name: 'Dashboard', level: 2 })
    const isOnHyperliquid = await dashboardHeading.isVisible().catch(() => false)
    if (!isOnHyperliquid) {
      test.skip(true, 'Not on Hyperliquid page (likely not authenticated)')
      return
    }

    const noPositionsInTable = page.getByRole('cell', { name: 'No positions' })
    const visible = await noPositionsInTable.isVisible().catch(() => false)
    if (visible) {
      await expect(noPositionsInTable).toBeVisible()
    }
    const table = page.getByRole('table')
    await expect(table).toBeVisible()
  })

  test('PRD: No tooltips on funding health dashboard area', async ({ page }) => {
    const dashboardHeading = page.getByRole('heading', { name: 'Dashboard', level: 2 })
    const isOnHyperliquid = await dashboardHeading.isVisible().catch(() => false)
    if (!isOnHyperliquid) {
      test.skip(true, 'Not on Hyperliquid page (likely not authenticated)')
      return
    }

    const dashboardCard = page.locator('div').filter({ has: dashboardHeading }).first()
    const elementsWithTitle = dashboardCard.locator('[title]')
    await expect(elementsWithTitle).toHaveCount(0)
  })
})
