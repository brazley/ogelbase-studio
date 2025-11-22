# Sprint 01: ZKEB Foundation - Military-Grade Cloud Encryption

**Sprint Duration**: 4 weeks (20 working days)
**Sprint Goal**: Deploy production-ready zero-knowledge encrypted backup system to Railway
**Team Size**: 5 specialist agents + Dylan Torres (TPM)

---

## 🎯 Sprint Objectives

### Primary Goal
Build the foundational infrastructure for ZKEB (Zero-Knowledge Encrypted Backup) that proves:
1. **Zero-knowledge guarantee**: Server mathematically cannot decrypt user data
2. **Production-ready**: Deployable to Railway with monitoring and CI/CD
3. **Cryptographically sound**: Equivalent security to iOS implementation
4. **Compliance-ready**: Audit trail for SOC 2 + HIPAA certification

### Success Criteria
- [ ] Client can encrypt data, server stores opaque ciphertext
- [ ] Adversarial server tests FAIL to decrypt (zero-knowledge proof)
- [ ] Railway deployment with <2 minute deploy time
- [ ] All NIST/RFC test vectors pass
- [ ] <100ms API latency (P95)
- [ ] Independent security audit preparation complete

---

## 📦 Deliverables

### Week 1: Core Cryptography
**Owner**: QUANTUM + Jordan Kim

1. **@zkeb/crypto package** (TypeScript)
   - AES-256-GCM encryption/decryption
   - HKDF key derivation (100-line custom implementation)
   - PBKDF2 password-based keys
   - RSA-4096 signatures
   - Key hierarchy (UMK → DMK → BEK/MEK)

2. **Test suite** (100% coverage for crypto primitives)
   - NIST SP 800-38D test vectors (AES-GCM)
   - RFC 5869 test vectors (HKDF)
   - Round-trip encryption tests
   - Timing attack resistance verification

**Deliverables**:
- `packages/crypto/` with full implementation
- `packages/crypto/__tests__/` with NIST/RFC vectors
- Documentation: API reference + security proofs

---

### Week 2: API Server & Database
**Owner**: Rafael Santos + Jordan Kim

1. **Fastify API server** (Node.js 20)
   - `/auth` routes (device registration, login)
   - `/backups` routes (CRUD for encrypted blobs)
   - JWT authentication + refresh tokens
   - Rate limiting (100 req/15min)
   - Input validation (Zod schemas)

2. **PostgreSQL schema** (Prisma ORM)
   - `zkeb.users` - Hashed accounts
   - `zkeb.encrypted_backups` - Ciphertext storage
   - `zkeb.devices` - Public keys only
   - `zkeb.audit_logs` - Zero-knowledge audit trail
   - RLS policies for multi-tenant isolation

3. **Backend data layer**
   - Repository pattern (BackupRepository, DeviceRepository)
   - Transaction management
   - Cursor-based pagination
   - Query optimization (1M+ backups per user)

**Deliverables**:
- `packages/server/` with Fastify app
- `prisma/schema.prisma` + migrations
- OpenAPI/Swagger documentation
- Postman collection for API testing

---

### Week 3: Web Client & E2E Integration
**Owner**: Jordan Kim + QUANTUM

1. **@zkeb/client library** (Browser TypeScript)
   - WebCrypto wrapper (AES-GCM, HKDF)
   - IndexedDB key storage (idb library)
   - ZKEBClient high-level API
   - Type-safe server API wrapper

2. **Next.js 14 web app** (App Router)
   - `/auth` - Key setup wizard
   - `/dashboard` - Backup overview
   - `/backups` - Create/restore UI
   - Client-side encryption (zero plaintext to server)
   - PWA service worker for code integrity

3. **E2E integration**
   - New user flow (key generation → first backup)
   - Multi-device sync (backup on device A, restore on device B)
   - Account recovery (Shamir secret sharing)

**Deliverables**:
- `packages/client/` browser library
- `apps/security/web/` Next.js app
- E2E test suite (Playwright)
- User documentation

---

### Week 4: DevOps, Testing & Security Audit Prep
**Owner**: Zhang Wei + Quincy + ALL

1. **Railway deployment** (Production-ready)
   - GitHub Actions CI/CD
   - Blue-green deployments
   - Database migrations (zero-downtime)
   - Health checks + auto-scaling
   - Monitoring (Datadog/CloudWatch)

2. **Security verification** (Zero-knowledge proof)
   - Adversarial server tests (prove server can't decrypt)
   - OWASP Top 10 scanning
   - Penetration testing prep
   - Compliance documentation (SOC 2/HIPAA)

3. **Performance benchmarks**
   - Encryption: <5ms (1KB data)
   - API latency: <100ms (P95)
   - Database queries: <50ms (1M+ backups)
   - Load testing: 1000 concurrent users

4. **Documentation package**
   - Architecture decision records (ADRs)
   - Security whitepaper
   - Deployment runbook
   - Incident response procedures

**Deliverables**:
- Production Railway deployment
- Security audit report
- Performance benchmark results
- Complete documentation suite

---

## 🏗️ Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    ZKEB System Architecture                  │
├─────────────────────────────────────────────────────────────┤
│  Browser (Next.js)                                          │
│  ├── @zkeb/client (WebCrypto encryption)                   │
│  ├── IndexedDB (key storage, client-side only)             │
│  └── API wrapper (fetch encrypted data)                     │
├─────────────────────────────────────────────────────────────┤
│  Railway Services                                            │
│  ├── Fastify API (Node.js 20)                              │
│  ├── PostgreSQL 16 (opaque ciphertext storage)             │
│  ├── Redis 7 (session management)                          │
│  └── Private Networking (TLS 1.3)                          │
├─────────────────────────────────────────────────────────────┤
│  CI/CD Pipeline (GitHub Actions)                            │
│  ├── TypeScript build + lint                               │
│  ├── Unit tests (crypto primitives)                        │
│  ├── Integration tests (API endpoints)                     │
│  ├── Security scans (OWASP, Snyk)                          │
│  └── Deploy to Railway (<2 min)                            │
└─────────────────────────────────────────────────────────────┘
```

### Zero-Knowledge Guarantee

**Client-Side Only**:
- User Master Key (UMK) - Generated client-side, NEVER transmitted
- Device Master Key (DMK) - Derived from UMK via HKDF
- Backup Encryption Key (BEK) - Derived from DMK via HKDF
- Metadata Encryption Key (MEK) - Derived from DMK via HKDF

**Server-Side (Opaque)**:
- Encrypted ciphertext (BYTEA) - AES-256-GCM output
- Authentication tags (BYTEA) - GCM auth tags
- Nonces (BYTEA) - Public, not secret
- Device public keys (BYTEA) - For signature verification only

**Mathematical Proof**: Server has no decryption keys → computationally infeasible to recover plaintext

---

## 📊 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Crypto** | WebCrypto API | Native browser support, no dependencies |
| **Backend** | Fastify + Node.js 20 | 5x faster than Express, TypeScript native |
| **Database** | PostgreSQL 16 + Prisma | Zero-knowledge schema, type-safe ORM |
| **Frontend** | Next.js 14 App Router | Server components, React Server Actions |
| **Storage** | IndexedDB (idb) | Client-side key persistence |
| **Deployment** | Railway | Managed PostgreSQL/Redis, auto-scaling |
| **CI/CD** | GitHub Actions | Railway CLI integration |
| **Monitoring** | Pino + Datadog | Structured logs, real-time metrics |
| **Testing** | Jest + Playwright | Unit + E2E coverage |

---

## 🔒 Security Requirements

### Zero-Knowledge Enforcement

1. **Compile-time checks**: TypeScript branded types prevent plaintext from reaching server
   ```typescript
   type PlaintextData = string & { __brand: 'plaintext' };
   type CiphertextData = string & { __brand: 'ciphertext' };

   // ❌ Type error - won't compile
   uploadToServer(plaintext);
   ```

2. **Runtime verification**: Adversarial server tests actively try to decrypt
   ```typescript
   test('server cannot decrypt backup', async () => {
     const maliciousServer = new AdversarialServer(dbAccess);
     const decrypted = await maliciousServer.attemptDecryption(backup);
     expect(decrypted).toBeNull(); // MUST fail to decrypt
   });
   ```

3. **Database constraints**: Schema enforces NO encryption keys
   ```sql
   -- ✅ Allowed: Opaque ciphertext
   ciphertext BYTEA NOT NULL

   -- ❌ FORBIDDEN: Would violate zero-knowledge
   -- encryption_key TEXT -- NEVER store this!
   ```

### Compliance Controls

**SOC 2 Type II**:
- CC6.1: Access controls (JWT + device certificates)
- CC6.6: Encryption (AES-256-GCM at rest, TLS 1.3 in transit)
- CC6.7: Audit logging (zero-knowledge, hashed identifiers)
- CC7.2: Monitoring (anomaly detection)

**HIPAA Technical Safeguards**:
- §164.312(a): Access control (MFA, automatic logoff)
- §164.312(b): Audit controls (6-year retention)
- §164.312(c): Integrity (GCM auth tags)
- §164.312(d): Transmission security (TLS 1.3)
- §164.312(e): Encryption (AES-256-GCM)

---

## 📈 Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Encryption (1KB) | <5ms | Client-side WebCrypto |
| API latency (P95) | <100ms | Server-side processing |
| Database query | <50ms | PostgreSQL with indexes |
| Page load (FCP) | <2s | Next.js bundle optimization |
| Key generation | <50ms | PBKDF2 600k iterations |
| Backup upload (1MB) | <3s | Encryption + network transfer |

### Performance Benchmarks (Required)

Before sprint completion, run benchmarks and document results:

```bash
# Crypto benchmarks
npm run bench:crypto

# API load testing
artillery run load-test.yml

# Database performance
npm run bench:database
```

**Acceptance**: All benchmarks must meet or exceed targets.

---

## 🧪 Testing Strategy

### Inverted Test Pyramid

```
E2E User Flows (10%)        ← UX validation
API Integration (15%)       ← Endpoint validation
Zero-Knowledge (35%)        ← Security proofs
Crypto Primitives (40%)     ← Mathematical correctness
```

**Rationale**: ZKEB's value proposition IS its zero-knowledge guarantee. Security tests form the foundation.

### Test Categories

**1. Crypto Primitives (40% of effort)**
- NIST SP 800-38D test vectors (AES-GCM)
- RFC 5869 test vectors (HKDF)
- Round-trip encryption/decryption
- Nonce uniqueness verification
- Timing attack resistance

**2. Zero-Knowledge Verification (35%)**
- Adversarial server cannot decrypt backups
- Database dumps contain no key material
- Memory dumps contain no user keys
- Legal compulsion yields only ciphertext
- Rollback attack prevention

**3. API Integration (15%)**
- Device registration flow
- Backup CRUD operations
- Authentication (JWT lifecycle)
- Rate limiting enforcement
- Error handling (network failures)

**4. E2E User Flows (10%)**
- New user onboarding
- First backup creation
- Multi-device restore
- Account recovery

### Critical Tests (MUST PASS)

```typescript
// ❌ If this test passes, ZKEB is broken
test('CRITICAL: server CANNOT decrypt user data', async () => {
  const server = new AdversarialServer({ hasFullAccess: true });
  const plaintext = await server.decrypt(encryptedBackup);
  expect(plaintext).toBeNull(); // Server MUST fail
});

// ✅ If this test fails, ZKEB is broken
test('CRITICAL: client CAN decrypt user data', async () => {
  const client = new ZKEBClient({ userMasterKey });
  const plaintext = await client.decrypt(encryptedBackup);
  expect(plaintext).toEqual(originalData); // Client MUST succeed
});
```

---

## 🚨 Risk Management

### High-Risk Items

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| HKDF implementation bug | Medium | Critical | NIST test vectors + external review |
| Railway outage | Low | High | Blue-green deployment + rollback |
| Crypto timing attack | Low | Critical | Constant-time implementations |
| Key leak to server | Low | Critical | Type system + adversarial tests |
| Performance degradation | Medium | Medium | Early benchmarking + profiling |

### Mitigation Strategies

**HKDF Implementation**:
- Use established libraries if available (noble-hashes)
- If custom: RFC 5869 test vectors + external cryptographer review
- Fuzzing tests for edge cases

**Railway Reliability**:
- Health checks with automatic failover
- <30 second rollback procedure
- Database backups every 6 hours

**Performance**:
- Benchmark early (Week 1 for crypto, Week 2 for API)
- Set up continuous performance monitoring
- Optimize hot paths (encryption, database queries)

---

## 📅 Sprint Schedule

### Week 1: Crypto Foundation
**Days 1-5** (Mon-Fri)
- Day 1: HKDF implementation + RFC 5869 vectors
- Day 2: AES-GCM wrapper + NIST vectors
- Day 3: Key hierarchy (UMK → DMK → BEK/MEK)
- Day 4: PBKDF2 + integration tests
- Day 5: Documentation + benchmarks

**Daily Standup**: Zero-knowledge verification focus

---

### Week 2: Backend Infrastructure
**Days 6-10** (Mon-Fri)
- Day 6: Prisma schema + RLS policies
- Day 7: Fastify server + auth routes
- Day 8: Backup CRUD routes
- Day 9: Database migrations + Railway deployment
- Day 10: API integration tests

**Daily Standup**: Security-first mindset

---

### Week 3: Frontend & E2E
**Days 11-15** (Mon-Fri)
- Day 11: @zkeb/client library (WebCrypto wrapper)
- Day 12: Next.js auth flow + key setup
- Day 13: Backup UI (create/restore)
- Day 14: Multi-device sync testing
- Day 15: E2E Playwright tests

**Daily Standup**: User experience + security

---

### Week 4: Production Readiness
**Days 16-20** (Mon-Fri)
- Day 16: CI/CD pipeline (GitHub Actions)
- Day 17: Adversarial server tests (zero-knowledge proof)
- Day 18: Performance benchmarks + load testing
- Day 19: Security audit preparation
- Day 20: Documentation + sprint retrospective

**Daily Standup**: Production-ready checklist

---

## 📝 Definition of Done

### Sprint Completion Criteria

- [ ] **All tickets closed** (see TICKETS.md)
- [ ] **Zero-knowledge guarantee verified** (adversarial tests FAIL)
- [ ] **All NIST/RFC test vectors pass**
- [ ] **Production deployment to Railway** (with monitoring)
- [ ] **Performance benchmarks meet targets**
- [ ] **Security audit preparation complete**
- [ ] **Documentation published** (architecture + API reference)
- [ ] **Code review completed** (all PRs merged)
- [ ] **Independent security review requested**

### Acceptance Gates

**Before Week 2**:
- HKDF passes RFC 5869 test vectors
- AES-GCM passes NIST SP 800-38D vectors
- Encryption benchmarks <5ms (1KB)

**Before Week 3**:
- API deployed to Railway staging
- Database schema enforces zero-knowledge
- Integration tests pass (>90% coverage)

**Before Week 4**:
- E2E user flows functional
- Client-side encryption verified
- Multi-device sync working

**Before Sprint Close**:
- Adversarial server tests FAIL (zero-knowledge proof)
- Production deployment successful
- All documentation complete

---

## 🎯 Next Sprint Preview

**Sprint 02: Production Hardening** (Weeks 5-8)
- Advanced error handling + retry logic
- Performance optimization (caching, CDN)
- Security hardening (penetration testing)
- Compliance documentation (SOC 2 evidence)
- User onboarding improvements
- Analytics + monitoring dashboards

---

## 📚 Research Documentation

All agent research saved to `.SoT/sprints/sprint-01/research/`:

- **QUANTUM-crypto-implementation.md** - Cryptographic primitives (40 pages)
- **JORDAN-fullstack-architecture.md** - Full-stack TypeScript design (35 pages)
- **RAFAEL-database-backend.md** - PostgreSQL zero-knowledge schema (51 pages)
- **ZHANG-devops-railway.md** - Railway deployment + CI/CD (28 pages)
- **QUINCY-testing-strategy.md** - Zero-knowledge testing approach (30 pages)

**Total research**: 184 pages of production-ready specifications.

---

## 🤝 Team & Responsibilities

| Agent | Primary Responsibility | Backup |
|-------|----------------------|--------|
| **QUANTUM** | Cryptographic implementation | Security verification |
| **Jordan Kim** | Full-stack development (API + UI) | Client library |
| **Rafael Santos** | Database schema + backend data layer | API development |
| **Zhang Wei** | DevOps + Railway deployment | CI/CD pipeline |
| **Quincy** | Testing strategy + zero-knowledge verification | QA |
| **Dylan Torres** | Sprint coordination + blocker removal | Architecture review |

---

## 📞 Communication

**Daily Standups**: 9:00 AM (15 minutes)
- What did you complete yesterday?
- What are you working on today?
- Any blockers?

**Weekly Reviews**: Friday 4:00 PM (1 hour)
- Demo completed work
- Review metrics (velocity, test coverage, performance)
- Adjust next week's priorities

**Slack Channels**:
- `#zkeb-dev` - Development discussions
- `#zkeb-security` - Security-related questions
- `#zkeb-blockers` - Urgent issues

**Documentation**: All ADRs (Architecture Decision Records) in `.SoT/sprints/sprint-01/decisions/`

---

**Sprint Start Date**: TBD (awaiting approval)
**Sprint End Date**: TBD (4 weeks from start)
**Sprint Retrospective**: Last day of sprint (2 hours)

---

_This sprint plan was synthesized from 184 pages of agent research and represents production-ready specifications for deploying military-grade zero-knowledge encryption to Railway._
