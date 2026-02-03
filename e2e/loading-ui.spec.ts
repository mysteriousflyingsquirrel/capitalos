import { test, expect } from '@playwright/test'

/**
 * Loading UI (Auth Gate) E2E tests.
 * PRD: docs/prd/loading-ui.prd.json
 * Spec: docs/specs/loading-ui.spec.md
 *
 * When not ready, loading or Login is shown; we assert app does not crash.
 */
test.describe('Loading UI', () => {
  test('PRD: App loads without crash; user sees either Login or main content', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Capitalos|capitalos/i)
    await page.waitForLoadState('domcontentloaded')
    const hasLogin = await page.getByRole('heading', { name: 'Capitalos', level: 1 }).isVisible().catch(() => false)
    const hasMain = await page.getByText(/Net Worth|Dashboard|Total Net Worth|Wealth|Monthly Cashflow/i).first().isVisible().catch(() => false)
    expect(hasLogin || hasMain).toBe(true)
  })

  test('PRD: No uncaught errors on initial load', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    expect(errors.filter((m) => !m.includes('ResizeObserver'))).toEqual([])
  })
})
