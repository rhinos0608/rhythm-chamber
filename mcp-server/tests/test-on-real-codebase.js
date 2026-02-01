#!/usr/bin/env node

/**
 * Direct test of MCP server tools on the Rhythm Chamber codebase
 * Tests all 4 MCP tools with real project files
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

console.log('🧪 Testing MCP Server on Rhythm Chamber Codebase\n');
console.log('='.repeat(70));
console.log(`Project Root: ${projectRoot}\n`);

// Import tool handlers directly
import * as moduleInfo from '../src/tools/module-info.js';
import * as dependencies from '../src/tools/dependencies.js';
import * as architecture from '../src/tools/architecture.js';
import * as validation from '../src/tools/validation.js';

let passed = 0;
let failed = 0;

async function testTool(toolName, handler, args, testDescription) {
  console.log(`\n📦 Test: ${testDescription}`);
  console.log('-'.repeat(70));

  try {
    const result = await handler(args, projectRoot);

    if (result.content && result.content.length > 0) {
      const text = result.content[0].text;

      // Show first 500 chars of output
      const preview = text.length > 500 ? text.substring(0, 500) + '\n... (truncated)' : text;
      console.log(preview.substring(0, 1000)); // Show more

      if (result.isError) {
        console.log('\n❌ Tool returned error');
        failed++;
      } else {
        console.log(`\n✅ ${toolName} executed successfully`);
        passed++;
      }
    } else {
      console.log('⚠️  No content returned');
      failed++;
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    console.error(error.stack);
    failed++;
  }
}

async function runTests() {
  console.log(`\n${new Date().toISOString()}`);

  // Test 1: get_module_info - Analyze a controller
  await testTool(
    'get_module_info',
    moduleInfo.handler,
    {
      filePath: 'js/controllers/chat-ui-controller.js',
      includeDependencies: true,
      includeExports: true,
    },
    'Test 1: Analyze chat-ui-controller.js'
  );

  // Test 2: find_dependencies - Trace dependencies from main.js
  await testTool(
    'find_dependencies',
    dependencies.handler,
    {
      startModule: 'js/main.js',
      dependencyType: 'all',
      maxDepth: 2,
      filterByLayer: 'all',
    },
    'Test 2: Find dependencies from js/main.js (depth 2)'
  );

  // Test 3: search_architecture - Find EventBus usage
  await testTool(
    'search_architecture',
    architecture.handler,
    {
      pattern: 'EventBus usage',
      layer: 'all',
      complianceCheck: false,
      maxResults: 20,
    },
    'Test 3: Search for EventBus usage patterns'
  );

  // Test 4: validate_hnw_compliance - Check controller layer
  await testTool(
    'validate_hnw_compliance',
    validation.handler,
    {
      filePath: 'js/controllers',
      checkViolations: true,
      generateReport: true,
    },
    'Test 4: Validate HNW compliance for controllers layer'
  );

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 Test Summary');
  console.log('-'.repeat(70));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);

  if (failed === 0) {
    console.log('\n🎉 All MCP server tools working correctly on production codebase!\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed\n`);
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('\n❌ Test suite error:', error);
  process.exit(1);
});
