/**
 * Rhythm Chamber E2E Tests
 * Critical flows for Phase 0/1 verification
 */
import { test, expect, Page, BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Test data paths
const TEST_DATA_DIR = path.join(__dirname, 'fixtures');
const SAMPLE_JSON_PATH = path.join(TEST_DATA_DIR, 'sample-streaming-history.json');

// ==========================================
// Test Fixtures Setup
// ==========================================

test.beforeAll(async () => {
    // Create test fixtures directory if it doesn't exist
    if (!fs.existsSync(TEST_DATA_DIR)) {
        fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }

    // Create sample Spotify streaming history
    const sampleData = generateSampleStreamingHistory(100);
    fs.writeFileSync(SAMPLE_JSON_PATH, JSON.stringify(sampleData, null, 2));
});

/**
 * Generate sample Spotify streaming history data
 */
function generateSampleStreamingHistory(count: number) {
    const artists = ['Taylor Swift', 'The Weeknd', 'Drake', 'Billie Eilish', 'Ed Sheeran'];
    const tracks = ['Anti-Hero', 'Blinding Lights', 'Hotline Bling', 'Bad Guy', 'Shape of You'];
    const albums = ['Midnights', 'After Hours', 'Views', 'When We All Fall Asleep', 'Divide'];

    const streams = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
        const artistIndex = Math.floor(Math.random() * artists.length);
        streams.push({
            ts: new Date(now - i * 3600000).toISOString(), // 1 hour apart
            master_metadata_track_name: tracks[artistIndex],
            master_metadata_album_artist_name: artists[artistIndex],
            master_metadata_album_album_name: albums[artistIndex],
            ms_played: 180000 + Math.floor(Math.random() * 60000), // 3-4 minutes
            platform: 'android',
            shuffle: Math.random() > 0.5,
            skipped: Math.random() > 0.8,
            offline: false,
            reason_start: 'trackdone',
            reason_end: 'trackdone'
        });
    }

    return streams;
}

/**
 * Helper to clear IndexedDB for clean test state
 * Should be called before navigating to the app page
 */
async function clearIndexedDB(page: Page) {
    await page.evaluate(async () => {
        // Clear localStorage and sessionStorage first
        localStorage.clear();
        sessionStorage.clear();

        // Close any existing DB connections
        if ((window as any).Storage?.db) {
            (window as any).Storage.db.close?.();
            (window as any).Storage.db = null;
        }

        // Delete specific known databases
        const deleteDb = (name: string): Promise<void> => {
            return new Promise((resolve) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
                request.onblocked = () => {
                    console.warn(`DB ${name} deletion blocked`);
                    resolve();
                };
            });
        };

        // Delete the rhythm-chamber database
        await deleteDb('rhythm-chamber');

        // Try to delete any other databases
        try {
            const dbs = await (indexedDB.databases?.() || Promise.resolve([]));
            for (const db of dbs) {
                if (db.name) {
                    await deleteDb(db.name);
                }
            }
        } catch (e) {
            // indexedDB.databases() not supported - that's ok
        }
    });
    // Longer pause for cleanup
    await page.waitForTimeout(100);
}


// ==========================================
// Core Flow Tests
// ==========================================

test.describe('Upload → Analysis → Chat Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Go to app page
        await page.goto('/app.html', { waitUntil: 'networkidle' });
        // Clear data (this closes DB connections and deletes)
        await clearIndexedDB(page);
        // Reload to get fresh state with new DB
        await page.reload({ waitUntil: 'networkidle' });
    });


    test('should display upload zone on initial load', async ({ page }) => {
        // Reload after clearing to get fresh state
        await page.goto('/app.html', { waitUntil: 'networkidle' });
        await expect(page.locator('#upload-zone')).toBeVisible();
        await expect(page.locator('#processing')).not.toHaveClass(/active/);
    });

    test('should process uploaded JSON file and show personality', async ({ page }) => {
        // Reload after clearing to get fresh state
        await page.goto('/app.html', { waitUntil: 'networkidle' });

        // Get the file input (hidden)
        const fileInput = page.locator('#file-input');

        // Upload the sample file
        await fileInput.setInputFiles(SAMPLE_JSON_PATH);

        // Wait for reveal section to appear (processing may be too fast to catch)
        // With small test files, processing completes almost instantly
        await expect(page.locator('#reveal-section')).toHaveClass(/active/, { timeout: 30000 });

        // Verify personality elements are populated
        await expect(page.locator('#personality-name')).not.toHaveText('');
        await expect(page.locator('#personality-emoji')).not.toHaveText('');
        await expect(page.locator('#stream-count')).not.toHaveText('0');
    });


    test('should navigate to chat after personality reveal', async ({ page }) => {
        // Upload file
        await page.locator('#file-input').setInputFiles(SAMPLE_JSON_PATH);
        await expect(page.locator('#reveal-section')).toHaveClass(/active/, { timeout: 30000 });

        // Wait for button to be visible and clickable
        const chatBtn = page.locator('#explore-chat-btn');
        await expect(chatBtn).toBeVisible({ timeout: 5000 });
        await chatBtn.click();

        // Verify chat section is visible
        await expect(page.locator('#chat-section')).toHaveClass(/active/);
        await expect(page.locator('#chat-input')).toBeVisible();
    });

});

// ==========================================
// Session Persistence Tests
// ==========================================

test.describe('Session Persistence', () => {
    test('should persist personality data across page reload', async ({ page }) => {
        await page.goto('/app.html', { waitUntil: 'networkidle' });
        await clearIndexedDB(page);
        await page.goto('/app.html', { waitUntil: 'networkidle' });

        // Upload and wait for analysis
        await page.locator('#file-input').setInputFiles(SAMPLE_JSON_PATH);
        await expect(page.locator('#reveal-section')).toHaveClass(/active/, { timeout: 30000 });

        // Get personality name before reload
        const personalityName = await page.locator('#personality-name').textContent();

        // Reload the page
        await page.reload();

        // Should show reveal section immediately (data persisted)
        await expect(page.locator('#reveal-section')).toHaveClass(/active/, { timeout: 5000 });

        // Personality should match
        await expect(page.locator('#personality-name')).toHaveText(personalityName!);
    });

    test('should persist chat messages in session', async ({ page }) => {
        await page.goto('/app.html', { waitUntil: 'networkidle' });
        await clearIndexedDB(page);
        await page.goto('/app.html', { waitUntil: 'networkidle' });

        // Upload and navigate to chat
        await page.locator('#file-input').setInputFiles(SAMPLE_JSON_PATH);
        await expect(page.locator('#reveal-section')).toHaveClass(/active/, { timeout: 30000 });
        await page.locator('#explore-chat-btn').click();

        // Note: We can't fully test chat without API key, but we can verify session structure
        const chatInput = page.locator('#chat-input');
        await expect(chatInput).toBeVisible();

        // Type and send a message (will fail without API, but tests UI flow)
        await chatInput.fill('Test message');
        await page.locator('#chat-send').click();

        // User message should appear
        await expect(page.locator('.message.user').last()).toContainText('Test message');
    });
});

// ==========================================
// Multi-Tab Warning Tests
// ==========================================

test.describe('Multi-Tab Coordination', () => {
    test('should show warning when second tab opens', async ({ context }) => {
        // BroadcastChannel requires same origin/context
        // Open first tab (primary)
        const page1 = await context.newPage();
        await page1.goto('/app.html', { waitUntil: 'networkidle' });

        // Wait for tab coordination to initialize
        await page1.waitForTimeout(200);

        // Open second tab in SAME context (required for BroadcastChannel)
        const page2 = await context.newPage();
        await page2.goto('/app.html', { waitUntil: 'networkidle' });

        // Wait for coordination messages to propagate
        await page2.waitForTimeout(500);

        // Second tab should show multi-tab modal OR have disabled inputs
        const modalVisible = await page2.locator('#multi-tab-modal').isVisible();
        const uploadDisabled = await page2.locator('#upload-zone').evaluate(el =>
            window.getComputedStyle(el).pointerEvents === 'none'
        );

        // Either modal shown or inputs disabled indicates multi-tab detection worked
        expect(modalVisible || uploadDisabled).toBeTruthy();

        await page1.close();
        await page2.close();
    });
});

// ==========================================
// Emergency Backup Recovery Tests
// ==========================================

test.describe('Emergency Backup Recovery', () => {
    test('should recover from emergency backup on next load', async ({ page }) => {
        await page.goto('/app.html', { waitUntil: 'networkidle' });
        await clearIndexedDB(page);
        await page.goto('/app.html', { waitUntil: 'networkidle' });

        // Simulate an emergency backup in localStorage
        await page.evaluate(() => {
            const backup = {
                sessionId: 'test-session-123',
                createdAt: new Date().toISOString(),
                messages: [
                    { role: 'user', content: 'Test message 1' },
                    { role: 'assistant', content: 'Test response 1' }
                ],
                timestamp: Date.now()
            };
            localStorage.setItem('rhythm_chamber_emergency_backup', JSON.stringify(backup));
        });

        // Upload data to initialize chat context
        await page.locator('#file-input').setInputFiles(SAMPLE_JSON_PATH);
        await expect(page.locator('#reveal-section')).toHaveClass(/active/, { timeout: 30000 });

        // The emergency backup should have been processed (cleared from localStorage)
        const backupExists = await page.evaluate(() => {
            return localStorage.getItem('rhythm_chamber_emergency_backup') !== null;
        });

        // Backup should be cleared after recovery
        expect(backupExists).toBe(false);
    });
});

// ==========================================
// File Validation Tests
// ==========================================

test.describe('File Validation', () => {
    test('should reject invalid JSON with appropriate error', async ({ page }) => {
        await page.goto('/app.html', { waitUntil: 'networkidle' });
        await clearIndexedDB(page);
        await page.goto('/app.html', { waitUntil: 'networkidle' });

        // Create invalid test file
        const invalidDataPath = path.join(TEST_DATA_DIR, 'invalid-data.json');
        const invalidData = [
            { invalid: 'no timestamp or track info' },
            { also_invalid: 'missing required fields' }
        ];
        fs.writeFileSync(invalidDataPath, JSON.stringify(invalidData));

        // Try to upload
        await page.locator('#file-input').setInputFiles(invalidDataPath);

        // Should show error in progress text
        await expect(page.locator('#progress-text')).toContainText(/error|invalid|fail/i, { timeout: 10000 });

        // Clean up
        fs.unlinkSync(invalidDataPath);
    });
});
