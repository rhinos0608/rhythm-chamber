/**
 * Browser-based integration test for KeyManager facade exports
 * Run this in the browser console to verify KeyManager integration
 *
 * Instructions:
 * 1. Open Rhythm Chamber in browser
 * 2. Open DevTools console
 * 3. Paste this entire script
 * 4. Run: testKeyManagerIntegration()
 */

async function testKeyManagerIntegration() {
    console.log('Testing KeyManager integration via Security facade...');

    try {
        // Initialize a key session first (required for KeyManager methods)
        console.log('0. Initializing key session...');
        const sessionInitialized = await window.Security.initializeKeySession('test-password');
        if (!sessionInitialized) {
            throw new Error('Failed to initialize key session');
        }
        console.log('✓ Key session initialized');

        // Test 1: getDataEncryptionKey export
        console.log('1. Testing Security.getDataEncryptionKey...');
        const dataKey = await window.Security.getDataEncryptionKey();
        if (!dataKey) {
            throw new Error('getDataEncryptionKey returned null/undefined');
        }
        console.log('✓ getDataEncryptionKey works');

        // Test 2: getSigningKey export
        console.log('2. Testing Security.getSigningKey...');
        const signingKey = await window.Security.getSigningKey();
        if (!signingKey) {
            throw new Error('getSigningKey returned null/undefined');
        }
        console.log('✓ getSigningKey works');

        // Test 3: getSessionKeyKM export
        console.log('3. Testing Security.getSessionKeyKM...');
        const sessionKey = await window.Security.getSessionKeyKM();
        if (!sessionKey) {
            throw new Error('getSessionKeyKM returned null/undefined');
        }
        console.log('✓ getSessionKeyKM works');

        // Test 4: Verify legacy getSessionKey still works
        console.log('4. Testing legacy Security.getSessionKey...');
        const legacyKey = await window.Security.getSessionKey();
        if (!legacyKey) {
            throw new Error('Legacy getSessionKey returned null/undefined');
        }
        console.log('✓ Legacy getSessionKey still works');

        // Test 5: Verify keys are CryptoKey objects
        console.log('5. Verifying key types...');
        if (dataKey.constructor.name !== 'CryptoKey') {
            throw new Error('getDataEncryptionKey did not return CryptoKey');
        }
        if (signingKey.constructor.name !== 'CryptoKey') {
            throw new Error('getSigningKey did not return CryptoKey');
        }
        if (sessionKey.constructor.name !== 'CryptoKey') {
            throw new Error('getSessionKeyKM did not return CryptoKey');
        }
        console.log('✓ All keys are CryptoKey objects');

        // Test 6: Verify keys are non-extractable (KeyManager requirement)
        console.log('6. Verifying keys are non-extractable...');
        if (dataKey.extractable) {
            throw new Error('getDataEncryptionKey is extractable (should be non-extractable)');
        }
        if (signingKey.extractable) {
            throw new Error('getSigningKey is extractable (should be non-extractable)');
        }
        if (sessionKey.extractable) {
            throw new Error('getSessionKeyKM is extractable (should be non-extractable)');
        }
        console.log('✓ All KeyManager keys are non-extractable');

        // Test 7: Verify key usages are correct
        console.log('7. Verifying key usages...');
        if (!dataKey.usages.includes('encrypt') || !dataKey.usages.includes('decrypt')) {
            throw new Error('getDataEncryptionKey missing encrypt/decrypt usages');
        }
        if (!signingKey.usages.includes('sign') || !signingKey.usages.includes('verify')) {
            throw new Error('getSigningKey missing sign/verify usages');
        }
        if (!sessionKey.usages.includes('encrypt') || !sessionKey.usages.includes('decrypt')) {
            throw new Error('getSessionKeyKM missing encrypt/decrypt usages');
        }
        console.log('✓ All keys have correct usages');

        // Clean up
        console.log('8. Cleaning up key session...');
        window.Security.clearKeySession();
        console.log('✓ Key session cleared');

        console.log('\n✅ All integration tests passed!');
        console.log('\nSummary:');
        console.log('- Security.getDataEncryptionKey() ✓');
        console.log('- Security.getSigningKey() ✓');
        console.log('- Security.getSessionKeyKM() ✓');
        console.log('- Security.getSessionKey() (legacy) ✓');
        console.log('- All keys are non-extractable CryptoKey objects ✓');
        console.log('- All keys have correct cryptographic usages ✓');

        return true;
    } catch (error) {
        console.error('\n❌ Integration test failed:', error.message);
        console.error('Stack:', error.stack);
        throw error;
    }
}

// Make function available globally
window.testKeyManagerIntegration = testKeyManagerIntegration;

console.log('KeyManager integration test loaded.');
console.log('Run: testKeyManagerIntegration()');