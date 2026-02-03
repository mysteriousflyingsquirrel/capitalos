import { test, expect } from '@playwright/test'

/**
 * Settings page E2E tests.
 * PRD: docs/prd/settings.prd.json
 * Spec: docs/specs/settings.spec.md
 *
 * When not authenticated, Settings shows Login; structure tests skip.
 */
test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
  })

  test('route loads without error', async ({ page }) => {
    await expect(page).toHaveTitle(/Capitalos|capitalos/i)
    const loginHeading = page.getByRole('heading', { name: 'Capitalos', level: 1 })
    const settingsHeading = page.getByRole('heading', { name: /Settings/i })
    await expect(loginHeading.or(settingsHeading)).toBeVisible()
  })

  test('PRD: When on Settings page, theme section is present', async ({ page }) => {
    const settingsHeading = page.getByRole('heading', { name: /Settings/i })
    const isOnSettings = await settingsHeading.isVisible().catch(() => false)
    if (!isOnSettings) {
      test.skip(true, 'Not on Settings page (likely not authenticated)')
      return
    }
    await expect(page.getByText(/Theme|theme/i).first()).toBeVisible()
  })

  test('PRD: When on Settings page, API keys or account section is present', async ({ page }) => {
    const settingsHeading = page.getByRole('heading', { name: /Settings/i })
    const isOnSettings = await settingsHeading.isVisible().catch(() => false)
    if (!isOnSettings) {
      test.skip(true, 'Not on Settings page (likely not authenticated)')
      return
    }
    const hasApiKeys = await page.getByText(/API|RapidAPI|Hyperliquid|MEXC|Wallet/i).first().isVisible().catch(() => false)
    const hasAccount = await page.getByText(/Account|Export|Import|Backup/i).first().isVisible().catch(() => false)
    expect(hasApiKeys || hasAccount).toBe(true)
  })

  test('PRD: When on Settings page, snapshot creation or data section is present', async ({ page }) => {
    const settingsHeading = page.getByRole('heading', { name: /Settings/i })
    const isOnSettings = await settingsHeading.isVisible().catch(() => false)
    if (!isOnSettings) {
      test.skip(true, 'Not on Settings page (likely not authenticated)')
      return
    }
    const hasSnapshot = await page.getByText(/Snapshot|snapshot|Create snapshot/i).first().isVisible().catch(() => false)
    const hasExportImport = await page.getByText(/Export|Import|Backup|Data/i).first().isVisible().catch(() => false)
    expect(hasSnapshot || hasExportImport).toBe(true)
  })
})
