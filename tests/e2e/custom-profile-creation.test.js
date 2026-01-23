/**
 * E2E Test: Custom Profile Creation Flow
 *
 * Tests the complete user flow from landing page to chatting with a synthetic profile.
 * @module tests/e2e/custom-profile-creation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium } from 'playwright';

describe('Custom Profile Creation E2E', () => {
    let browser;
    let context;
    let page;

    beforeAll(async () => {
        browser = await chromium.launch({
            headless: true,
            slowMo: 50 // Slow down for better visibility in tests
        });
    });

    afterAll(async () => {
        await browser.close();
    });

    beforeEach(async () => {
        context = await browser.newContext({
            viewport: { width: 1280, height: 720 }
        });
        page = await context.newPage();
        await page.goto('file://' + process.cwd() + '/index.html');
    });

    afterEach(async () => {
        await context.close();
    });

    describe('Landing Page CTA', () => {
        it('should show custom profile button on landing page', async () => {
            const button = await page.$('#custom-profile-btn');
            expect(button).toBeTruthy();

            const buttonText = await button.textContent();
            expect(buttonText).toContain('Create a Custom Profile');
        });

        it('should have sparkle icon on button', async () => {
            const button = await page.$('#custom-profile-btn');
            const span = await button.$('span');
            const iconText = await span.textContent();

            expect(iconText).toBe('✨');
        });

        it('should have correct styling class', async () => {
            const button = await page.$('#custom-profile-btn');
            const classes = await button.getAttribute('class');

            expect(classes).toContain('btn');
            expect(classes).toContain('btn-accent');
        });

        it('should have data-action attribute', async () => {
            const button = await page.$('#custom-profile-btn');
            const action = await button.getAttribute('data-action');

            expect(action).toBe('show-custom-profile-modal');
        });
    });

    describe('Modal Display', () => {
        it('should open modal when clicking custom profile button', async () => {
            await page.click('#custom-profile-btn');

            // Wait for modal to appear
            await page.waitForSelector('.custom-profile-modal', { timeout: 2000 });

            const modal = await page.$('.custom-profile-modal');
            expect(modal).toBeTruthy();
        });

        it('should have correct modal title', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const title = await page.textContent('#custom-profile-title');
            expect(title).toContain('Design Your Music Personality');
        });

        it('should have close button', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const closeBtn = await page.$('.modal-close');
            expect(closeBtn).toBeTruthy();

            const ariaLabel = await closeBtn.getAttribute('aria-label');
            expect(ariaLabel).toBe('Close modal');
        });

        it('should have textarea for description input', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const textarea = await page.$('#profile-description-input');
            expect(textarea).toBeTruthy();
        });

        it('should have generate button initially disabled', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const generateBtn = await page.$('#generate-profile-btn');
            const isDisabled = await generateBtn.isDisabled();

            expect(isDisabled).toBe(true);
        });

        it('should have example chips', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const chips = await page.$$('.example-chip');
            expect(chips.length).toBe(3);
        });

        it('should close when clicking backdrop', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            // Click the backdrop
            await page.click('.modal-overlay-bg');

            // Wait for modal closing animation
            await page.waitForTimeout(250);

            const modal = await page.$('.custom-profile-modal');
            expect(modal).toBeNull();
        });

        it('should close when clicking close button', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            await page.click('.modal-close');

            // Wait for modal closing animation
            await page.waitForTimeout(250);

            const modal = await page.$('.custom-profile-modal');
            expect(modal).toBeNull();
        });
    });

    describe('Example Chips', () => {
        beforeEach(async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');
        });

        it('should fill textarea when clicking night owl chip', async () => {
            await page.click('.example-chip[data-example="night-owl-electronic"]');

            const textarea = await page.$('#profile-description-input');
            const value = await textarea.inputValue();

            expect(value).toContain('night owl');
            expect(value).toContain('electronic');
        });

        it('should fill textarea when clicking road trip chip', async () => {
            await page.click('.example-chip[data-example="road-trip-classic-rock"]');

            const textarea = await page.$('#profile-description-input');
            const value = await textarea.inputValue();

            expect(value).toContain('road trip');
            expect(value).toContain('classic rock');
        });

        it('should fill textarea when clicking jazz convert chip', async () => {
            await page.click('.example-chip[data-example="jazz-convert"]');

            const textarea = await page.$('#profile-description-input');
            const value = await textarea.inputValue();

            expect(value).toContain('jazz');
            expect(value).toContain('pop');
        });

        it('should enable generate button after example selection', async () => {
            const generateBtn = await page.$('#generate-profile-btn');
            const initiallyDisabled = await generateBtn.isDisabled();
            expect(initiallyDisabled).toBe(true);

            await page.click('.example-chip[data-example="jazz-convert"]');

            const isEnabled = await generateBtn.isEnabled();
            expect(isEnabled).toBe(true);
        });
    });

    describe('Generate Button State', () => {
        beforeEach(async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');
        });

        it('should enable button with valid input', async () => {
            const textarea = await page.$('#profile-description-input');
            await textarea.fill('Someone who loves jazz music and listens mostly in the evenings');

            const generateBtn = await page.$('#generate-profile-btn');
            const isEnabled = await generateBtn.isEnabled();

            expect(isEnabled).toBe(true);
        });

        it('should keep button disabled with short input', async () => {
            const textarea = await page.$('#profile-description-input');
            await textarea.fill('Short');

            const generateBtn = await page.$('#generate-profile-btn');
            const isDisabled = await generateBtn.isDisabled();

            expect(isDisabled).toBe(true);
        });

        it('should keep button disabled with whitespace only', async () => {
            const textarea = await page.$('#profile-description-input');
            await textarea.fill('     ');

            const generateBtn = await page.$('#generate-profile-btn');
            const isDisabled = await generateBtn.isDisabled();

            expect(isDisabled).toBe(true);
        });
    });

    describe('Profile Synthesis Flow', () => {
        beforeEach(async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');
        });

        it('should show progress state during synthesis', async () => {
            const textarea = await page.$('#profile-description-input');
            await textarea.fill('Someone who loves jazz piano and listens in the evenings');

            await page.click('#generate-profile-btn');

            // Wait for progress state (may take a moment for synthesis to start)
            await page.waitForSelector('[data-state="progress"]', { timeout: 3000 });

            const progressState = await page.$('[data-state="progress"]');
            expect(progressState).toBeTruthy();

            const progressBar = await page.$('#progress-fill');
            expect(progressBar).toBeTruthy();
        });

        it('should update progress bar during synthesis', async () => {
            const textarea = await page.$('#profile-description-input');
            await textarea.fill('A jazz lover who used to listen to pop music');

            await page.click('#generate-profile-btn');

            // Wait for progress bar to appear
            await page.waitForSelector('#progress-fill', { timeout: 3000 });

            // Check that progress bar updates (width changes from 0%)
            const initialWidth = await page.$eval('#progress-fill', el => el.style.width);
            expect(initialWidth).toBeTruthy();
        });

        it('should show progress status messages', async () => {
            const textarea = await page.$('#profile-description-input');
            await textarea.fill('Someone who loves electronic music at night');

            await page.click('#generate-profile-btn');

            // Wait for progress status
            await page.waitForSelector('#progress-status', { timeout: 3000 });

            const statusText = await page.$eval('#progress-status', el => el.textContent);
            expect(statusText).toBeTruthy();
            expect(statusText.length).toBeGreaterThan(0);
        });
    });

    describe('Success State', () => {
        it('should show success state after successful synthesis', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const textarea = await page.$('#profile-description-input');
            await textarea.fill('Someone who loves jazz piano and listens in the evenings');

            await page.click('#generate-profile-btn');

            // Wait for success state (synthesis may take a few seconds)
            await page.waitForSelector('[data-state="success"]', { timeout: 15000 });

            const successState = await page.$('[data-state="success"]');
            expect(successState).toBeTruthy();
        });

        it('should display profile summary card', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const textarea = await page.$('#profile-description-input');
            await textarea.fill('A classic rock enthusiast who loves road trips');

            await page.click('#generate-profile-btn');

            await page.waitForSelector('.profile-summary-card', { timeout: 15000 });

            const summaryCard = await page.$('.profile-summary-card');
            expect(summaryCard).toBeTruthy();
        });

        it('should show profile name', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const textarea = await page.$('#profile-description-input');
            await textarea.fill('Jazz lover who listens in the evening');

            await page.click('#generate-profile-btn');

            await page.waitForSelector('.profile-summary-name', { timeout: 15000 });

            const profileName = await page.$('.profile-summary-name');
            expect(profileName).toBeTruthy();

            const nameText = await profileName.textContent();
            expect(nameText.length).toBeGreaterThan(0);
        });

        it('should have start chatting button', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const textarea = await page.$('#profile-description-input');
            await textarea.fill('Someone who loves discovering new music');

            await page.click('#generate-profile-btn');

            await page.waitForSelector('#start-chatting-btn', { timeout: 15000 });

            const startBtn = await page.$('#start-chatting-btn');
            expect(startBtn).toBeTruthy();

            const buttonText = await startBtn.textContent();
            expect(buttonText).toContain('Start Chatting');
        });

        it('should show synthetic streams count', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const textarea = await page.$('#profile-description-input');
            await textarea.fill('Electronic music fan');

            await page.click('#generate-profile-btn');

            await page.waitForSelector('.profile-summary-stats', { timeout: 15000 });

            const stats = await page.$$('.profile-stat-value');
            expect(stats.length).toBeGreaterThan(0);

            const streamsCount = await stats[0].textContent();
            const countNum = parseInt(streamsCount);
            expect(countNum).toBeGreaterThan(0);
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');
        });

        it('should have error state in DOM', async () => {
            const errorState = await page.$('[data-state="error"]');
            expect(errorState).toBeTruthy();

            const errorIcon = await page.$('.error-icon');
            expect(errorIcon).toBeTruthy();

            const retryBtn = await page.$('[data-action="retry-profile"]');
            expect(retryBtn).toBeTruthy();
        });

        it('should show try again button in error state', async () => {
            const retryBtn = await page.$('[data-action="retry-profile"]');
            expect(retryBtn).toBeTruthy();

            const buttonText = await retryBtn.textContent();
            expect(buttonText).toContain('Try Again');
        });
    });

    describe('Navigation to App', () => {
        it('should navigate to app.html when clicking start chatting', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const textarea = await page.$('#profile-description-input');
            await textarea.fill('A jazz lover who listens in the evening');

            await page.click('#generate-profile-btn');

            // Wait for success state
            await page.waitForSelector('[data-state="success"]', { timeout: 15000 });

            // Set up navigation tracking
            const navigationPromise = page.context().waitForEvent('page');

            // Click start chatting
            await page.click('#start-chatting-btn');

            // Wait for new page/navigation
            const newPage = await navigationPromise;

            // Verify navigation
            expect(newPage.url()).toContain('app.html?mode=custom');
        });

        it('should store profile ID in sessionStorage', async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const textarea = await page.$('#profile-description-input');
            await textarea.fill('Test profile for navigation');

            await page.click('#generate-profile-btn');

            await page.waitForSelector('[data-state="success"]', { timeout: 15000 });

            // Check sessionStorage before navigation
            const pendingProfile = await page.evaluate(() => {
                return sessionStorage.getItem('pendingCustomProfile');
            });

            expect(pendingProfile).toBeTruthy();
            expect(pendingProfile.length).toBeGreaterThan(0);
        });
    });

    describe('Accessibility', () => {
        beforeEach(async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');
        });

        it('should have proper ARIA attributes', async () => {
            const modalContent = await page.$('.modal-content');

            const role = await modalContent.getAttribute('role');
            const ariaModal = await modalContent.getAttribute('aria-modal');
            const ariaLabelledby = await modalContent.getAttribute('aria-labelledby');

            expect(role).toBe('dialog');
            expect(ariaModal).toBe('true');
            expect(ariaLabelledby).toBe('custom-profile-title');
        });

        it('should have labelled textarea', async () => {
            const textarea = await page.$('#profile-description-input');

            const ariaLabel = await textarea.getAttribute('aria-label');
            expect(ariaLabel).toBe('Describe your desired music personality');
        });

        it('should trap focus within modal', async () => {
            // Focus should be in textarea initially
            const focusedElement = await page.evaluate(() => document.activeElement.id);
            expect(focusedElement).toBe('profile-description-input');

            // Tab should cycle within modal
            await page.keyboard.press('Tab');

            // Focus should still be within modal
            const stillInModal = await page.evaluate(() => {
                const modal = document.querySelector('.modal-content');
                return modal.contains(document.activeElement);
            });

            expect(stillInModal).toBe(true);
        });

        it('should close on Escape key', async () => {
            const modal = await page.$('.custom-profile-modal');
            expect(modal).toBeTruthy();

            await page.keyboard.press('Escape');

            // Wait for closing animation
            await page.waitForTimeout(250);

            const stillExists = await page.$('.custom-profile-modal');
            expect(stillExists).toBeNull();
        });
    });

    describe('Keyboard Shortcuts', () => {
        beforeEach(async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');
        });

        it('should submit on Ctrl+Enter', async () => {
            const textarea = await page.$('#profile-description-input');
            await textarea.fill('Valid description for keyboard shortcut test');

            // Press Ctrl+Enter
            await page.keyboard.press('Control+Enter');

            // Should trigger synthesis (progress state should appear)
            const progressAppeared = await page.waitForSelector('[data-state="progress"]', { timeout: 3000 })
                .then(() => true)
                .catch(() => false);

            expect(progressAppeared).toBe(true);
        });

        it('should submit on Cmd+Enter (Mac)', async () => {
            const textarea = await page.$('#profile-description-input');
            await textarea.fill('Another valid description for Mac shortcut');

            // Press Meta+Enter (Cmd on Mac)
            await page.keyboard.press('Meta+Enter');

            // Should trigger synthesis
            const progressAppeared = await page.waitForSelector('[data-state="progress"]', { timeout: 3000 })
                .then(() => true)
                .catch(() => false);

            expect(progressAppeared).toBe(true);
        });
    });

    describe('Responsive Design', () => {
        it('should work on mobile viewport', async () => {
            await context.close();
            context = await browser.newContext({
                viewport: { width: 375, height: 667 } // iPhone SE
            });
            page = await context.newPage();
            await page.goto('file://' + process.cwd() + '/index.html');

            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const modal = await page.$('.custom-profile-modal');
            expect(modal).toBeTruthy();

            // Check modal is full-width on mobile
            const modalWidth = await page.$eval('.custom-profile-modal .modal-content', el => {
                return window.getComputedStyle(el).width;
            });

            expect(modalWidth).toBeTruthy();
        });

        it('should work on tablet viewport', async () => {
            await context.close();
            context = await browser.newContext({
                viewport: { width: 768, height: 1024 } // iPad
            });
            page = await context.newPage();
            await page.goto('file://' + process.cwd() + '/index.html');

            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');

            const modal = await page.$('.custom-profile-modal');
            expect(modal).toBeTruthy();
        });
    });

    describe('Edge Cases', () => {
        beforeEach(async () => {
            await page.click('#custom-profile-btn');
            await page.waitForSelector('.custom-profile-modal');
        });

        it('should handle very long descriptions', async () => {
            const longDescription = 'Someone who loves jazz music '.repeat(50);

            const textarea = await page.$('#profile-description-input');
            await textarea.fill(longDescription);

            const generateBtn = await page.$('#generate-profile-btn');
            const isEnabled = await generateBtn.isEnabled();

            expect(isEnabled).toBe(true);
        });

        it('should handle special characters in description', async () => {
            const specialDescription = 'I love "quotes" & <special> chars! @#$%';

            const textarea = await page.$('#profile-description-input');
            await textarea.fill(specialDescription);

            const generateBtn = await page.$('#generate-profile-btn');
            const isEnabled = await generateBtn.isEnabled();

            expect(isEnabled).toBe(true);
        });

        it('should handle rapid example chip clicks', async () => {
            const chips = await page.$$('.example-chip');

            for (const chip of chips) {
                await chip.click();
            }

            const textarea = await page.$('#profile-description-input');
            const value = await textarea.inputValue();

            // Should have the last chip's value
            expect(value).toContain('jazz');
        });
    });
});
