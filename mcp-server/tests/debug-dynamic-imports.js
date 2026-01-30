#!/usr/bin/env node

/**
 * Debug script for dynamic import detection
 */

import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ASTParser } from '../src/utils/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const testDir = resolve(projectRoot, '.test-debug');

function setupTestFiles() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
  mkdirSync(testDir, { recursive: true });

  // Simple dynamic import test
  writeFileSync(
    resolve(testDir, 'test.js'),
    `
const module = await import('./test.js');
`
  );
}

function cleanupTestFiles() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

async function debug() {
  setupTestFiles();

  const parser = new ASTParser();
  const testPath = resolve(testDir, 'test.js');

  console.log('Parsing test file with dynamic import...\n');

  const ast = parser.parse(testPath);

  console.log('AST Program Body:');
  console.log('==================');
  ast.program.body.forEach((stmt, i) => {
    console.log(`\nStatement ${i}:`);
    console.log(`  Type: ${stmt.type}`);

    if (stmt.type === 'VariableDeclaration') {
      console.log(`  Declarations: ${stmt.declarations.length}`);
      stmt.declarations.forEach((decl, j) => {
        console.log(`    Declaration ${j}:`);
        console.log(`      Type: ${decl.id.type}`);
        console.log(`      Name: ${decl.id.name}`);
        if (decl.init) {
          console.log(`      Init Type: ${decl.init.type}`);
          if (decl.init.type === 'AwaitExpression') {
            console.log(`        Argument Type: ${decl.init.argument.type}`);
            if (decl.init.argument.type === 'CallExpression') {
              console.log(`          Callee Type: ${decl.init.argument.callee.type}`);
              console.log(`          Callee Name: ${decl.init.argument.callee.name || 'N/A'}`);
              console.log(`          Arguments: ${decl.init.argument.arguments.length}`);
            }
          }
        }
      });
    }
  });

  // Now extract imports
  console.log('\n\nExtracted Imports:');
  console.log('==================');
  const imports = parser.extractImports(ast);
  console.log(`Total: ${imports.length}`);
  imports.forEach((imp, i) => {
    console.log(`\nImport ${i}:`);
    console.log(`  Source: ${imp.source}`);
    console.log(`  Type: ${imp.type}`);
  });

  cleanupTestFiles();
}

debug().catch(console.error);
