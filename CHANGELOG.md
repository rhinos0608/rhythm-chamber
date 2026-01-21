# Changelog

All notable changes to Rhythm Chamber will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- TROUBLESHOOTING.md - Common error patterns and solutions
- API_REFERENCE.md - Core module API documentation
- CODE_OF_CONDUCT.md - Community guidelines

---

## [0.9.0] - 2026-01-21

### Added

#### Security (v0.9 Milestone)
- **KeyManager Module** (`js/security/key-manager.js`) - Three-tier key management with non-extractable keys
- **StorageEncryption Module** (`js/security/storage-encryption.js`) - AES-GCM-256 encryption for sensitive data
- **MessageSecurity Module** (`js/security/message-security.js`) - HMAC-SHA256 message signing for cross-tab communication
- **SecurityCoordinator** - Unified security initialization
- **Safe Mode** - Fail-closed behavior when security modules unavailable
- **Prototype Pollution Protection** - Object/Array/Function prototype freezing
- **Unified Error Context** - Structured errors with recovery paths

#### Storage
- **Write-Ahead Log** - ACID guarantees for storage operations
- **QuotaManager** - Storage quota monitoring with auto-archive
- **ArchiveService** - Stream archival for quota management
- **ProfileStorage** - Multi-profile support
- **StorageTransaction** - Atomic transactions across storage backends

#### Features
- **Multi-Profile Support** - Create and switch between multiple user profiles
- **Data Archival** - Automatic archiving of old streams when quota exceeded
- **Provider Health Monitoring** - Real-time AI provider status with fallback
- **Circuit Breaker** - Per-handler circuit breaker for event bus
- **Vector Clock** - Event versioning and replay support

### Changed
- **EventBus** - Enhanced with health monitoring, circuit breaker, event logging
- **Storage** - Migrated from localStorage to IndexedDB with migration support
- **ConfigAPI** - Integrated with StorageEncryption for automatic encryption
- **Tab Coordination** - Integrated with MessageSecurity for secure messaging

### Security
- All LLM provider API keys encrypted with AES-GCM-256
- Chat history encrypted at rest
- Cross-tab communication authenticated with HMAC-SHA256
- Session-bound key derivation (PBKDF2, 600,000 iterations)
- Device fingerprint binding for Spotify tokens
- Geographic anomaly detection with adaptive thresholds

---

## [0.8.0] - 2026-01-15

### Added
- i18n support with Unicode-safe string truncation
- RTL (Right-to-Left) language support

### Fixed
- String truncation to handle multi-byte characters correctly

---

## [0.7.0] - 2026-01-14

### Added
- Comprehensive input validation for provider functions
- Async mutex for concurrent operation control
- Memory leak fix in tab coordination

### Security
- Input validation applied to all provider API calls
- Sanitization of user-provided JSON data

---

## [0.6.0] - 2026-01-10

### Added
- CONTRIBUTING.md - Contribution guidelines
- TESTING.md - Testing guide with Vitest and Playwright

### Changed
- Enhanced event system robustness
- Improved cross-tab coordination

---

## [0.5.0] - 2026-01-05

### Added
- Three-layer value stack documentation (Emotional, Privacy, Control)
- GSD system documentation
- Pricing strategy documentation

### Changed
- README restructuring with clearer value proposition
- Documentation index (docs/INDEX.md)

---

## [0.4.0] - 2025-12-20

### Added
- WASM-based semantic search (100% client-side, no Qdrant dependency)
- Local embeddings with transformer models

### Removed
- Qdrant cloud dependency (moved to WASM-only architecture)

---

## [0.3.0] - 2025-12-10

### Added
- BYOI (Bring Your Own Intelligence) provider system
- OpenRouter integration
- Anthropic Claude integration
- OpenAI integration
- Gemini integration
- Local model support (Ollama, LM Studio)

### Changed
- Provider architecture for pluggable AI backends

---

## [0.2.0] - 2025-12-01

### Added
- Semantic search with Qdrant integration (later removed in v0.4)
- Chat interface with streaming responses
- Demo mode with sample personas

---

## [0.1.0] - 2025-11-15

### Added
- Initial MVP release
- Spotify data export processing
- Personality classification (Emotional Archaeologist, etc.)
- Basic visualization

---

## Version History Summary

| Version | Date | Key Features |
|---------|------|--------------|
| 0.9.0 | 2026-01-21 | Security hardening, multi-profile, archival |
| 0.8.0 | 2026-01-15 | i18n, RTL support |
| 0.7.0 | 2026-01-14 | Input validation, async mutex |
| 0.6.0 | 2026-01-10 | CONTRIBUTING.md, TESTING.md |
| 0.5.0 | 2026-01-05 | Documentation expansion |
| 0.4.0 | 2025-12-20 | WASM semantic search |
| 0.3.0 | 2025-12-10 | BYOI provider system |
| 0.2.0 | 2025-12-01 | Semantic search, chat |
| 0.1.0 | 2025-11-15 | Initial MVP |

---

**Note:** This changelog was created retroactively for versions prior to v0.9.0. Future releases will maintain this format.
