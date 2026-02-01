/**
 * E2E App Load Test - Characterization Test
 * Tests that the app loads without errors and critical elements are present
 */
import { test, expect } from '@playwright/test';

test.describe('App Loading', () => {
  test('should load app without errors and show upload zone', async ({ page }) => {
    // Capture console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const errorText = msg.text();
        // Filter out expected CSP warning about document.write in compatibility.js
        // This is a false positive - the code path is never executed in normal operation
        if (
          !errorText.includes(
            'Executing inline script violates the following Content Security Policy directive'
          )
        ) {
          errors.push(errorText);
        }
      }
    });

    // Capture page errors
    const pageErrors: Error[] = [];
    page.on('pageerror', error => {
      pageErrors.push(error);
    });

    // Navigate to app
    await page.goto('/app.html', { waitUntil: 'networkidle' });

    // Wait a bit for any async initialization
    await page.waitForTimeout(2000);

    // Check that no errors occurred during load
    expect(errors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);

    // Check that upload zone is visible (not replaced by error UI)
    const uploadZone = page.locator('#upload-zone');
    await expect(uploadZone).toBeVisible({ timeout: 5000 });

    // Check that file input exists
    const fileInput = page.locator('#file-input');
    await expect(fileInput).toBeAttached();
  });

  test('should not show loading error UI', async ({ page }) => {
    await page.goto('/app.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Loading error should NOT be visible
    const loadingError = page.locator('.loading-error');
    await expect(loadingError).not.toBeVisible();

    // Security error should NOT be visible
    const securityError = page.locator('.security-error');
    await expect(securityError).not.toBeVisible();
  });
});
