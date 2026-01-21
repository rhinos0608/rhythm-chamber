---
path: /Users/rhinesharar/rhythm-chamber/.planning/codebase/build-index.js
type: util
updated: 2026-01-21
status: active
---

# build-index.js

## Purpose

Codebase intelligence index generator that processes JavaScript/TypeScript files to extract exports and imports for indexing using AST-based parsing.

## Exports

- `processFile` - Processes a single file to extract exports and imports
- `extractExports` - Extracts export declarations from AST
- `extractImports` - Extracts import declarations from AST
- `main` - Main entry point for index generation
- `foo` - Test export
- `bar` - Test export
- `baz` - Test export
- `Foo` - Test class export
- `Bar` - Test class export
- `Baz` - Test class export
- `default` - Default export

## Dependencies

- `fs` - Node.js filesystem module
- `path` - Node.js path module
- `@babel/parser` - Babel parser for AST generation

## Used By

TBD

## Notes

Uses @babel/parser for reliable AST-based extraction instead of regex. Processes files defined in FILES array constant.