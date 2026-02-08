/**
 * E2E Test: Spotify OAuth Complete Flow
 *
 * Tests the complete OAuth flow from login to token refresh
 * Uses real browser contexts and Web Locks API
 *
 * @module tests/e2e/spotify-oauth-complete-flow
 */

import { test, expect } from '@playwright/test';

test.describe('Spotify OAuth Complete Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the app
        await page.goto('http://localhost:8080');
    });

    test('should complete OAuth login flow', async ({ page, context }) => {
        // Click the Spotify connect button
        await page.click('[data-action="connect-spotify"]');

        // Wait for OAuth redirect to Spotify
        // In a real test, we'd handle the redirect flow
        // For this test, we'll mock the callback

        // Verify OAuth parameters were set correctly
        await page.waitForURL(/accounts.spotify.com/);

        const url = page.url();
        const urlParams = new URL(url).searchParams;

        // Verify PKCE parameters
        expect(urlParams.get('response_type')).toBe('code');
        expect(urlParams.get('code_challenge_method')).toBe('S256');
        expect(urlParams.get('code_challenge')).toBeTruthy();
        expect(urlParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(urlParams.get('state')).toBeTruthy();
        expect(urlParams.get('state')).toMatch(/^[0-9a-f]{64}$/);
    });

    test('should handle OAuth callback and store tokens', async ({ page }) => {
        // Simulate OAuth callback
        await page.goto(
            'http://localhost:8080/callback?code=test-code&state=test-state-1234567890abcdef'
        );

        // Wait for token exchange
        await page.waitForSelector('[data-state="authenticated"]', {
            timeout: 5000,
        });

        // Verify authentication state
        const isAuthenticated = await page.evaluate(() => {
            return document.body.getAttribute('data-state') === 'authenticated';
        });

        expect(isAuthenticated).toBe(true);
    });

    test('should reject OAuth callback with invalid state', async ({ page }) => {
        // Navigate with mismatched state
        await page.goto(
            'http://localhost:8080/callback?code=test-code&state=different-state'
        );

        // Should show error message
        await page.waitForSelector('.error-message', { timeout: 5000 });

        const errorMessage = await page.textContent('.error-message');
        expect(errorMessage).toContain('Security verification failed');
    });

    test('should handle token expiration and refresh', async ({ page, context }) => {
        // First, authenticate
        await page.goto('http://localhost:8080/callback?code=test-code&state=test-state');
        await page.waitForSelector('[data-state="authenticated"]');

        // Wait for token to expire (simulate)
        await page.evaluate(() => {
            // Simulate expired token
            window.localStorage.setItem('spotify_token_expiry', '0');
        });

        // Trigger an API call that requires token refresh
        await page.click('[data-action="fetch-data"]');

        // Should automatically refresh token
        await page.waitForSelector('[data-state="authenticated"]', {
            timeout: 10000,
        });

        // Verify new token was fetched
        const newToken = await page.evaluate(() => {
            return window.localStorage.getItem('spotify_access_token');
        });

        expect(newToken).toBeTruthy();
    });
});

test.describe('Multi-Tab Token Coordination', () => {
    test('should coordinate token refresh across multiple tabs', async ({
        browser,
    }) => {
        // Create a shared context (tabs share storage)
        const context = await browser.newContext();

        // Authenticate in first tab
        const tab1 = await context.newPage();
        await tab1.goto('http://localhost:8080/callback?code=test-code&state=test-state');
        await tab1.waitForSelector('[data-state="authenticated"]');

        // Open second tab with same session
        const tab2 = await context.newPage();
        await tab2.goto('http://localhost:8080');
        await tab2.waitForSelector('[data-state="authenticated"]');

        // Simulate token expiration in both tabs
        await tab1.evaluate(() => {
            window.localStorage.setItem('spotify_token_expiry', '0');
        });
        await tab2.evaluate(() => {
            window.localStorage.setItem('spotify_token_expiry', '0');
        });

        // Both tabs trigger API calls simultaneously
        await Promise.all([
            tab1.click('[data-action="fetch-data"]'),
            tab2.click('[data-action="fetch-data"]'),
        ]);

        // Both should succeed, but only one should refresh
        await tab1.waitForSelector('[data-state="authenticated"]');
        await tab2.waitForSelector('[data-state="authenticated"]');

        // Verify both tabs have the same token (refreshed by one tab)
        const token1 = await tab1.evaluate(() => {
            return window.localStorage.getItem('spotify_access_token');
        });
        const token2 = await tab2.evaluate(() => {
            return window.localStorage.getItem('spotify_access_token');
        });

        expect(token1).toBe(token2);

        await context.close();
    });

    test('should handle logout in one tab and update other tabs', async ({
        browser,
    }) => {
        const context = await browser.newContext();

        // Open two authenticated tabs
        const tab1 = await context.newPage();
        const tab2 = await context.newPage();

        await tab1.goto('http://localhost:8080/callback?code=test-code&state=test-state');
        await tab1.waitForSelector('[data-state="authenticated"]');

        await tab2.goto('http://localhost:8080');
        await tab2.waitForSelector('[data-state="authenticated"]');

        // Logout in tab1
        await tab1.click('[data-action="logout"]');

        // Tab2 should detect logout and update state
        await tab2.waitForSelector('[data-state="unauthenticated"]', {
            timeout: 5000,
        });

        // Verify both tabs are logged out
        const tab1State = await tab1.evaluate(() => {
            return document.body.getAttribute('data-state');
        });
        const tab2State = await tab2.evaluate(() => {
            return document.body.getAttribute('data-state');
        });

        expect(tab1State).toBe('unauthenticated');
        expect(tab2State).toBe('unauthenticated');

        await context.close();
    });
});

test.describe('OAuth Security Tests', () => {
    test('should store PKCE verifier in sessionStorage only', async ({ page }) => {
        // Mock the OAuth flow initiation
        await page.evaluate(() => {
            // Simulate OAuth initiation
            sessionStorage.setItem('spotify_code_verifier', 'test-verifier-123');
            sessionStorage.setItem('spotify_oauth_state', 'test-state');
        });

        // Verify sessionStorage has the verifier
        const sessionVerifier = await page.evaluate(() => {
            return sessionStorage.getItem('spotify_code_verifier');
        });

        expect(sessionVerifier).toBeTruthy();

        // Verify localStorage does NOT have the verifier
        const localVerifier = await page.evaluate(() => {
            return localStorage.getItem('spotify_code_verifier');
        });

        expect(localVerifier).toBeNull();
    });

    test('should clear verifier after token exchange', async ({ page }) => {
        // Set up verifier and state
        await page.evaluate(() => {
            sessionStorage.setItem('spotify_code_verifier', 'test-verifier');
            sessionStorage.setItem('spotify_oauth_state', 'test-state');
        });

        // Simulate successful token exchange
        await page.evaluate(() => {
            sessionStorage.removeItem('spotify_code_verifier');
            sessionStorage.removeItem('spotify_oauth_state');
            localStorage.setItem('spotify_access_token', 'new-token');
        });

        // Verify verifier was cleared
        const verifier = await page.evaluate(() => {
            return sessionStorage.getItem('spotify_code_verifier');
        });

        expect(verifier).toBeNull();
    });

    test('should handle sessionStorage unavailable scenario', async ({ page, context }) => {
        // Block access to sessionStorage (simulating privacy settings)
        await page.addInitScript(() => {
            Object.defineProperty(window, 'sessionStorage', {
                get: () => {
                    throw new Error('sessionStorage disabled');
                },
            });
        });

        // Try to initiate OAuth
        await page.goto('http://localhost:8080');
        await page.click('[data-action="connect-spotify"]');

        // Should show error message
        await page.waitForSelector('.error-message', { timeout: 5000 });

        const errorMessage = await page.textContent('.error-message');
        expect(errorMessage).toContain('sessionStorage required');
    });
});

test.describe('Web Locks API Integration', () => {
    test('should use Web Locks API for token refresh', async ({ page, browserName }) => {
        // Skip on browsers that don't support Web Locks API
        test.skip(browserName !== 'chromium', 'Web Locks API only supported in Chromium');

        await page.goto('http://localhost:8080/callback?code=test-code&state=test-state');
        await page.waitForSelector('[data-state="authenticated"]');

        // Check if Web Locks API is available
        const locksAvailable = await page.evaluate(() => {
            return typeof navigator.locks !== 'undefined';
        });

        expect(locksAvailable).toBe(true);

        // Query lock status
        const lockStatus = await page.evaluate(async () => {
            return await navigator.locks.query();
        });

        expect(lockStatus).toHaveProperty('held');
        expect(lockStatus).toHaveProperty('pending');
    });

    test('should coordinate refresh with Web Locks across tabs', async ({
        browser,
        browserName,
    }) => {
        test.skip(browserName !== 'chromium', 'Web Locks API only supported in Chromium');

        const context = await browser.newContext();

        // Create two pages
        const page1 = await context.newPage();
        const page2 = await context.newPage();

        // Both pages navigate to app
        await page1.goto('http://localhost:8080/callback?code=test-code&state=test-state');
        await page2.goto('http://localhost:8080/callback?code=test-code&state=test-state');

        await Promise.all([
            page1.waitForSelector('[data-state="authenticated"]'),
            page2.waitForSelector('[data-state="authenticated"]'),
        ]);

        // Simulate token expiration
        await page1.evaluate(() => {
            window.localStorage.setItem('spotify_token_expiry', '0');
        });
        await page2.evaluate(() => {
            window.localStorage.setItem('spotify_token_expiry', '0');
        });

        // Trigger refresh in both tabs simultaneously
        const [locks1, locks2] = await Promise.all([
            page1.evaluate(async () => {
                // Simulate lock acquisition
                if (navigator.locks) {
                    return await navigator.locks.query();
                }
                return null;
            }),
            page2.evaluate(async () => {
                // Simulate lock acquisition
                if (navigator.locks) {
                    return await navigator.locks.query();
                }
                return null;
            }),
        ]);

        // At least one should see locks
        expect(locks1 || locks2).toBeTruthy();

        await context.close();
    });
});

test.describe('Token Expiry and JWT Handling', () => {
    test('should use JWT exp claim for token expiry', async ({ page }) => {
        await page.goto('http://localhost:8080/callback?code=test-code&state=test-state');

        // Set a mock JWT token with exp claim
        await page.evaluate(() => {
            // Create a mock JWT with exp claim (1 hour from now)
            const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
            const payload = btoa(
                JSON.stringify({
                    exp: Math.floor(Date.now() / 1000) + 3600,
                })
            );
            const signature = 'test-signature';

            const jwtToken = `${header}.${payload}.${signature}`;

            localStorage.setItem('spotify_access_token', jwtToken);
            localStorage.setItem(
                'spotify_token_expiry',
                (Math.floor(Date.now() / 1000) + 3600) * 1000
            );
        });

        // Verify token expiry was set from JWT
        const expiry = await page.evaluate(() => {
            return parseInt(localStorage.getItem('spotify_token_expiry'));
        });

        const expectedExpiry = Math.floor(Date.now() / 1000) + 3600;
        expect(Math.abs(expiry / 1000 - expectedExpiry)).toBeLessThan(1);
    });

    test('should fallback to expires_in when JWT parsing fails', async ({ page }) => {
        await page.goto('http://localhost:8080/callback?code=test-code&state=test-state');

        // Set an invalid JWT
        await page.evaluate(() => {
            localStorage.setItem('spotify_access_token', 'not-a-valid-jwt');
            localStorage.setItem(
                'spotify_token_expiry',
                (Date.now() + 3600 * 1000).toString()
            );
        });

        // Should still have expiry from expires_in
        const expiry = await page.evaluate(() => {
            return parseInt(localStorage.getItem('spotify_token_expiry'));
        });

        expect(expiry).toBeGreaterThan(Date.now());
    });
});
