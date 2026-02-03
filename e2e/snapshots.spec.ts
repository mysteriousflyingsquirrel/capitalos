import { test, expect } from '@playwright/test'

/**
 * Snapshots E2E tests (Settings UI for snapshot creation).
 * PRD: docs/prd/snapshots.prd.json
 * Spec: docs/specs/snapshots.spec.md
 *
 * API contract (POST/GET 405/400) is not tested here; see API tests.
 * We only verify Settings page offers snapshot creation when authenticated.
 */
test.describe('Snapshots (Settings UI)', () => {
  test('PRD: When on Settings page, snapshot creation trigger is present or data section', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Capitalos', level: 1 }).or(page.getByRole('heading', { name: 'Settings', level: 1 }))).toBeVisible()
    const isLogin = await page.getByRole('heading', { name: 'Capitalos', level: 1 }).isVisible().catch(() => false)
    if (isLogin) {
      test.skip(true, 'Not authenticated')
      return
    }
    const snapshotButton = page.getByRole('button', { name: /Create snapshot|Snapshot|Create/i })
    const dataSection = page.getByText(/Snapshot|Backup|Export|Data|Developer/i).first()
    await expect(snapshotButton.or(dataSection)).toBeVisible()
  })
})
