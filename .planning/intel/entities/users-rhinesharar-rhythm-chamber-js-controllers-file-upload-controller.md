---
path: /Users/rhinesharar/rhythm-chamber/js/controllers/file-upload-controller.js
type: controller
updated: 2026-01-21
status: active
---

# file-upload-controller.js

## Purpose

Handles file upload processing with Web Worker orchestration and manages file parsing/validation workflows for JSON and ZIP archives.

## Exports

- `FileUploadController` - Main controller object with initialization and file handling methods
- `init(dependencies)` - Initialize controller with injected dependencies
- `handleFileUpload(file)` - Main entry point for file upload processing
- `parseJSONFile(content)` - Parse JSON file content
- `processZipFile(file)` - Process ZIP archive files
- `cancelWorkerOperation()` - Cancel active Web Worker operations

## Dependencies

- [[js-utils-input-validation]] - InputValidation utility (dynamically imported)
- [[storage]] - Storage operations (injected)
- [[js-settings]] - AppState management (injected)
- [[event-bus-js]] - OperationLock for concurrency control (injected)
- [[patterns]] - Pattern utilities (injected)
- [[personality]] - Personality configuration (injected)
- [[js-controllers-view-controller]] - ViewController (injected)

## Used By

- [[js-app]] - Main application initialization

## Notes

Uses dependency injection pattern with all dependencies passed via `init()`. Implements Web Worker for heavy file processing to prevent UI blocking. Handles both JSON and ZIP file formats with validation fallbacks.