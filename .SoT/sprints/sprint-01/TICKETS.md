# Sprint 01 Tickets: ZKEB Foundation

**Sprint**: 01 - Military-Grade Cloud Encryption
**Duration**: 4 weeks (20 working days)
**Total Tickets**: 24
**Story Points**: 89

---

## Ticket Status Legend
- 🔴 **Blocked** - Cannot proceed due to dependencies
- 🟡 **In Progress** - Currently being worked on
- 🟢 **Complete** - Done and verified
- ⚪ **Not Started** - Queued for work

---

## Week 1: Core Cryptography (Days 1-5)

### Ticket 01-01: HKDF Custom Implementation
**Agent**: QUANTUM
**Status**: ⚪ Not Started
**Story Points**: 8
**Dependencies**: None
**Priority**: P0 (Critical Path)

**Description**:
Implement HKDF (HMAC-based Key Derivation Function) per RFC 5869 since WebCrypto API doesn't expose HKDF directly.

**Acceptance Criteria**:
- [ ] Implements RFC 5869 Extract-and-Expand pattern
- [ ] Passes all 7 RFC 5869 Appendix A test vectors
- [ ] TypeScript strict mode with full type safety
- [ ] <5ms performance for typical key derivation
- [ ] Documentation with security properties explained

**Deliverables**:
- `packages/crypto/src/hkdf.ts` (100 lines)
- `packages/crypto/__tests__/hkdf.test.ts` (RFC vectors)
- API documentation in README.md

**Notes**:
- This is the ONLY custom crypto implementation needed
- All other primitives use native WebCrypto
- External cryptographer review recommended

---

### Ticket 01-02: AES-256-GCM Encryption Wrapper
**Agent**: QUANTUM
**Status**: ⚪ Not Started
**Story Points**: 5
**Dependencies**: None
**Priority**: P0 (Critical Path)

**Description**:
Create TypeScript wrapper around WebCrypto AES-GCM for authenticated encryption.

**Acceptance Criteria**:
- [ ] Encrypts/decrypts using AES-256-GCM
- [ ] Generates cryptographically secure 96-bit nonces
- [ ] Handles authentication tags correctly
- [ ] Passes NIST SP 800-38D test vectors
- [ ] <3ms encryption time for 1KB data

**Deliverables**:
- `packages/crypto/src/aes-gcm.ts`
- `packages/crypto/__tests__/aes-gcm.test.ts` (NIST vectors)
- Performance benchmarks

**Notes**:
- Use `crypto.subtle.encrypt/decrypt` (native)
- Nonce MUST be unique per encryption
- Include associated data (AD) parameter

---

### Ticket 01-03: Key Hierarchy Implementation
**Agent**: QUANTUM
**Status**: ⚪ Not Started
**Story Points**: 8
**Dependencies**: 01-01 (HKDF), 01-02 (AES-GCM)
**Priority**: P0 (Critical Path)

**Description**:
Implement hierarchical key derivation: UMK → DMK → BEK/MEK using HKDF.

**Acceptance Criteria**:
- [ ] User Master Key (UMK) generation (256-bit random)
- [ ] Device Master Key (DMK) derived from UMK + deviceId
- [ ] Backup Encryption Key (BEK) derived from DMK
- [ ] Metadata Encryption Key (MEK) derived from DMK
- [ ] Keys derivable deterministically (same input → same keys)
- [ ] Keys NEVER stored unencrypted server-side

**Deliverables**:
- `packages/crypto/src/key-hierarchy.ts`
- `packages/crypto/__tests__/key-hierarchy.test.ts`
- Key derivation flow diagram

**Notes**:
- iOS implementation in `/Users/quikolas/Documents/GitHub/Base/Security/Core/EncryptionService.swift` lines 285-322
- Must maintain cryptographic equivalence for cross-platform sync

---

### Ticket 01-04: PBKDF2 Password-Based Key Derivation
**Agent**: QUANTUM
**Status**: ⚪ Not Started
**Story Points**: 3
**Dependencies**: None
**Priority**: P1 (Important)

**Description**:
Implement PBKDF2 for deriving encryption keys from user passwords (account recovery scenario).

**Acceptance Criteria**:
- [ ] 600,000 iterations (OWASP 2023 recommendation)
- [ ] SHA-256 as PRF
- [ ] Random 128-bit salt generation
- [ ] Passes PBKDF2 test vectors
- [ ] <200ms derivation time

**Deliverables**:
- `packages/crypto/src/pbkdf2.ts`
- `packages/crypto/__tests__/pbkdf2.test.ts`
- Documentation on iteration count rationale

**Notes**:
- Use `crypto.subtle.deriveKey` (native)
- Store salt alongside derived key metadata
- Never log passwords or derived keys

---

### Ticket 01-05: RSA-4096 Signature Wrapper
**Agent**: QUANTUM
**Status**: ⚪ Not Started
**Story Points**: 5
**Dependencies**: None
**Priority**: P1 (Important)

**Description**:
Implement RSA-4096-PSS for device certificate signatures and backup integrity verification.

**Acceptance Criteria**:
- [ ] Generates 4096-bit RSA key pairs
- [ ] Signs data using PSS padding (SHA-256)
- [ ] Verifies signatures
- [ ] Public key export/import (SPKI format)
- [ ] <50ms key generation time

**Deliverables**:
- `packages/crypto/src/rsa.ts`
- `packages/crypto/__tests__/rsa.test.ts`
- Key format documentation

**Notes**:
- Use `crypto.subtle.generateKey` (native)
- Private keys stored in IndexedDB (non-extractable if possible)
- Public keys transmitted to server for verification

---

### Ticket 01-06: Crypto Package Integration & Benchmarks
**Agent**: QUANTUM
**Status**: ⚪ Not Started
**Story Points**: 5
**Dependencies**: 01-01, 01-02, 01-03, 01-04, 01-05
**Priority**: P0 (Critical Path)

**Description**:
Integrate all crypto primitives into cohesive `@zkeb/crypto` package with comprehensive tests and benchmarks.

**Acceptance Criteria**:
- [ ] All primitives exported from package index
- [ ] TypeScript declarations (.d.ts files)
- [ ] 100% test coverage for crypto code
- [ ] Performance benchmarks documented
- [ ] API reference documentation complete

**Deliverables**:
- `packages/crypto/src/index.ts` (main export)
- `packages/crypto/README.md` (API docs)
- `packages/crypto/BENCHMARKS.md`
- npm publishable package

**Notes**:
- Run `npm run bench:crypto` to generate benchmarks
- All benchmarks must meet targets from SPRINT-01.md
- Tag version as `v0.1.0-alpha`

---

## Week 2: Backend Infrastructure (Days 6-10)

### Ticket 01-07: Prisma Schema - Zero-Knowledge Database Design
**Agent**: Rafael Santos
**Status**: ⚪ Not Started
**Story Points**: 8
**Dependencies**: None
**Priority**: P0 (Critical Path)

**Description**:
Create Prisma schema for zero-knowledge data storage on PostgreSQL.

**Acceptance Criteria**:
- [ ] `zkeb.users` table (hashed identifiers)
- [ ] `zkeb.encrypted_backups` table (ciphertext BYTEA)
- [ ] `zkeb.devices` table (public keys only, NO private keys)
- [ ] `zkeb.audit_logs` table (zero-knowledge audit trail)
- [ ] RLS policies for multi-tenant isolation
- [ ] Composite indexes for performance

**Deliverables**:
- `prisma/schema.prisma` (complete schema)
- `prisma/migrations/` (initial migration)
- `prisma/seed.ts` (development seed data)
- Schema documentation

**Notes**:
- Reference: `.SoT/sprints/sprint-01/research/RAFAEL-database-backend.md`
- NO encryption keys stored in database
- All user identifiers hashed (SHA-256)

---

### Ticket 01-08: Fastify API Server Foundation
**Agent**: Jordan Kim
**Status**: ⚪ Not Started
**Story Points**: 8
**Dependencies**: 01-07 (Prisma schema)
**Priority**: P0 (Critical Path)

**Description**:
Set up Fastify server with middleware stack (auth, rate limiting, validation, CORS).

**Acceptance Criteria**:
- [ ] Fastify v4 with TypeScript
- [ ] Environment config with Zod validation
- [ ] JWT authentication middleware
- [ ] Rate limiting (100 req/15min per IP)
- [ ] Request validation (Zod schemas)
- [ ] CORS configured for web client
- [ ] Structured logging (Pino)
- [ ] Health check endpoint (`/health`)

**Deliverables**:
- `packages/server/src/index.ts`
- `packages/server/src/middleware/` (auth, rate-limit, etc.)
- `packages/server/src/config/` (environment validation)
- OpenAPI schema

**Notes**:
- Reference: `.SoT/sprints/sprint-01/research/JORDAN-fullstack-architecture.md`
- Railway-optimized (use Railway environment variables)
- TLS 1.3 enforced

---

### Ticket 01-09: Authentication Routes (/auth)
**Agent**: Jordan Kim
**Status**: ⚪ Not Started
**Story Points**: 5
**Dependencies**: 01-08 (Fastify foundation)
**Priority**: P0 (Critical Path)

**Description**:
Implement device registration and authentication endpoints.

**Acceptance Criteria**:
- [ ] `POST /auth/register` - Device registration with RSA certificate
- [ ] `POST /auth/login` - Challenge-response authentication
- [ ] `POST /auth/refresh` - JWT token refresh
- [ ] `POST /auth/logout` - Token invalidation
- [ ] Integration tests for auth flow

**Deliverables**:
- `packages/server/src/routes/auth.ts`
- `packages/server/__tests__/auth.test.ts`
- Postman collection for auth endpoints

**Notes**:
- Device certificates signed with RSA private key (client-side)
- Server verifies signature with public key
- JWTs valid for 24 hours, refresh tokens for 30 days

---

### Ticket 01-10: Backup CRUD Routes (/backups)
**Agent**: Rafael Santos
**Status**: ⚪ Not Started
**Story Points**: 8
**Dependencies**: 01-08 (Fastify foundation), 01-07 (Prisma schema)
**Priority**: P0 (Critical Path)

**Description**:
Implement backup creation, retrieval, listing, and deletion endpoints.

**Acceptance Criteria**:
- [ ] `POST /backups` - Upload encrypted backup blob
- [ ] `GET /backups/:id` - Download encrypted backup blob
- [ ] `GET /backups` - List user's backups (paginated)
- [ ] `DELETE /backups/:id` - Delete backup
- [ ] Quota enforcement (storage limits)
- [ ] Integration tests with Prisma

**Deliverables**:
- `packages/server/src/routes/backups.ts`
- `packages/server/src/repositories/backup-repository.ts`
- `packages/server/__tests__/backups.test.ts`
- API documentation

**Notes**:
- Server stores opaque ciphertext (BYTEA)
- Server NEVER decrypts (zero-knowledge guarantee)
- Pagination via cursor-based approach (keyset pagination)

---

### Ticket 01-11: Railway Staging Deployment
**Agent**: Zhang Wei
**Status**: ⚪ Not Started
**Story Points**: 5
**Dependencies**: 01-10 (Backup routes)
**Priority**: P0 (Critical Path)

**Description**:
Deploy API server to Railway staging environment with managed PostgreSQL + Redis.

**Acceptance Criteria**:
- [ ] Railway project created (staging environment)
- [ ] PostgreSQL database provisioned
- [ ] Redis instance provisioned
- [ ] Environment variables configured
- [ ] Health checks passing
- [ ] Database migrations applied
- [ ] API accessible at staging URL

**Deliverables**:
- `railway.toml` configuration
- Railway deployment guide
- Staging environment URL

**Notes**:
- Use Railway CLI for deployment: `railway up`
- Private networking between services
- TLS 1.3 enforced for external traffic

---

## Week 3: Frontend & E2E Integration (Days 11-15)

### Ticket 01-12: @zkeb/client Browser Library
**Agent**: Jordan Kim
**Status**: ⚪ Not Started
**Story Points**: 8
**Dependencies**: 01-06 (@zkeb/crypto package)
**Priority**: P0 (Critical Path)

**Description**:
Create browser-based TypeScript client library for encryption and API communication.

**Acceptance Criteria**:
- [ ] `ZKEBClient` class (high-level API)
- [ ] `KeyStore` class (IndexedDB persistence)
- [ ] API wrapper (fetch with auth headers)
- [ ] Type-safe request/response interfaces
- [ ] Zero plaintext sent to server (enforced at type level)

**Deliverables**:
- `packages/client/src/index.ts`
- `packages/client/__tests__/client.test.ts`
- Browser compatibility testing

**Notes**:
- Reference: `.SoT/sprints/sprint-01/research/JORDAN-fullstack-architecture.md`
- Use idb library for IndexedDB
- Keys stored client-side only (NEVER transmitted)

---

### Ticket 01-13: Next.js Authentication Flow
**Agent**: Jordan Kim
**Status**: ⚪ Not Started
**Story Points**: 5
**Dependencies**: 01-12 (@zkeb/client), 01-09 (Auth routes)
**Priority**: P0 (Critical Path)

**Description**:
Build Next.js authentication pages with key setup wizard.

**Acceptance Criteria**:
- [ ] `/auth/setup` - Key generation wizard (UMK creation)
- [ ] `/auth/login` - Device authentication
- [ ] `/auth/recover` - Account recovery flow
- [ ] Key backup reminder (Shamir secret sharing)
- [ ] Biometric prompt integration (if available)

**Deliverables**:
- `apps/security/web/app/auth/` pages
- `apps/security/web/hooks/useAuth.ts`
- `apps/security/web/components/KeySetupWizard.tsx`

**Notes**:
- shadcn/ui components for consistent design
- Progressive Web App (PWA) service worker
- Code integrity verification (Subresource Integrity)

---

### Ticket 01-14: Backup Creation & Restoration UI
**Agent**: Jordan Kim
**Status**: ⚪ Not Started
**Story Points**: 8
**Dependencies**: 01-13 (Auth flow), 01-12 (@zkeb/client)
**Priority**: P0 (Critical Path)

**Description**:
Build UI for creating and restoring encrypted backups.

**Acceptance Criteria**:
- [ ] `/dashboard` - Backup overview (list of backups)
- [ ] `/backups/new` - Create new backup (client-side encryption)
- [ ] `/backups/:id` - Backup details + restore button
- [ ] Drag-and-drop file encryption
- [ ] Data classification selector (Internal, Confidential, Restricted)
- [ ] Progress indicators for encryption/upload

**Deliverables**:
- `apps/security/web/app/backups/` pages
- `apps/security/web/components/BackupForm.tsx`
- `apps/security/web/hooks/useBackups.ts`

**Notes**:
- All encryption happens client-side (browser)
- Show encryption status visually (locked icon)
- Support large files (chunked upload if >10MB)

---

### Ticket 01-15: Multi-Device E2E Testing
**Agent**: Quincy + Jordan Kim
**Status**: ⚪ Not Started
**Story Points**: 8
**Dependencies**: 01-14 (Backup UI)
**Priority**: P1 (Important)

**Description**:
Implement end-to-end tests for multi-device sync scenario using Playwright.

**Acceptance Criteria**:
- [ ] Device A creates backup
- [ ] Device B restores backup
- [ ] Data matches exactly (round-trip verified)
- [ ] Concurrent access from multiple devices
- [ ] Network failure handling (retry logic)

**Deliverables**:
- `apps/security/web/__tests__/e2e/multi-device.spec.ts`
- Test fixtures and helpers
- CI integration (GitHub Actions)

**Notes**:
- Use Playwright for browser automation
- Simulate multiple browser contexts (different devices)
- Test on Chrome, Firefox, Safari

---

## Week 4: Production Readiness (Days 16-20)

### Ticket 01-16: CI/CD Pipeline (GitHub Actions)
**Agent**: Zhang Wei
**Status**: ⚪ Not Started
**Story Points**: 8
**Dependencies**: 01-15 (E2E tests)
**Priority**: P0 (Critical Path)

**Description**:
Set up GitHub Actions workflow for automated testing and Railway deployment.

**Acceptance Criteria**:
- [ ] TypeScript build + lint on every PR
- [ ] Unit tests (Jest) on every PR
- [ ] Integration tests (API endpoints)
- [ ] E2E tests (Playwright)
- [ ] Security scans (Snyk, npm audit, OWASP)
- [ ] Deploy to Railway on merge to `main`
- [ ] Database migrations automated

**Deliverables**:
- `.github/workflows/ci.yml` (CI pipeline)
- `.github/workflows/deploy.yml` (CD pipeline)
- Deployment documentation

**Notes**:
- Reference: `.SoT/sprints/sprint-01/research/ZHANG-devops-railway.md`
- Parallel test execution (3 shards)
- Railway CLI in GitHub Actions

---

### Ticket 01-17: Adversarial Server Tests (Zero-Knowledge Proof)
**Agent**: Quincy
**Status**: ⚪ Not Started
**Story Points**: 13
**Dependencies**: 01-11 (Railway staging)
**Priority**: P0 (Critical Path - MUST PASS)

**Description**:
Implement tests that PROVE the server cannot decrypt user data, even with full infrastructure access.

**Acceptance Criteria**:
- [ ] `AdversarialServer` test framework
- [ ] Attempt decryption with full database access (MUST FAIL)
- [ ] Attempt decryption from memory dumps (MUST FAIL)
- [ ] Simulate legal compulsion (yields only ciphertext)
- [ ] Rollback attack prevention verified
- [ ] Database schema verification (no keys stored)

**Deliverables**:
- `packages/server/__tests__/adversarial/zero-knowledge.test.ts`
- Test report proving zero-knowledge guarantee
- Documentation for auditors

**Notes**:
- **CRITICAL**: If these tests PASS (server decrypts), ZKEB is broken
- These tests should FAIL to decrypt (proving zero-knowledge)
- Reference: `.SoT/sprints/sprint-01/research/QUINCY-testing-strategy.md`

---

### Ticket 01-18: OWASP Top 10 Security Scanning
**Agent**: Quincy
**Status**: ⚪ Not Started
**Story Points**: 5
**Dependencies**: 01-16 (CI/CD pipeline)
**Priority**: P1 (Important)

**Description**:
Run automated security scans for common web vulnerabilities.

**Acceptance Criteria**:
- [ ] SQL injection testing (parametrized queries verified)
- [ ] XSS prevention (CSP headers verified)
- [ ] CSRF protection (tokens verified)
- [ ] Authentication bypass attempts (MUST FAIL)
- [ ] Rate limiting bypass attempts (MUST FAIL)
- [ ] Dependency vulnerability scan (Snyk)

**Deliverables**:
- Security scan results (no high/critical vulnerabilities)
- OWASP ZAP report
- Remediation documentation

**Notes**:
- Integrate with CI/CD (block merge on critical vulns)
- Use OWASP ZAP or Burp Suite
- Document false positives

---

### Ticket 01-19: Performance Benchmarks & Load Testing
**Agent**: Quincy + Zhang Wei
**Status**: ⚪ Not Started
**Story Points**: 8
**Dependencies**: 01-11 (Railway staging)
**Priority**: P1 (Important)

**Description**:
Run performance benchmarks and load tests to validate targets from SPRINT-01.md.

**Acceptance Criteria**:
- [ ] Encryption benchmarks: <5ms (1KB data)
- [ ] API latency: <100ms P95
- [ ] Database queries: <50ms (1M+ backups)
- [ ] Load test: 1000 concurrent users
- [ ] Memory profiling (no leaks)
- [ ] CPU profiling (identify hot paths)

**Deliverables**:
- `BENCHMARKS.md` (results documentation)
- Artillery load test configuration
- Performance optimization recommendations

**Notes**:
- Use Artillery for load testing
- Profile with Node.js inspector
- Compare against targets in SPRINT-01.md

---

### Ticket 01-20: Security Audit Preparation
**Agent**: QUANTUM + Quincy
**Status**: ⚪ Not Started
**Story Points**: 8
**Dependencies**: 01-17 (Zero-knowledge tests), 01-18 (OWASP scans)
**Priority**: P1 (Important)

**Description**:
Prepare documentation package for independent security audit.

**Acceptance Criteria**:
- [ ] Security whitepaper (cryptographic design)
- [ ] Threat model documentation
- [ ] Zero-knowledge guarantee proofs
- [ ] Test coverage reports
- [ ] Attack surface analysis
- [ ] Compliance mapping (SOC 2, HIPAA)

**Deliverables**:
- `.SoT/security/SECURITY-WHITEPAPER.md`
- `.SoT/security/THREAT-MODEL.md`
- `.SoT/security/AUDIT-PREPARATION.md`
- Contact list for auditors (Cure53, Trail of Bits, NCC Group)

**Notes**:
- Reference existing docs in `.SoT/security/`
- Budget: $15k-30k for external audit
- Timeline: 2-4 weeks after sprint completion

---

### Ticket 01-21: Production Railway Deployment
**Agent**: Zhang Wei
**Status**: ⚪ Not Started
**Story Points**: 5
**Dependencies**: 01-17 (Zero-knowledge proof), 01-19 (Performance)
**Priority**: P0 (Critical Path)

**Description**:
Deploy to Railway production environment with monitoring and auto-scaling.

**Acceptance Criteria**:
- [ ] Production environment created
- [ ] PostgreSQL database (production-tier)
- [ ] Redis instance (production-tier)
- [ ] Environment variables configured
- [ ] Health checks + auto-scaling
- [ ] Monitoring (Datadog/CloudWatch)
- [ ] Alerting (PagerDuty/Slack)
- [ ] Backup strategy (database snapshots)

**Deliverables**:
- Production deployment runbook
- Monitoring dashboard
- Incident response procedures

**Notes**:
- Blue-green deployment strategy
- <30 second rollback capability
- Private networking for services

---

### Ticket 01-22: API Documentation & Developer Portal
**Agent**: Jordan Kim
**Status**: ⚪ Not Started
**Story Points**: 5
**Dependencies**: 01-10 (Backup routes)
**Priority**: P2 (Nice to Have)

**Description**:
Create comprehensive API documentation with interactive examples.

**Acceptance Criteria**:
- [ ] OpenAPI 3.0 specification
- [ ] Swagger UI hosted at `/docs`
- [ ] Code examples (TypeScript, cURL)
- [ ] Authentication guide
- [ ] Error code reference
- [ ] Rate limiting documentation

**Deliverables**:
- `packages/server/swagger.yml`
- API documentation portal
- Postman collection (importable)

**Notes**:
- Use Scalar or Swagger UI for interactive docs
- Include zero-knowledge architecture explanation
- Link to security whitepaper

---

### Ticket 01-23: User Documentation & Guides
**Agent**: Jordan Kim
**Status**: ⚪ Not Started
**Story Points**: 3
**Dependencies**: 01-14 (Backup UI)
**Priority**: P2 (Nice to Have)

**Description**:
Write user-facing documentation for ZKEB web application.

**Acceptance Criteria**:
- [ ] Quick start guide (5 minutes to first backup)
- [ ] Key management best practices
- [ ] Multi-device setup guide
- [ ] Account recovery guide
- [ ] FAQ (common questions)
- [ ] Troubleshooting guide

**Deliverables**:
- `apps/security/web/docs/` folder
- In-app help tooltips
- Video tutorial scripts (optional)

**Notes**:
- Non-technical language (user-friendly)
- Screenshots and diagrams
- Emphasize security benefits

---

### Ticket 01-24: Sprint Retrospective & Handoff
**Agent**: Dylan Torres (TPM)
**Status**: ⚪ Not Started
**Story Points**: 3
**Dependencies**: All tickets 01-01 through 01-23
**Priority**: P0 (Critical Path)

**Description**:
Conduct sprint retrospective and prepare handoff for Sprint 02.

**Acceptance Criteria**:
- [ ] Retrospective meeting completed (2 hours)
- [ ] Velocity metrics calculated
- [ ] Sprint 02 planning initiated
- [ ] Blockers documented
- [ ] Lessons learned captured
- [ ] Team feedback collected

**Deliverables**:
- `.SoT/sprints/sprint-01/RETROSPECTIVE.md`
- Sprint velocity report
- Sprint 02 backlog

**Notes**:
- What went well?
- What could be improved?
- Action items for next sprint

---

## Summary Statistics

**Total Tickets**: 24
**Total Story Points**: 89
**Average Points per Ticket**: 3.7

### By Week:
- **Week 1**: 6 tickets, 34 points (Crypto)
- **Week 2**: 5 tickets, 34 points (Backend)
- **Week 3**: 4 tickets, 29 points (Frontend)
- **Week 4**: 9 tickets, 58 points (Production)

### By Agent:
- **QUANTUM**: 6 tickets, 34 points
- **Jordan Kim**: 7 tickets, 39 points
- **Rafael Santos**: 2 tickets, 16 points
- **Zhang Wei**: 4 tickets, 21 points
- **Quincy**: 4 tickets, 34 points
- **Dylan Torres**: 1 ticket, 3 points

### By Priority:
- **P0 (Critical)**: 15 tickets
- **P1 (Important)**: 7 tickets
- **P2 (Nice to Have)**: 2 tickets

---

## Critical Path

The following tickets MUST be completed in order (cannot parallelize):

```
01-01 (HKDF) → 01-03 (Key Hierarchy) → 01-06 (Crypto Package)
                                        ↓
01-07 (Prisma Schema) → 01-08 (Fastify) → 01-10 (Backup Routes)
                                        ↓
                        01-11 (Railway Staging) → 01-17 (Zero-Knowledge Tests)
                                                    ↓
                                    01-21 (Production Deployment)
```

**Critical Path Duration**: ~14 days (70% of sprint)

---

## Daily Standup Format

**Time**: 9:00 AM (15 minutes)

**Questions**:
1. What ticket(s) did you complete yesterday?
2. What ticket(s) are you working on today?
3. Any blockers or dependencies?

**Updates**: Post in `#zkeb-dev` Slack channel

---

## Ticket Lifecycle

1. **⚪ Not Started** → Agent assigned, awaiting work
2. **🟡 In Progress** → Agent actively working
3. **🔵 In Review** → Pull request submitted, awaiting code review
4. **🟢 Complete** → Merged, deployed, acceptance criteria verified

**Blocked Tickets**: Escalate to Dylan Torres immediately

---

_Last Updated: Sprint 01 Planning_
_Next Update: Daily standup (in-progress tickets)_
