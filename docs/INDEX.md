# Rhythm Chamber Documentation Index

**Last Updated:** 2026-01-23

---

## Quick Navigation

| For... | Start Here |
|--------|------------|
| **Users** | [README.md](../README.md) - Product overview and getting started |
| **Developers** | [Technical Architecture](03-technical-architecture.md) - Zero-backend, BYOI architecture |
| **Contributors** | [Contributing Guide](../CONTRIBUTING.md) - Contribution guidelines |
| **Security Researchers** | [SECURITY.md](../SECURITY.md) - Comprehensive security model |
| **Development Workflow** | [GSD System](gsd-system.md) - Development methodology |

---

## Core Product Documentation

### Product & Vision
- [Product Vision](01-product-vision.md) - Emotional witness positioning, competitive moat
- [User Experience](02-user-experience.md) - Natural language queries, semantic search
- [Intelligence Engine](04-intelligence-engine.md) - Personality types, data depth, artifact generation
- [Artifact Visualization Guide](artifact-visualization-guide.md) - Inline charts and tables in chat
- [Roadmap & Risks](05-roadmap-and-risks.md) - 6-week timeline, competitive positioning
- [Advanced Features](06-advanced-features.md) - Local models, transparency

### Architecture
- [Technical Architecture](03-technical-architecture.md) - Zero-backend, BYOI architecture
- [Operation Lock Contract](operation-lock-contract.md) - Detailed operation lock system

### Setup & Configuration
- [API Setup](API_SETUP.md) - Power user configuration guide
- [Deployment Guide](DEPLOYMENT.md) - Deployment instructions

---

## Security Documentation

### Security Architecture
- [SECURITY.md](../SECURITY.md) - Comprehensive security model, threat analysis
- [v0.9 Security Milestone](security-milestone-v0.9.md) - Security hardening completion report

**v0.9 Security Modules:**
- KeyManager - Non-extractable key lifecycle management
- StorageEncryption - AES-GCM-256 storage encryption
- MessageSecurity - HMAC-SHA256 message signing

**Security Guarantees:**
- ✅ All API keys encrypted at rest (AES-GCM-256)
- ✅ Chat history encrypted with unique IV per operation
- ✅ All cross-tab messages authenticated (HMAC-SHA256)
- ✅ Replay attack prevention (timestamps + nonces)
- ✅ Sensitive data sanitized from broadcasts

---

## Development Documentation

### Development Workflow
- [GSD System](gsd-system.md) - Get Shit Done development methodology
  - Phases, plans, tasks, and waves
  - Autonomous execution with strategic checkpoints
  - Comprehensive documentation and verification

### Planning System
- **Location:** `.planning/` directory
- **Key Files:**
  - `ROADMAP.md` - Phase-level planning
  - `STATE.md` - Current position and decisions
  - `REQUIREMENTS.md` - Requirements specification
  - `phases/*/` - Phase directories with PLAN/SUMMARY

### Contributor Guides
- [Contributing Guide](../CONTRIBUTING.md) - How to contribute, PR guidelines, code style
- [Testing Guide](../TESTING.md) - Running and writing tests, test patterns

### Testing
- [Testing Guide](../TESTING.md) - Comprehensive testing documentation
- Unit tests: `tests/unit/` (Vitest)
- E2E tests: `tests/rhythm-chamber.spec.ts` (Playwright)
- Integration tests: `tests/integration/`

---

## Pricing & Monetization

### Pricing Model
- [Two-Tier Pricing Model](pricing-two-tier-model.md) - Sovereign (Free) & Chamber (Premium) tiers
- [Pricing Implementation Summary](pricing-implementation-summary.md) - Implementation details
- [Lemon Squeezy Setup Guide](LEMON_SQUEEZY_SETUP.md) - Payment provider configuration
- [License Verification](license-verification.md) - Premium feature licensing

**Tiers:**
| Tier | Price | Focus |
|------|-------|-------|
| **Sovereign** | Free | Privacy & Viral Growth |
| **Chamber** | $4.99/mo or $39/yr | Advanced Analytics & Convenience |

**Payment Provider:**
- **Lemon Squeezy** - Overlay checkout, built-in license keys, no backend required

---

## User Documentation

### Onboarding
- [Onboarding Guide](onboarding-guide.md) - New user orientation
- [Premium Features Guide](premium-features-guide.md) - Chamber tier features

### User Journeys
- [The Skeptical Privacy Advocate](user-journeys/01-the-skeptical-privacy-advocate.md)
- [The Music Nerd](user-journeys/02-the-music-nerd.md)
- [The Stats.fm Refugee](user-journeys/03-the-stats-fm-refugee.md)
- [The Non-Technical User](user-journeys/04-the-non-technical-user.md)

---

## AI Agent Reference

**For Claude and other AI assistants:**

- [AGENT_CONTEXT.md](../AGENT_CONTEXT.md) - Comprehensive AI agent reference
  - Project status and implementation details
  - Monetization strategy
  - Security considerations
  - Deployment instructions
  - Development methodology (GSD system)

---

## File Structure Overview

```
rhythm-chamber/
├── README.md                    # Product overview and getting started
├── AGENT_CONTEXT.md             # AI agent reference
├── SECURITY.md                  # Security model and threat analysis
│
├── docs/                        # Main documentation
│   ├── INDEX.md                 # This file
│   ├── gsd-system.md            # Development methodology
│   ├── security-milestone-v0.9.md
│   └── ...
│
├── .planning/                   # GSD planning system
│   ├── PROJECT.md               # Living project context
│   ├── STATE.md                 # Current position
│   ├── ROADMAP.md               # Phase planning
│   ├── REQUIREMENTS.md          # Requirements
│   └── phases/                  # Phase directories
│
├── js/                          # Application source
│   ├── security/                # Security modules (v0.9)
│   │   ├── key-manager.js
│   │   ├── storage-encryption.js
│   │   └── message-security.js
│   ├── controllers/
│   ├── services/
│   └── ...
│
└── tests/                       # Test suites
    ├── unit/
    ├── integration/
    └── rhythm-chamber.spec.ts
```

---

## Recent Updates

### 2026-01-23
- ✅ **Artifact Visualization System Complete** - Claude-style inline charts in chat
- ✅ **Artifact Visualization Guide Added** - Comprehensive system documentation
- ✅ **Intelligence Engine Updated** - Added artifact generation capabilities
- ✅ **User Experience Documentation Enhanced** - Inline visualization examples

### 2026-01-21
- ✅ **v0.9 Security Hardening Complete** - All 23 requirements satisfied
- ✅ **GSD System Documentation Added** - Development methodology documented
- ✅ **Pricing Model Updated** - Three-pillar model (Sovereign, Curator, Chamber)
- ✅ **README Updated** - Current pricing and security milestone links

---

## Getting Started

### For New Users
1. Read [README.md](../README.md) for product overview
2. Try [Demo Mode](../README.md#demo-mode) for instant evaluation
3. Review [User Journeys](user-journeys/) for relatable examples

### For Developers
1. Read [Technical Architecture](03-technical-architecture.md)
2. Review [GSD System](gsd-system.md) for development workflow
3. Check [AGENT_CONTEXT.md](../AGENT_CONTEXT.md) for implementation details
4. Run `npm install && npm run dev` to start development

### For Security Researchers
1. Read [SECURITY.md](../SECURITY.md) for threat model
2. Review [v0.9 Security Milestone](security-milestone-v0.9.md) for implementation
3. Examine `js/security/` modules for cryptographic details

---

**Documentation Version:** 1.0.0
**Project Status:** MVP Complete + v0.9 Security Hardening Complete
**Next Milestone:** v1.0 Launch

---

*For questions or contributions, refer to the [GSD System](gsd-system.md) documentation.*
