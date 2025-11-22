# .SoT - Source of Truth

**Owner**: Dylan Torres (TPM)
**Purpose**: Centralized source of truth for platform specs, status, and decisions
**Last Updated**: 2025-11-22

---

## Directory Structure

```
.SoT/
├── README.md                   (this file)
├── platform-specs/             Platform infrastructure specifications
│   └── REDIS_INFRASTRUCTURE.md
├── status-reports/             Current project status
│   ├── MIGRATION_STATUS.md
│   └── SPRINT_1_STATUS.md
├── security/                   Security and compliance documentation
│   ├── RAILWAY_CONDUIT_CLASSIFICATION.md
│   ├── CUSTOMER_BAA_TEMPLATE.md
│   ├── INDEPENDENT_AUDIT_PREPARATION.md
│   └── HIPAA_COMPLIANCE_EXECUTIVE_SUMMARY.md
├── api-specs/                  API contracts and schemas (future)
├── infrastructure/             Infrastructure diagrams and specs (future)
├── migrations/                 Migration planning and history (future)
└── team-docs/                  Team protocols and workflows (future)
```

---

## How to Use

### For Agents

When you have questions about:
- **Migration status** → Read `.SoT/status-reports/MIGRATION_STATUS.md`
- **Infrastructure** → Read `.SoT/platform-specs/REDIS_INFRASTRUCTURE.md`
- **Sprint progress** → Read `.SoT/status-reports/SPRINT_1_STATUS.md`
- **HIPAA compliance** → Read `.SoT/security/HIPAA_COMPLIANCE_EXECUTIVE_SUMMARY.md`
- **Railway conduit status** → Read `.SoT/security/RAILWAY_CONDUIT_CLASSIFICATION.md`
- **Customer BAA** → Read `.SoT/security/CUSTOMER_BAA_TEMPLATE.md`
- **Security audits** → Read `.SoT/security/INDEPENDENT_AUDIT_PREPARATION.md`

**Rule**: Check .SoT FIRST before asking Dylan

### For Dylan (TPM)

**Responsibilities**:
1. Keep all .SoT files updated
2. Answer agent questions by updating .SoT docs
3. Create new specs as needed
4. Weekly audit of all .SoT files for accuracy

**Update Triggers**:
- Sprint status changes → Update `SPRINT_X_STATUS.md`
- Migration applied → Update `MIGRATION_STATUS.md`
- Infrastructure changes → Update relevant spec file
- Security/compliance changes → Update `.SoT/security/` docs
- New questions from multiple agents → Create new doc

---

## Current Files

### `/security/` (Security & Compliance)

Security and compliance documentation for HIPAA-compliant zero-knowledge encrypted backup platform.

#### `RAILWAY_CONDUIT_CLASSIFICATION.md`

**Purpose**: Legal and technical proof that Railway.app is a HIPAA conduit (not Business Associate)
**Contains**:
- Legal framework (45 CFR §160.103 conduit exception)
- Technical proof of zero-knowledge encryption
- Comparative analysis (AWS S3, Cloudflare precedents)
- Threat model and breach scenarios
- Audit evidence requirements
- OCR guidance and compliance analysis

**Last Updated**: 2025-01-22

**Key Facts**:
- ✅ Railway qualifies as conduit (no BAA required)
- ✅ Zero-knowledge architecture prevents Railway from accessing ePHI
- ✅ Infrastructure breach does NOT equal HIPAA breach
- ✅ Independent audit attestation template included

#### `CUSTOMER_BAA_TEMPLATE.md`

**Purpose**: Comprehensive Business Associate Agreement template for customers
**Contains**:
- Main BAA contract (Articles 1-10)
- Technical Safeguards Appendix (ZKEB architecture details)
- Breach Notification Procedures Appendix
- Subcontractor Provisions Appendix (Railway as conduit)
- Audit Rights and Compliance Appendix

**Last Updated**: 2025-01-22

**⚠️ CRITICAL**: Requires legal counsel review before use

**Key Facts**:
- ✅ We sign BAAs directly with customers (we are the Business Associate)
- ✅ Railway designated as conduit (no sub-BAA required)
- ✅ Zero-knowledge architecture documented in Appendix A
- ✅ 30-day breach notification timeline
- ✅ Annual audit rights for customers

#### `INDEPENDENT_AUDIT_PREPARATION.md`

**Purpose**: Checklist for SOC 2 Type II and HIPAA compliance audits
**Contains**:
- Pre-audit documentation requirements
- Technical evidence collection procedures
- SOC 2 Trust Service Criteria mapping
- HIPAA Security Rule compliance evidence
- Zero-knowledge architecture proof procedures
- Railway conduit classification evidence
- Audit day logistics and preparation

**Last Updated**: 2025-01-22

**Key Facts**:
- 📋 Comprehensive audit checklist (all evidence documented)
- 🔍 Cryptographic testing procedures
- 💰 Cost estimates: $60k-120k (SOC 2 + HIPAA + pentest)
- ⏱️ Timeline: 4-6 weeks prep, 1 week audit, 4-8 weeks remediation

#### `HIPAA_COMPLIANCE_EXECUTIVE_SUMMARY.md`

**Purpose**: Executive briefing on HIPAA compliance strategy
**Contains**:
- Document package overview
- Technical architecture highlights
- Legal and compliance strategy
- Risk assessment and mitigation
- Competitive advantages (zero-knowledge vs. traditional)
- Cost-benefit analysis
- Roadmap and next steps
- Decision points for leadership

**Last Updated**: 2025-01-22

**Key Facts**:
- 🎯 Railway is conduit (no BAA required)
- 🔒 Zero-knowledge encryption provides superior security
- 📈 ROI: Sign 2-3 healthcare customers = breakeven
- 🛣️ Roadmap: 6-12 months to SOC 2 + HIPAA certification
- 💵 First year cost: $75k-145k (certification + audits)

---

### `/status-reports/MIGRATION_STATUS.md`

**Purpose**: Definitive migration timeline and status
**Contains**:
- Which migrations are applied
- Which migrations are pending
- Migration blockers and dependencies
- Current database schema state
- Security architecture evolution

**Last Updated**: 2025-11-22

**Key Facts**:
- ✅ Migrations 001-006 applied
- ❌ Migration 007 NOT applied (blocked on session context)
- ❌ Migration 008 NOT applied (draft exists, needs review)

---

### `/status-reports/SPRINT_1_STATUS.md`

**Purpose**: Current sprint progress tracking
**Contains**:
- Workstream status
- Team assignments
- Blockers and resolutions
- Coordination matrix
- Risks and mitigations

**Last Updated**: 2025-11-22

**Key Facts**:
- Sprint 1 goal: Build Migration 007 prerequisites
- WS2-T5 complete (E2E testing)
- WS1, WS2, WS3, WS4 ready to start
- All agent questions resolved

---

### `/platform-specs/REDIS_INFRASTRUCTURE.md`

**Purpose**: Redis session caching specification
**Contains**:
- Connection details
- Architecture patterns
- Configuration
- Performance metrics
- Usage examples

**Last Updated**: 2025-11-22

**Key Facts**:
- ✅ Redis fully operational
- 19/19 tests passing
- Cache-aside pattern with Postgres fallback
- 3-5ms session validation (cache hit)

---

## Document Standards

### Status Reports

**Naming**: `<TOPIC>_STATUS.md`
**Format**:
- **Last Updated**: Date
- **Owner**: Role/Name
- Clear sections with ### headings
- Use ✅ ❌ 🟡 🟢 ⚠️ emojis for status
- Include "Next Actions" section

### Platform Specs

**Naming**: `<COMPONENT>_INFRASTRUCTURE.md` or `<COMPONENT>_SPEC.md`
**Format**:
- **Status**: Operational/In Progress/Planned
- **Owner**: Team/Person
- Architecture diagrams (mermaid or ASCII)
- Configuration examples
- Usage code snippets
- Reference links

### Update Log

When updating a .SoT file:
1. Change "Last Updated" date
2. Document what changed (if major)
3. Notify affected agents (if needed)

---

## Maintenance

**Daily** (Dylan):
- Update `SPRINT_X_STATUS.md` with progress

**Weekly** (Dylan):
- Audit all .SoT files for accuracy
- Archive old sprint reports
- Create new specs as needed

**Monthly** (Dylan):
- Review .SoT structure
- Reorganize if needed
- Create index/search if growing large

---

## Questions?

**For agents**: Check .SoT first, then ask Dylan
**For Dylan**: You own this - keep it accurate and useful
