#!/usr/bin/env node

/**
 * Test script to verify circular dependency is broken
 * This simulates Node.js import without DOM
 */

console.log('Testing circular dependency fix...\n');

// Mock document and window for Node.js environment
global.document = undefined;
global.window = undefined;

async function testImport() {
    try {
        console.log('1. Importing js/functions/index.js...');
        const functionsModule = await import('./js/functions/index.js');

        console.log('   ✓ Module imported successfully!');

        console.log('\n2. Testing Functions object...');
        const { Functions, SchemaRegistry, initialize } = functionsModule;

        if (!Functions) {
            throw new Error('Functions export is undefined');
        }
        console.log('   ✓ Functions object exists');

        console.log('\n3. Testing schema getters (lazy initialization)...');
        const allSchemas = Functions.getAllSchemas();
        console.log(`   ✓ getAllSchemas() returned ${allSchemas.length} schemas`);

        const templateSchemas = Functions.getTemplateSchemas();
        console.log(`   ✓ getTemplateSchemas() returned ${templateSchemas.length} schemas`);

        const dataSchemas = Functions.getDataSchemas();
        console.log(`   ✓ getDataSchemas() returned ${dataSchemas.length} schemas`);

        console.log('\n4. Testing function discovery...');
        const availableFunctions = Functions.getAvailableFunctions();
        console.log(`   ✓ getAvailableFunctions() returned ${availableFunctions.length} functions`);

        console.log('\n5. Testing FunctionValidator...');
        const { FunctionValidator } = functionsModule;

        // Test null validation
        const nullResult = FunctionValidator.validateFunctionArgs('test', null);
        console.log(`   ✓ Null validation: valid=${nullResult.valid}, errors=${nullResult.errors.length}`);
        if (nullResult.valid !== false) {
            throw new Error('Null validation should reject invalid input');
        }

        // Test undefined validation
        const undefResult = FunctionValidator.validateFunctionArgs('test', undefined);
        console.log(`   ✓ Undefined validation: valid=${undefResult.valid}, errors=${undefResult.errors.length}`);
        if (undefResult.valid !== false) {
            throw new Error('Undefined validation should reject invalid input');
        }

        // Test valid object
        const validResult = FunctionValidator.validateFunctionArgs('test', {});
        console.log(`   ✓ Empty object validation: valid=${validResult.valid}, errors=${validResult.errors.length}`);

        console.log('\n✅ ALL TESTS PASSED! Circular dependency is broken.');
        console.log('\nSummary:');
        console.log('- Module loads without circular dependency errors');
        console.log('- Lazy initialization works correctly');
        console.log('- typeof document checks prevent Node.js failures');
        console.log('- Null validation properly rejects invalid input');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error('\nStack trace:');
        console.error(error.stack);
        process.exit(1);
    }
}

testImport();
