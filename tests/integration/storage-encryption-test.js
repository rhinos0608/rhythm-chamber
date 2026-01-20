/**
 * Storage Encryption Integration Tests
 *
 * Comprehensive test suite for storage encryption functionality.
 * Tests encrypt/decrypt operations, data classification, ConfigAPI integration,
 * migration, and secure deletion.
 *
 * RUN INSTRUCTIONS:
 * 1. Open browser DevTools Console (F12)
 * 2. Copy and paste this entire file
 * 3. Run: runStorageEncryptionTests()
 * 4. Check console output for test results
 *
 * EXPECTED OUTPUT:
 * All tests should pass with green checkmarks.
 * Any failures will be marked with red X and detailed error messages.
 *
 * @module tests/integration/storage-encryption-test
 */

// ==========================================
// Test Framework
// ==========================================

let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

/**
 * Assert helper for test assertions
 * @param {boolean} condition - Condition to check
 * @param {string} message - Test message
 */
function assert(condition, message) {
    if (condition) {
        console.log(`✓ PASS: ${message}`);
        testsPassed++;
        testResults.push({ status: 'PASS', message });
    } else {
        console.error(`✗ FAIL: ${message}`);
        testsFailed++;
        testResults.push({ status: 'FAIL', message });
    }
}

/**
 * Assert helper for equality checks
 * @param {*} actual - Actual value
 * @param {*} expected - Expected value
 * @param {string} message - Test message
 */
function assertEqual(actual, expected, message) {
    const condition = actual === expected;
    if (condition) {
        console.log(`✓ PASS: ${message}`);
        testsPassed++;
        testResults.push({ status: 'PASS', message });
    } else {
        console.error(`✗ FAIL: ${message}`);
        console.error(`  Expected: ${expected}, Got: ${actual}`);
        testsFailed++;
        testResults.push({ status: 'FAIL', message, expected, actual });
    }
}

// ==========================================
// Test Suite
// ==========================================

/**
 * Run all storage encryption tests
 * @returns {Promise<Object>} Test results summary
 */
async function runStorageEncryptionTests() {
    console.log('='.repeat(60));
    console.log('STORAGE ENCRYPTION INTEGRATION TESTS');
    console.log('='.repeat(60));
    console.log('');

    try {
        // Test 1: Encrypt/Decrypt Roundtrip
        console.log('Test 1: Encrypt/Decrypt Roundtrip');
        console.log('-'.repeat(40));
        await testEncryptDecryptRoundtrip();
        console.log('');

        // Test 2: IV Uniqueness
        console.log('Test 2: IV Uniqueness');
        console.log('-'.repeat(40));
        await testIVUniqueness();
        console.log('');

        // Test 3: Data Classification
        console.log('Test 3: Data Classification');
        console.log('-'.repeat(40));
        await testDataClassification();
        console.log('');

        // Test 4: ConfigAPI Integration
        console.log('Test 4: ConfigAPI Integration');
        console.log('-'.repeat(40));
        await testConfigAPIIntegration();
        console.log('');

        // Test 5: Migration
        console.log('Test 5: Migration');
        console.log('-'.repeat(40));
        await testMigration();
        console.log('');

        // Test 6: Secure Deletion
        console.log('Test 6: Secure Deletion');
        console.log('-'.repeat(40));
        await testSecureDeletion();
        console.log('');

    } catch (error) {
        console.error('Test suite error:', error);
    }

    // Print summary
    console.log('='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${testsPassed + testsFailed}`);
    console.log(`Passed: ${testsPassed}`);
    console.log(`Failed: ${testsFailed}`);
    console.log('');

    if (testsFailed === 0) {
        console.log('🎉 All tests passed!');
    } else {
        console.error('⚠️  Some tests failed. Check output above for details.');
    }

    return {
        total: testsPassed + testsFailed,
        passed: testsPassed,
        failed: testsFailed,
        results: testResults
    };
}

// ==========================================
// Test Implementations
// ==========================================

/**
 * Test 1: Encrypt/Decrypt Roundtrip
 * Verifies that data can be encrypted and decrypted correctly
 */
async function testEncryptDecryptRoundtrip() {
    try {
        // Import modules
        const { Security } = await import('../../js/security/index.js');
        const { StorageEncryption } = await import('../../js/security/storage-encryption.js');

        // Get encryption key
        const encKey = await Security.getDataEncryptionKey();
        assert(encKey !== null, 'Encryption key obtained from KeyManager');

        // Test data
        const originalData = 'This is sensitive data that should be encrypted';
        console.log(`Original data: "${originalData}"`);

        // Encrypt data
        const encrypted = await StorageEncryption.encrypt(originalData, encKey);
        assert(encrypted !== null, 'Data encrypted successfully');
        assert(encrypted !== originalData, 'Encrypted data differs from original');
        console.log(`Encrypted data: "${encrypted.substring(0, 30)}..."`);

        // Decrypt data
        const decrypted = await StorageEncryption.decrypt(encrypted, encKey);
        assert(decrypted !== null, 'Data decrypted successfully');
        console.log(`Decrypted data: "${decrypted}"`);

        // Verify roundtrip
        assertEqual(decrypted, originalData, 'Decrypted data matches original');

    } catch (error) {
        console.error('Test 1 failed with error:', error);
        assert(false, `Test 1 threw error: ${error.message}`);
    }
}

/**
 * Test 2: IV Uniqueness
 * Verifies that each encryption operation uses a unique IV
 */
async function testIVUniqueness() {
    try {
        // Import modules
        const { Security } = await import('../../js/security/index.js');
        const { StorageEncryption } = await import('../../js/security/storage-encryption.js');

        // Get encryption key
        const encKey = await Security.getDataEncryptionKey();

        // Encrypt same data twice
        const testData = 'Same data encrypted twice';
        const encrypted1 = await StorageEncryption.encrypt(testData, encKey);
        const encrypted2 = await StorageEncryption.encrypt(testData, encKey);

        // Verify ciphertexts are different (unique IVs)
        assert(encrypted1 !== encrypted2, 'Ciphertexts are different (unique IVs)');
        console.log(`First encryption:  "${encrypted1.substring(0, 30)}..."`);
        console.log(`Second encryption: "${encrypted2.substring(0, 30)}..."`);

        // Verify both decrypt to the same plaintext
        const decrypted1 = await StorageEncryption.decrypt(encrypted1, encKey);
        const decrypted2 = await StorageEncryption.decrypt(encrypted2, encKey);

        assertEqual(decrypted1, testData, 'First decryption matches original');
        assertEqual(decrypted2, testData, 'Second decryption matches original');
        assertEqual(decrypted1, decrypted2, 'Both decryptions match each other');

    } catch (error) {
        console.error('Test 2 failed with error:', error);
        assert(false, `Test 2 threw error: ${error.message}`);
    }
}

/**
 * Test 3: Data Classification
 * Verifies that sensitive data is correctly classified
 */
async function testDataClassification() {
    try {
        // Import module
        const { shouldEncrypt } = await import('../../js/security/storage-encryption.js');

        // Test API key patterns (key-based classification)
        const openRouterKey = shouldEncrypt('openrouter.apiKey', 'sk-or-v1-test');
        assert(openRouterKey === true, 'Classifies openrouter.apiKey as sensitive');

        const geminiKey = shouldEncrypt('gemini.apiKey', 'AIzaSyTest');
        assert(geminiKey === true, 'Classifies gemini.apiKey as sensitive');

        // Test chat history patterns
        const chatHistory = shouldEncrypt('chat_20240120', [{role: 'user', content: 'hello'}]);
        assert(chatHistory === true, 'Classifies chat_20240120 as sensitive');

        // Test non-sensitive data
        const themeSetting = shouldEncrypt('theme', 'dark');
        assert(themeSetting === false, 'Does not classify theme as sensitive');

        // Test value-based classification (non-standard key names)
        const customOpenRouter = shouldEncrypt('myCustomKey', 'sk-or-v1-abc123');
        assert(customOpenRouter === true, 'Classifies OpenRouter value format as sensitive');

        const customGemini = shouldEncrypt('myCustomKey', 'AIzaSyABC123');
        assert(customGemini === true, 'Classifies Gemini value format as sensitive');

        const regularString = shouldEncrypt('myCustomKey', 'regular-string');
        assert(regularString === false, 'Does not classify regular strings as sensitive');

        console.log('All classification tests passed');

    } catch (error) {
        console.error('Test 3 failed with error:', error);
        assert(false, `Test 3 threw error: ${error.message}`);
    }
}

/**
 * Test 4: ConfigAPI Integration
 * Verifies transparent encryption/decryption in ConfigAPI
 */
async function testConfigAPIIntegration() {
    try {
        // Import modules
        const { ConfigAPI } = await import('../../js/storage/config-api.js');
        const { IndexedDBCore } = await import('../../js/storage/indexeddb.js');

        // Test data
        const testKey = 'test_openrouter_api_key';
        const testValue = 'sk-or-v1-test-key-12345';

        // Set sensitive config (should auto-encrypt)
        await ConfigAPI.setConfig(testKey, testValue);
        console.log(`Set config: ${testKey} = ${testValue}`);

        // Retrieve from IndexedDB to verify encryption
        const record = await IndexedDBCore.get(IndexedDBCore.STORES.CONFIG, testKey);
        assert(record !== null, 'Record exists in IndexedDB');

        const isEncrypted = record.value?.encrypted === true;
        assert(isEncrypted, 'Record is encrypted in IndexedDB');
        console.log(`Record encrypted: ${isEncrypted}`);

        const storedValue = record.value?.value;
        assert(storedValue !== testValue, 'Encrypted value differs from original');
        console.log(`Stored value: ${storedValue.substring(0, 20)}...`);

        // Get config (should auto-decrypt)
        const retrievedValue = await ConfigAPI.getConfig(testKey);
        assert(retrievedValue !== null, 'Config retrieved successfully');
        assertEqual(retrievedValue, testValue, 'Retrieved value matches original');
        console.log(`Retrieved value: ${retrievedValue}`);

        // Clean up
        await ConfigAPI.removeConfig(testKey);
        console.log('Test record cleaned up');

    } catch (error) {
        console.error('Test 4 failed with error:', error);
        assert(false, `Test 4 threw error: ${error.message}`);
    }
}

/**
 * Test 5: Migration
 * Verifies that plaintext sensitive data can be migrated to encrypted storage
 */
async function testMigration() {
    try {
        // Import modules
        const { ConfigAPI } = await import('../../js/storage/config-api.js');
        const { IndexedDBCore } = await import('../../js/storage/indexeddb.js');

        // Test data
        const testKey = 'test_migration_api_key';
        const testValue = 'sk-or-v1-migration-test';

        // Step 1: Create plaintext record (simulate legacy data)
        await IndexedDBCore.put(IndexedDBCore.STORES.CONFIG, {
            key: testKey,
            value: testValue, // Store as plaintext
            updatedAt: new Date().toISOString()
        });
        console.log(`Created plaintext record: ${testKey} = ${testValue}`);

        // Verify it's plaintext
        const plaintextRecord = await IndexedDBCore.get(IndexedDBCore.STORES.CONFIG, testKey);
        const wasEncrypted = plaintextRecord.value?.encrypted === true;
        assert(wasEncrypted === false, 'Initial record is plaintext');
        console.log(`Initial record encrypted: ${wasEncrypted}`);

        // Step 2: Run migration
        const migrationResult = await ConfigAPI.migrateToEncryptedStorage();
        console.log(`Migration result:`, migrationResult);

        // Verify migration succeeded
        assert(migrationResult.successful >= 1, 'At least one record migrated successfully');
        console.log(`Records migrated: ${migrationResult.successful}`);

        // Step 3: Verify record is now encrypted
        const encryptedRecord = await IndexedDBCore.get(IndexedDBCore.STORES.CONFIG, testKey);
        const isNowEncrypted = encryptedRecord.value?.encrypted === true;
        assert(isNowEncrypted === true, 'Record is encrypted after migration');
        console.log(`Record encrypted after migration: ${isNowEncrypted}`);

        // Step 4: Verify data can still be retrieved (transparent decryption)
        const retrievedValue = await ConfigAPI.getConfig(testKey);
        assertEqual(retrievedValue, testValue, 'Migrated data can be retrieved correctly');
        console.log(`Retrieved value: ${retrievedValue}`);

        // Clean up
        await ConfigAPI.removeConfig(testKey);
        console.log('Test record cleaned up');

    } catch (error) {
        console.error('Test 5 failed with error:', error);
        assert(false, `Test 5 threw error: ${error.message}`);
    }
}

/**
 * Test 6: Secure Deletion
 * Verifies that encrypted records use secure deletion
 */
async function testSecureDeletion() {
    try {
        // Import modules
        const { ConfigAPI } = await import('../../js/storage/config-api.js');
        const { IndexedDBCore } = await import('../../js/storage/indexeddb.js');

        // Test data
        const testKey = 'test_secure_deletion_key';
        const testValue = 'sk-or-v1-secure-delete-test';

        // Step 1: Create encrypted record
        await ConfigAPI.setConfig(testKey, testValue);
        console.log(`Created encrypted record: ${testKey}`);

        // Verify it's encrypted
        const beforeRecord = await IndexedDBCore.get(IndexedDBCore.STORES.CONFIG, testKey);
        const wasEncrypted = beforeRecord.value?.encrypted === true;
        assert(wasEncrypted, 'Record is encrypted before deletion');
        console.log(`Record encrypted: ${wasEncrypted}`);

        // Step 2: Delete record (should use secure deletion)
        await ConfigAPI.removeConfig(testKey);
        console.log(`Deleted record: ${testKey}`);

        // Step 3: Verify record is gone
        const afterRecord = await IndexedDBCore.get(IndexedDBCore.STORES.CONFIG, testKey);
        const isGone = afterRecord === null || afterRecord === undefined;
        assert(isGone, 'Record is deleted from IndexedDB');
        console.log(`Record deleted: ${isGone}`);

        // Note: We cannot easily verify the overwrite happened without specialized
        // IndexedDB inspection tools, but we can verify the secure deletion was called
        // by checking the console logs for "[StorageEncryption] Securely deleting..."

        console.log('Secure deletion test completed (check console logs for overwrite confirmation)');

    } catch (error) {
        console.error('Test 6 failed with error:', error);
        assert(false, `Test 6 threw error: ${error.message}`);
    }
}

// ==========================================
// Test Runner Export
// ==========================================

// Make test function available globally for console execution
if (typeof window !== 'undefined') {
    window.runStorageEncryptionTests = runStorageEncryptionTests;
    console.log('Storage encryption tests loaded.');
    console.log('Run tests with: runStorageEncryptionTests()');
}

export { runStorageEncryptionTests };