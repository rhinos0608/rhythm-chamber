/**
 * Simple export verification - checks if the exports exist
 */

// Read the facade file and check for the exports
import { readFileSync } from 'fs';
const facadeContent = readFileSync('js/genre-enrichment/index.js', 'utf-8');

console.log('='.repeat(60));
console.log('Batch 2: Verifying P0-3 Exports in Facade');
console.log('='.repeat(60));

// Check for isQueueProcessing export
console.log('\n[Check 1] Looking for isQueueProcessing export...');
const hasIsQueueProcessing = facadeContent.includes('export { isProcessing as isQueueProcessing }');
console.log(hasIsQueueProcessing ? '✓ Found: export { isProcessing as isQueueProcessing }' : '❌ Missing');

// Check for getApiStats export
console.log('\n[Check 2] Looking for getApiStats export...');
const hasGetApiStats = facadeContent.includes('export { getStats as getApiStats }');
console.log(hasGetApiStats ? '✓ Found: export { getStats as getApiStats }' : '❌ Missing');

// Check for the backward compatibility section
console.log('\n[Check 3] Looking for Backward Compatibility section...');
const hasSection = facadeContent.includes('// Backward Compatibility Aliases');
console.log(hasSection ? '✓ Found: Backward Compatibility section' : '❌ Missing');

// Final result
console.log('\n' + '='.repeat(60));
if (hasIsQueueProcessing && hasGetApiStats && hasSection) {
    console.log('✓ ALL EXPORTS VERIFIED - Fix 2.1 is complete!');
} else {
    console.log('❌ SOME EXPORTS MISSING - Fix incomplete!');
    process.exit(1);
}
console.log('='.repeat(60));
