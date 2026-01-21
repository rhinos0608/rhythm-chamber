# Contributing to Rhythm Chamber

Thank you for your interest in contributing to Rhythm Chamber! This document provides guidelines for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Security Considerations](#security-considerations)
- [Submitting Changes](#submitting-changes)

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- Git

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/rhythm-chamber.git
   cd rhythm-chamber
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

### Development Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local development server on port 8080 |
| `npm run dev:coop-coep` | Start dev server with COOP/COEP headers for SharedArrayBuffer |
| `npm test` | Run E2E tests (Playwright) |
| `npm run test:unit` | Run unit tests (Vitest) |
| `npm run test:unit:watch` | Run unit tests in watch mode |
| `npm run test:ui` | Run Playwright tests with UI |
| `npm run lint:globals` | Check for accidental window globals |

## Development Workflow

### Branch Strategy

- `main` - Protected branch, production code
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates
- `refactor/*` - Code refactoring

### Making Changes

1. Create a branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the [Code Style](#code-style) guidelines

3. Test your changes:
   ```bash
   npm run test:unit
   npm test
   ```

4. Commit your changes with clear messages:
   ```bash
   git commit -m "feat: add new provider support"
   ```

5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. Create a pull request

## Testing

### Unit Tests (Vitest)

Unit tests are located in `tests/unit/` and test individual modules, schemas, and utilities.

```bash
npm run test:unit          # Run all unit tests once
npm run test:unit:watch    # Run in watch mode for TDD
```

When writing unit tests:
- Mock external dependencies (API calls, browser APIs)
- Test both success and failure cases
- Use descriptive test names
- Keep tests fast and isolated

### E2E Tests (Playwright)

E2E tests are in `tests/rhythm-chamber.spec.ts` and test the full user flow.

```bash
npm test           # Run all E2E tests
npm run test:ui    # Run with UI for debugging
npm run test:headed  # Run in headed mode
```

### Test Data

- Use `sample_data.json` for consistent test data
- Demo mode personas are available in `js/demo-data.js`
- Create isolated test data when needed

## Code Style

### ES6 Modules

Rhythm Chamber uses ES6 modules exclusively. Avoid creating global variables:

```javascript
// Good
import { Storage } from './storage.js';
export function processData() { /* ... */ }

// Bad
window.Storage = { /* ... */ }
```

### JSDoc Comments

Document public interfaces with JSDoc:

```javascript
/**
 * Process Spotify streaming data and detect patterns
 * @param {Array<Object>} streams - Raw streaming data
 * @returns {Promise<PatternResult>} Detected patterns
 */
export async function detectPatterns(streams) {
    // ...
}
```

### Error Handling

Use the Operation Lock system for operations that may fail:

```javascript
import { OperationLock } from './operation-lock.js';

const lock = OperationLock.acquire('processing');
try {
    // Your operation here
} catch (error) {
    // Handle error
} finally {
    lock.release();
}
```

### Security

- Never log sensitive data (API keys, tokens)
- Use `Security.storeEncryptedCredentials()` for credentials
- Validate all user inputs
- Follow the threat model in `SECURITY.md`

## Security Considerations

Rhythm Chamber has completed the v0.9 Security Hardening milestone. When contributing:

### Security Review Required

Any changes to these areas require security review:
- `js/security/` modules
- Credential handling
- Cross-tab communication
- Storage encryption
- OAuth flows

### Security Testing

- Test for XSS vulnerabilities (avoid `innerHTML` with user input)
- Verify secure context requirements (HTTPS/localhost)
- Test credential encryption/decryption
- Check for accidental data leakage in logs

### Reporting Security Issues

If you discover a security vulnerability:
1. Do NOT create a public issue
2. Email the maintainers directly
3. Allow 90 days for patch before disclosure

See `SECURITY.md` for the full security model.

## Submitting Changes

### Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Tests pass locally (`npm test` && `npm run test:unit`)
- [ ] Code follows style guidelines
- [ ] JSDoc comments added for public APIs
- [ ] Security review completed if needed
- [ ] Documentation updated (if applicable)
- [ ] Commit messages follow conventional commits

### Commit Message Format

Use conventional commit prefixes:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Test changes
- `security:` - Security fixes

Examples:
```
feat: add support for local embeddings
fix: prevent race condition in tab coordination
security: invalidate tokens on geographic anomaly
```

### Review Process

1. Automated checks must pass
2. At least one maintainer approval required
3. Security changes require additional review
4. All discussions must be resolved before merge

## Getting Help

- Read `AGENT_CONTEXT.md` for technical architecture
- Check `docs/INDEX.md` for documentation index
- Review existing code patterns in `js/` directory
- Ask questions in your PR if unsure

## Architecture Notes

### Key Modules

- `js/main.js` - Application entry point
- `js/app.js` - Main application controller
- `js/security/` - Security modules (KeyManager, Encryption, MessageSecurity)
- `js/services/` - Business logic services
- `js/controllers/` - UI controllers
- `js/storage/` - Storage layer (IndexedDB, encryption)
- `js/providers/` - LLM provider adapters

### HNW Architecture

The codebase follows the Hierarchical Network Wave (HNW) pattern:
- **Hierarchy**: Clear chain of command (App -> Controller -> Service -> Provider)
- **Network**: Modular communication via events
- **Wave**: Deterministic leader election, async/sync separation

See `AGENT_CONTEXT.md` for full details.

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (ISC).

---

Thank you for contributing to Rhythm Chamber!
