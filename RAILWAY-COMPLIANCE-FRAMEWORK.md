# Railway Cloud Compliance Framework
## SOC 2 Type II & HIPAA Readiness Assessment

**Security Architect**: Zainab Hassan
**Platform**: Railway Cloud Deployment
**Application**: OgelBase (Supabase Studio + iOS Security Module)
**Date**: 2025-11-22
**Classification**: Internal Security Architecture

---

## Executive Summary: The Uncomfortable Truth

### What We're Actually Building

You're deploying a **management UI** (Supabase Studio) on Railway that orchestrates Docker containers. The actual security implementation lives in:
- **External Docker images** (GoTrue, PostgREST, PostgreSQL)
- **iOS Security Module** (ZKEB protocol, AES-256-GCM, RSA-4096)
- **Application-level filtering** (not database-level RLS enforcement yet)

### Can We Achieve SOC 2 Type II or HIPAA Compliance?

**Short Answer**: Not through official certification, but we can achieve **technical equivalence** at the infrastructure layer.

**Long Answer**:
```
SOC 2 Type II = Technology + Process + Audit + Certification
├── Technology: ✅ Can build on Railway
├── Process: ⚠️ Your responsibility
├── Audit: ❌ Requires third-party auditor (~$15k-50k/year)
└── Certification: ❌ Requires report + attestation

HIPAA = SOC 2 + BAA + Healthcare-Specific Controls
├── Technology: ✅ Can build on Railway
├── BAA: ❌ Railway doesn't provide HIPAA BAA
├── Audit: ❌ Requires healthcare-specific assessor
└── Breach Notification: ⚠️ Your responsibility
```

### What This Document Delivers

1. **Technical roadmap** to build SOC 2/HIPAA-equivalent controls
2. **Gap analysis** between current state and compliance requirements
3. **Audit logging strategy** that respects zero-knowledge architecture
4. **Penetration testing approach** for Railway-deployed services
5. **Incident response framework** for cloud-native deployments

**What this document CANNOT do**: Get you certified. That requires auditors, legal BAAs, and money.

---

## Part 1: SOC 2 Type II Compliance Roadmap

### 1.1 Trust Services Criteria Mapping

SOC 2 defines five trust service criteria. Let's map each to our Railway architecture:

#### Security (CC - Common Criteria)

**CC1: Control Environment**
```
What SOC 2 Requires:
- Organizational structure with security responsibilities
- Background checks for personnel with access
- Security policies and procedures documented
- Regular security awareness training

What You Can Build on Railway:
✅ Document security org structure
✅ Create security policies (access control, incident response)
✅ Implement technical controls (MFA, RBAC, audit logging)
❌ CANNOT: Self-certify compliance (need auditor)

Technical Implementation:
1. Railway project access control
   - Enable SSO for team logins
   - Enforce MFA on all accounts
   - Document who has Railway admin access
   - Rotate Railway API tokens quarterly

2. Database access audit trail
   - Enable PostgreSQL query logging
   - Log all admin sessions
   - Timestamp all schema changes
   - Monitor for anomalous queries
```

**CC2: Communication and Information**
```
What SOC 2 Requires:
- Security policies communicated to stakeholders
- System descriptions documented
- Security objectives defined and measured

Railway Implementation:
✅ Document system architecture (DONE - see RAILWAY-NETWORK-TOPOLOGY.md)
✅ Define security objectives (see below)
✅ Establish internal communication channels

Technical Documentation Needed:
- System architecture diagrams ✅ (RAILWAY-NETWORK-TOPOLOGY.md)
- Data flow diagrams ✅ (This document)
- Incident response runbooks (TODO)
- Disaster recovery procedures (TODO)
```

**CC3: Risk Assessment**
```
What SOC 2 Requires:
- Regular risk assessments conducted
- Threat modeling performed
- Risks prioritized and mitigated

Railway-Specific Risks:
🔴 HIGH: Service egress cost explosion (monitor bandwidth)
🔴 HIGH: Database exposed via public URL (migrate to private network)
🟡 MEDIUM: No WAF (DDoS protection limited)
🟡 MEDIUM: Container escape vulnerabilities (Railway responsibility)
🟢 LOW: Secrets exposure (Railway provides encrypted env vars)

Technical Implementation:
1. Network security hardening
   - Migrate all services to Railway private network ✅ (in progress)
   - Use postgres.railway.internal for DB connections
   - Disable public postgres proxy (port 20105)
   - Enable TLS 1.3+ only (Kong gateway)

2. Secrets management
   - Use Railway's encrypted environment variables
   - Rotate JWT_SECRET annually
   - Rotate DATABASE_PASSWORD quarterly
   - Never log secrets (implement secret redaction)
```

**CC4: Monitoring Activities**
```
What SOC 2 Requires:
- Security monitoring and logging
- Incident detection and response
- Anomaly detection

Railway Implementation:
✅ PostgreSQL query logs (pg_stat_statements)
✅ Application logs (stdout/stderr → Railway dashboard)
⚠️ No SIEM (need external: Datadog, Splunk, ELK)
❌ No automated threat detection (need external)

Technical Stack:
┌─────────────────────────────────────────────────┐
│ Monitoring Architecture                         │
├─────────────────────────────────────────────────┤
│ Layer 1: Railway Native                         │
│  ├── Service health checks                      │
│  ├── Resource usage metrics (CPU, RAM, egress)  │
│  └── Build/deployment logs                      │
│                                                  │
│ Layer 2: Application Instrumentation            │
│  ├── /api/health/redis (session cache health)   │
│  ├── /api/health/database (Postgres ping)       │
│  ├── Structured logging (Pino.js)               │
│  └── Error tracking (integrate Sentry)          │
│                                                  │
│ Layer 3: Database Observability                 │
│  ├── pg_stat_statements (query performance)     │
│  ├── pg_stat_activity (active connections)      │
│  ├── Custom audit triggers (see Section 4)      │
│  └── RLS policy denial logging (when active)    │
│                                                  │
│ Layer 4: External SIEM (Optional)               │
│  └── Datadog / Splunk / ELK for log aggregation │
└─────────────────────────────────────────────────┘
```

**CC5: Control Activities**
```
What SOC 2 Requires:
- Security controls implemented and operating effectively
- Change management procedures
- Backup and recovery processes

Railway Implementation:
✅ Change management: Git + GitHub Actions + Railway auto-deploy
✅ Backup: PostgreSQL automated backups (Railway provides)
⚠️ Need manual disaster recovery testing

Technical Controls:
1. Access Control
   - Railway project access: Team members only (no public access)
   - Database: Role-based access control (RBAC)
   - API: JWT authentication required
   - Redis: Password-protected, private network only

2. Change Management
   - All changes via Git commits
   - PR review required for main branch
   - Railway auto-deploys on main branch push
   - Rollback: `railway rollback` command available

3. Backup & DR
   - Railway provides automated PostgreSQL backups
   - Backup frequency: Daily (check Railway plan)
   - Retention: 7-30 days (check Railway plan)
   - RTO: 15 minutes (restore from backup)
   - RPO: 24 hours (last daily backup)
```

**CC6-CC9: Additional Security Controls**

```
CC6: Logical and Physical Access Controls
Railway Responsibility:
✅ Physical datacenter security
✅ Network infrastructure protection
✅ Hypervisor isolation between services

Your Responsibility:
✅ Railway project access (SSO, MFA)
✅ Database user management
✅ API authentication (JWT tokens)
✅ Service-to-service authentication

CC7: System Operations
✅ Railway handles infrastructure patching
⚠️ You must update Docker images (GoTrue, PostgREST, etc.)
✅ Railway provides uptime monitoring
⚠️ You must handle application-level resilience

CC8: Change Management
✅ Git-based workflow for code changes
✅ Railway deployment pipeline
❌ No formal change approval workflow (implement if needed)
❌ No automated rollback testing (manual process)

CC9: Risk Mitigation
✅ Network segmentation (Railway private network)
✅ Encryption in transit (TLS via Kong)
✅ Encryption at rest (PostgreSQL + pgsodium)
❌ No penetration testing yet (see Section 5)
```

---

#### Availability (A - Availability Criteria)

**A1: Availability Commitments**
```
What SOC 2 Requires:
- Defined availability SLAs
- Monitoring for uptime
- Incident response for outages

Railway SLA:
- Railway Platform SLA: 99.9% uptime (check current plan)
- Database SLA: Depends on Railway Postgres plan
- Network SLA: No published SLA for egress

Your Application SLA:
Define based on Railway constraints:
- Target: 99.5% uptime (allows ~3.6 hours downtime/month)
- Measurement: Railway service health checks
- Exclusions: Railway platform outages, DDoS attacks

Technical Implementation:
1. Health Check Endpoints
   GET /api/health → 200 OK if all services healthy
   └── Check Redis connection
   └── Check Postgres connection
   └── Check Kong gateway
   └── Return service status + response times

2. Uptime Monitoring
   - Railway built-in health checks
   - External monitoring: UptimeRobot, Pingdom
   - Alert on: 3 consecutive failures
   - Escalation: Page on-call engineer after 5 minutes
```

**A2: System Monitoring**
```
Railway Native Monitoring:
✅ CPU usage per service
✅ RAM usage per service
✅ Egress bandwidth (watch costs!)
✅ Build/deployment success rate
⚠️ No application-level metrics (add custom)

Custom Application Metrics:
1. API Performance
   - Average response time by endpoint
   - P95/P99 latency
   - Error rate (4xx, 5xx)
   - Request rate (requests/sec)

2. Database Performance
   - Active connections
   - Query execution time (pg_stat_statements)
   - Cache hit rate (Redis)
   - Slow query log (queries >1s)

3. Business Metrics
   - User sessions created/minute
   - Organization created/day
   - API calls per organization
   - Failed authentication attempts
```

---

#### Processing Integrity (PI - Processing Integrity Criteria)

**PI1: Processing Integrity Commitments**
```
What SOC 2 Requires:
- Data processed accurately and completely
- Processing authorized and valid
- Errors detected and corrected

Railway Implementation:
✅ Database transactions (ACID compliance)
✅ Input validation (API layer)
✅ Data integrity constraints (foreign keys, NOT NULL)
⚠️ Need audit trail for data changes

Technical Controls:
1. Data Validation
   - API input validation (Zod schemas)
   - Database constraints (CHECK, UNIQUE)
   - Type safety (TypeScript)
   - SQL parameterization (prevent injection)

2. Processing Accuracy
   - Database transactions for multi-step operations
   - Idempotency keys for critical operations
   - Duplicate detection (UNIQUE constraints)
   - Error logging for failed operations

3. Error Handling
   - Structured error responses (JSON)
   - Error codes for client handling
   - Automatic retry for transient failures
   - Dead letter queue for failed async jobs
```

---

#### Confidentiality (C - Confidentiality Criteria)

**C1: Confidentiality Commitments**
```
What SOC 2 Requires:
- Confidential data identified and protected
- Access controls prevent unauthorized disclosure
- Encryption protects data at rest and in transit

Railway + iOS Security Module Implementation:

Data Classification:
PUBLIC: Organization names, public profiles
INTERNAL: Session tokens, API usage metrics
CONFIDENTIAL: User emails, organization membership
RESTRICTED: Passwords (hashed), JWT secrets, database credentials

Encryption Architecture:
┌─────────────────────────────────────────────────┐
│ Multi-Layer Encryption                          │
├─────────────────────────────────────────────────┤
│ Layer 1: Transport Encryption                   │
│  ├── TLS 1.3 (Kong Gateway)                     │
│  ├── Certificate from Let's Encrypt             │
│  └── HSTS enabled (enforce HTTPS)               │
│                                                  │
│ Layer 2: Database Encryption                    │
│  ├── PostgreSQL encryption at rest              │
│  ├── pgsodium extension for column encryption   │
│  └── Encrypted backups (Railway)                │
│                                                  │
│ Layer 3: Application Encryption                 │
│  ├── JWT tokens (signed, not encrypted)         │
│  ├── Session tokens (SHA-256 hashed)            │
│  └── Redis: TLS connections (WS5 complete)      │
│                                                  │
│ Layer 4: iOS Security Module (Future)           │
│  ├── ZKEB Protocol (zero-knowledge encryption)  │
│  ├── AES-256-GCM for bulk data                  │
│  ├── RSA-4096 for key exchange                  │
│  └── ChaCha20-Poly1305 for mobile optimization  │
└─────────────────────────────────────────────────┘

Key Management:
🔴 CRITICAL: JWT_SECRET stored in Railway env vars (encrypted at rest)
🔴 CRITICAL: DATABASE_PASSWORD never logged or exposed
🟡 IMPORTANT: Redis password (Railway env var)
🟢 LOW RISK: Public API keys (rate-limited)

Key Rotation Policy:
- JWT_SECRET: Rotate annually (requires re-login all users)
- DATABASE_PASSWORD: Rotate quarterly (requires service restart)
- Redis password: Rotate with Redis service updates
- TLS certificates: Auto-renewed by Railway (Let's Encrypt)
```

---

#### Privacy (P - Privacy Criteria)

**P1-P8: Privacy Controls**

```
GDPR/Privacy Principles:

1. Notice (P1)
   - Privacy policy published
   - Users informed of data collection
   - Purpose of data processing explained

2. Choice and Consent (P2)
   - User consent for data collection
   - Opt-in for marketing communications
   - Account deletion option provided

3. Collection (P3)
   - Collect only necessary data
   - Data minimization principle applied
   - No excessive data retention

4. Use, Retention, and Disposal (P4)
   - Data used only for stated purpose
   - Retention policy: 90 days after account deletion
   - Secure deletion procedures

5. Access (P5)
   - Users can access their data (API endpoint)
   - Data export in machine-readable format (JSON)
   - Self-service data access

6. Disclosure to Third Parties (P6)
   - No data sharing without consent
   - Railway privacy policy applies to infrastructure
   - Document all third-party processors

7. Security (P7)
   - Covered by CC criteria above
   - Additional: Data breach notification procedures

8. Quality (P8)
   - Users can update their information
   - Data accuracy maintained
   - Inactive account cleanup

Technical Implementation:
┌─────────────────────────────────────────────────┐
│ Data Subject Rights API                         │
├─────────────────────────────────────────────────┤
│ GET /api/platform/user/data-export              │
│  └── Returns all user data in JSON format       │
│                                                  │
│ DELETE /api/platform/user/account               │
│  └── Soft delete + 90-day retention             │
│  └── Anonymize after retention period           │
│                                                  │
│ POST /api/platform/user/data-portability        │
│  └── Export data in structured format           │
│                                                  │
│ GET /api/platform/user/consent                  │
│  └── View current consent preferences           │
│                                                  │
│ PUT /api/platform/user/consent                  │
│  └── Update consent preferences                 │
└─────────────────────────────────────────────────┘
```

---

### 1.2 SOC 2 Implementation Roadmap

**Phase 1: Foundation (Weeks 1-4)**
```
Week 1: Documentation
[ ] Document system architecture
[ ] Create data flow diagrams
[ ] Define security policies
[ ] Establish role-based access matrix

Week 2: Access Control
[ ] Enable Railway SSO
[ ] Enforce MFA for all team members
[ ] Audit Railway project access
[ ] Document who has admin access

Week 3: Monitoring Setup
[ ] Implement health check endpoints
[ ] Set up external uptime monitoring
[ ] Configure alert thresholds
[ ] Create incident response runbook

Week 4: Encryption Audit
[ ] Verify TLS 1.3 on all public endpoints
[ ] Test database encryption at rest
[ ] Audit Redis TLS connections (WS5)
[ ] Document key management procedures
```

**Phase 2: Technical Controls (Weeks 5-8)**
```
Week 5: Audit Logging
[ ] Implement audit_log table (see Section 4)
[ ] Create triggers for sensitive operations
[ ] Log authentication events
[ ] Log data access patterns (metadata only)

Week 6: Network Hardening
[ ] Complete Railway private network migration
[ ] Disable public database proxy
[ ] Test service-to-service communication
[ ] Verify egress cost reduction

Week 7: Backup & DR Testing
[ ] Test PostgreSQL backup restore
[ ] Document recovery time objective (RTO)
[ ] Document recovery point objective (RPO)
[ ] Create disaster recovery runbook

Week 8: Security Testing
[ ] Run OWASP ZAP against API
[ ] Test authentication bypass attempts
[ ] Verify RLS policies (when active)
[ ] Document vulnerabilities found
```

**Phase 3: Process & Documentation (Weeks 9-12)**
```
Week 9: Policy Documentation
[ ] Access control policy
[ ] Incident response plan
[ ] Change management procedures
[ ] Vendor management policy (Railway)

Week 10: User Data Rights
[ ] Implement data export API
[ ] Implement account deletion
[ ] Test data portability
[ ] Document retention policies

Week 11: Training & Awareness
[ ] Security awareness training materials
[ ] Incident response tabletop exercise
[ ] Document training completion
[ ] Create security onboarding checklist

Week 12: Pre-Audit Preparation
[ ] Compile evidence package
[ ] Map controls to SOC 2 criteria
[ ] Document any exceptions
[ ] Ready for third-party audit
```

---

## Part 2: HIPAA Compliance Framework

### 2.1 The HIPAA Reality Check

**Can You Self-Host HIPAA-Compliant Systems?**

Technically yes, legally questionable. Here's why:

```
HIPAA Compliance = Technology + Legal Framework

Technology (Can Build):
✅ Access controls (authentication, authorization)
✅ Audit controls (logging, monitoring)
✅ Integrity controls (data validation, error detection)
✅ Transmission security (TLS encryption)

Legal Framework (Cannot Self-Certify):
❌ Business Associate Agreement (BAA)
   - Railway does NOT provide HIPAA BAA
   - You would need direct contract with Railway
   - Liability falls on you if breach occurs

❌ Breach Notification
   - Must notify affected individuals within 60 days
   - Must notify HHS if >500 individuals affected
   - Must document breach response

❌ Annual Risk Assessment
   - Required by HIPAA Security Rule
   - Must be conducted by qualified assessor
   - Costs $15k-50k for healthcare orgs
```

### 2.2 HIPAA Security Rule Requirements

Even without certification, you can build HIPAA-equivalent technical controls:

#### Administrative Safeguards (§164.308)

**§164.308(a)(1) - Security Management Process**
```
Risk Analysis:
1. Identify ePHI (electronic Protected Health Information)
   - What constitutes ePHI in your system?
   - Where is ePHI stored? (database, logs, backups)
   - Who has access to ePHI?

2. Risk Assessment Matrix:
   Threat: Unauthorized database access
   Likelihood: Medium (if public proxy enabled)
   Impact: HIGH (full ePHI disclosure)
   Mitigation: Disable public postgres proxy ✅

   Threat: API authentication bypass
   Likelihood: Low (JWT + session validation)
   Impact: HIGH (access to user ePHI)
   Mitigation: Regular penetration testing

   Threat: Backup exposure
   Likelihood: Low (Railway encrypts backups)
   Impact: MEDIUM (historical ePHI)
   Mitigation: Verify Railway backup encryption

3. Risk Mitigation:
   [ ] Implement compensating controls
   [ ] Document accepted risks
   [ ] Plan for risk elimination

Risk Management:
- Document all identified risks
- Assign risk owners
- Track mitigation progress
- Review risks quarterly

Sanction Policy:
- Define penalties for security violations
- Document enforcement procedures
- Track violations and sanctions

Information System Activity Review:
- Review audit logs weekly
- Investigate anomalies within 24 hours
- Document review process
```

**§164.308(a)(3) - Workforce Security**
```
Authorization/Supervision:
- Role-based access control (RBAC)
- Least privilege principle
- Regular access reviews (quarterly)

Workforce Clearance:
- Background checks for employees with ePHI access
- Security clearance levels defined
- Document clearance procedures

Termination Procedures:
- Revoke Railway access immediately
- Revoke database access immediately
- Audit for data exfiltration
- Document offboarding checklist
```

**§164.308(a)(4) - Information Access Management**
```
Isolating Health Care Clearinghouse Functions:
- Not applicable (not a clearinghouse)

Access Authorization:
- Approve access requests in writing (email)
- Document business justification
- Time-limited access for contractors
- Review access quarterly

Access Establishment and Modification:
- New employee: Provision after clearance
- Role change: Update permissions
- Termination: Revoke all access immediately
- Audit access changes monthly
```

**§164.308(a)(5) - Security Awareness and Training**
```
Security Reminders:
- Quarterly security newsletters
- Phishing simulation training
- Security tips in team chat

Protection from Malicious Software:
- Endpoint protection on developer machines
- No direct access to production database
- All changes via code review

Log-in Monitoring:
- Monitor failed login attempts
- Alert on suspicious authentication patterns
- Document monitoring procedures

Password Management:
- Minimum 12 characters
- Complexity requirements
- MFA required for all accounts
- No password sharing
```

**§164.308(a)(6) - Security Incident Procedures**
```
Response and Reporting:
┌─────────────────────────────────────────────────┐
│ Incident Response Plan                          │
├─────────────────────────────────────────────────┤
│ Severity 1: Confirmed ePHI Breach               │
│  └── Notify CEO immediately                     │
│  └── Engage incident response team              │
│  └── Preserve evidence (logs, snapshots)        │
│  └── Contain breach (revoke access)             │
│  └── Begin breach notification process          │
│                                                  │
│ Severity 2: Suspected Unauthorized Access       │
│  └── Investigate within 4 hours                 │
│  └── Document findings                          │
│  └── Escalate to Severity 1 if confirmed        │
│                                                  │
│ Severity 3: Failed Attack Attempt               │
│  └── Log incident                               │
│  └── Review security controls                   │
│  └── No breach notification required            │
└─────────────────────────────────────────────────┘

Breach Notification Procedures:
1. Assessment (within 24 hours)
   - Determine if breach occurred
   - Identify affected individuals
   - Assess harm to individuals

2. Notification (within 60 days)
   - Notify affected individuals
   - Notify HHS if >500 individuals
   - Notify media if >500 in same state

3. Documentation
   - Document incident timeline
   - Document response actions
   - Document lessons learned
   - Update incident response plan
```

**§164.308(a)(7) - Contingency Plan**
```
Data Backup Plan:
- Railway automated daily backups ✅
- Test restore procedure quarterly
- Document backup verification
- Offsite backup storage (Railway handles)

Disaster Recovery Plan:
- RTO: 15 minutes (restore from backup)
- RPO: 24 hours (last daily backup)
- Failover procedure documented
- DR testing annually

Emergency Mode Operation Plan:
- Read-only mode if database compromised
- Fallback to cached data (Redis)
- Manual failover procedures
- Emergency contact list

Testing and Revision:
- Test DR plan annually
- Update after infrastructure changes
- Document test results
- Review after incidents

Applications and Data Criticality Analysis:
Priority 1 (Critical):
- User authentication (GoTrue)
- Database (PostgreSQL)
- API Gateway (Kong)

Priority 2 (Important):
- Studio UI
- Redis cache

Priority 3 (Nice to have):
- Monitoring dashboards
- Analytics
```

**§164.308(a)(8) - Evaluation**
```
Periodic Technical and Nontechnical Evaluation:
- Annual security assessment
- Quarterly vulnerability scans
- Monthly access reviews
- Weekly log reviews

Evaluation Checklist:
[ ] Technical controls operating as designed
[ ] Policies and procedures followed
[ ] Training completed by all staff
[ ] Incidents documented and resolved
[ ] Risks reassessed
[ ] Compliance with HIPAA requirements
```

---

#### Physical Safeguards (§164.310)

**Railway's Responsibility** (Infrastructure Layer):
```
§164.310(a) - Facility Access Controls
✅ Datacenter physical security
✅ Badge access systems
✅ Security cameras
✅ Visitor logs
✅ Escort requirements

Railway Datacenter Providers:
- AWS (SOC 2, ISO 27001, HIPAA certified datacenters)
- Google Cloud (depending on Railway backend)

Your Responsibility: NONE (Railway handles physical infrastructure)
```

**Your Responsibility** (Endpoint Security):
```
§164.310(b) - Workstation Use
- Define approved workstations
- Encrypt developer laptops
- Disable auto-login
- Screen lock after 10 minutes inactivity

§164.310(c) - Workstation Security
- Laptop encryption (FileVault, BitLocker)
- Antivirus/EDR installed
- Firewall enabled
- No shared workstations

§164.310(d) - Device and Media Controls
Disposal:
- Wipe devices before disposal (secure erase)
- Destroy hard drives (physical destruction)
- Document disposal

Media Re-use:
- Encrypt all removable media
- Wipe before re-use
- No USB drives for ePHI transfer

Accountability:
- Asset inventory (laptops, phones)
- Track device assignments
- Audit device access quarterly

Data Backup and Storage:
- No ePHI on local workstations (use cloud only)
- Backups encrypted at rest
- Backup access logged
```

---

#### Technical Safeguards (§164.312)

**§164.312(a)(1) - Access Control**
```
Unique User Identification (Required):
✅ PostgreSQL: Individual database users (not shared accounts)
✅ API: User-specific JWT tokens
✅ Railway: Individual team member accounts
❌ Shared "admin" accounts prohibited

Emergency Access Procedure (Required):
Break-glass Procedure:
1. Production database emergency access
   - Use Railway CLI with service account
   - Log reason for emergency access
   - Revoke access after incident resolved
   - Document in incident log

2. API bypass for system recovery
   - Service role JWT token (admin level)
   - Used only for disaster recovery
   - Access logged and reviewed weekly

Automatic Logoff (Addressable):
✅ API sessions: 15-minute timeout (Redis TTL)
✅ Railway dashboard: 1-hour timeout
✅ Studio UI: 30-minute inactivity timeout
⚠️ Database connections: Connection pooling (no timeout)

Encryption and Decryption (Addressable):
✅ TLS 1.3 for all connections
✅ PostgreSQL encryption at rest
✅ Redis TLS connections (WS5)
✅ JWT tokens signed (HS256)
✅ Session tokens hashed (SHA-256)
✅ iOS Security Module: AES-256-GCM (future integration)
```

**§164.312(b) - Audit Controls**
```
Required: Implement hardware, software, and/or procedural mechanisms that record and examine activity

Technical Implementation (See Section 4 for details):

1. Database Audit Logging
   - All SELECT queries on ePHI tables logged
   - All INSERT/UPDATE/DELETE logged with old/new values
   - User ID captured from session variable
   - Timestamp with millisecond precision
   - IP address when available

2. API Audit Logging
   - Authentication events (login, logout, failed attempts)
   - Authorization failures (403 responses)
   - Data export requests
   - Account modifications
   - Administrative actions

3. Infrastructure Audit Logging
   - Railway deployment logs
   - Database schema changes (migrations)
   - Environment variable changes
   - Service restarts

4. Log Retention
   - API logs: 90 days (hot storage)
   - Database audit logs: 1 year (compliance requirement)
   - Infrastructure logs: 30 days (Railway limit)
   - Archive to S3 for long-term retention

5. Log Analysis
   - Weekly manual review
   - Automated anomaly detection (future)
   - Alert on suspicious patterns
   - Quarterly trend analysis
```

**§164.312(c) - Integrity Controls**
```
Required: Implement policies and procedures to protect ePHI from improper alteration or destruction

Mechanism to Authenticate ePHI (Addressable):
1. Data Integrity Checks
   - Database constraints (NOT NULL, CHECK, UNIQUE)
   - Foreign key relationships (prevent orphaned records)
   - Transaction isolation (SERIALIZABLE for critical operations)
   - Checksums for file uploads (future)

2. Audit Trail for Data Changes
   - UPDATE/DELETE triggers capture old values
   - Changes attributed to specific user ID
   - Changes cannot be modified after insert
   - Immutable audit log table

3. Version Control
   - Database migrations tracked in version control
   - API code changes tracked in Git
   - Configuration changes tracked (Railway dashboard)
   - Rollback capability for all changes
```

**§164.312(d) - Person or Entity Authentication**
```
Required: Implement procedures to verify that a person or entity seeking access to ePHI is the one claimed

Technical Implementation:
✅ Multi-Factor Authentication (MFA)
   - Required for Railway access
   - Required for production database access (future)
   - SMS or authenticator app

✅ Session Management
   - JWT tokens signed and verified
   - Session tokens cryptographically hashed
   - Session timeout enforced
   - Device fingerprinting (future)

✅ Password Requirements
   - Minimum 12 characters
   - Complexity requirements (upper, lower, number, special)
   - Passwords hashed with bcrypt (cost factor 10)
   - No password reuse (last 5 passwords)

✅ Account Lockout
   - 5 failed attempts → 15 minute lockout
   - Alert on repeated lockouts
   - CAPTCHA after 3 failed attempts

✅ Biometric Authentication (iOS App - Future)
   - Face ID / Touch ID support
   - Fallback to password + MFA
   - Biometric data never leaves device
```

**§164.312(e) - Transmission Security**
```
Required: Implement technical security measures to guard against unauthorized access to ePHI being transmitted over electronic communications network

Integrity Controls (Addressable):
✅ TLS 1.3 for all HTTPS connections
✅ Certificate verification (Let's Encrypt)
✅ HSTS header (enforce HTTPS)
✅ Perfect forward secrecy (TLS key exchange)

Encryption (Addressable):
✅ All public endpoints use TLS 1.3
✅ Railway private network: Unencrypted (internal only)
✅ Database connections: TLS (postgres:// → postgres://...?sslmode=require)
✅ Redis connections: TLS (see WS5-TLS-ENCRYPTION-COMPLETE.md)

Network Security:
✅ Kong Gateway as reverse proxy
✅ Rate limiting on all public endpoints
✅ IP allowlisting (future)
✅ DDoS protection (Railway + Cloudflare)
```

---

### 2.3 HIPAA Gap Analysis

**What You Have** vs **What HIPAA Requires**:

| Requirement | Current State | Gap | Priority |
|-------------|---------------|-----|----------|
| **Administrative Safeguards** |
| Risk assessment | ❌ Not conducted | Need formal risk assessment | 🔴 HIGH |
| Security policies | ⚠️ Partial | Document all policies | 🟡 MEDIUM |
| Workforce training | ❌ Not implemented | Create training program | 🟡 MEDIUM |
| Incident response | ⚠️ Informal | Document formal procedures | 🔴 HIGH |
| BAA with Railway | ❌ Not available | **BLOCKER** - Railway doesn't provide | 🔴 CRITICAL |
| **Physical Safeguards** |
| Datacenter security | ✅ Railway handles | None (Railway responsibility) | 🟢 LOW |
| Workstation security | ⚠️ Partial | Document workstation policies | 🟡 MEDIUM |
| Device disposal | ❌ Not documented | Create disposal procedures | 🟡 MEDIUM |
| **Technical Safeguards** |
| Unique user IDs | ✅ Implemented | None | 🟢 DONE |
| MFA | ⚠️ Railway only | Enforce for all production access | 🟡 MEDIUM |
| Audit logging | ⚠️ Partial | Implement comprehensive audit logs | 🔴 HIGH |
| Encryption at rest | ✅ PostgreSQL | None | 🟢 DONE |
| Encryption in transit | ✅ TLS 1.3 | None | 🟢 DONE |
| Session timeout | ✅ 15 minutes | None | 🟢 DONE |
| Auto logoff | ✅ Implemented | None | 🟢 DONE |

---

### 2.4 HIPAA Compliance Roadmap (Without Certification)

**Disclaimer**: This roadmap builds technical equivalence to HIPAA controls but **CANNOT** result in official certification without a Business Associate Agreement (BAA) from Railway.

**Phase 1: Foundation (Months 1-2)**
```
Month 1: Assessment & Planning
Week 1-2: Risk Assessment
[ ] Identify all ePHI in system
[ ] Map data flows (where ePHI goes)
[ ] Identify vulnerabilities
[ ] Document risk assessment report

Week 3-4: Policy Development
[ ] Security management policy
[ ] Incident response policy
[ ] Workforce security policy
[ ] Access control policy
[ ] Audit control policy
[ ] Data backup policy

Month 2: Technical Foundation
Week 1-2: Audit Logging Implementation
[ ] Create audit_log table with triggers
[ ] Log authentication events
[ ] Log data access events
[ ] Log administrative actions
[ ] Test log integrity

Week 3-4: Access Control Hardening
[ ] Enforce MFA on all accounts
[ ] Implement session timeout
[ ] Add emergency access procedures
[ ] Document access control matrix
```

**Phase 2: Technical Safeguards (Months 3-4)**
```
Month 3: Encryption & Network Security
Week 1-2: Encryption Audit
[ ] Verify TLS 1.3 on all endpoints
[ ] Test certificate validation
[ ] Audit database encryption
[ ] Test Redis TLS (WS5)
[ ] Document encryption architecture

Week 3-4: Network Hardening
[ ] Complete private network migration
[ ] Disable public database proxy
[ ] Implement rate limiting
[ ] Configure DDoS protection
[ ] Test service-to-service communication

Month 4: Integrity & Authentication
Week 1-2: Data Integrity Controls
[ ] Add database constraints
[ ] Implement version control for data
[ ] Test transaction isolation
[ ] Create immutable audit log

Week 3-4: Authentication Hardening
[ ] Enforce password complexity
[ ] Implement account lockout
[ ] Add CAPTCHA on login
[ ] Test MFA enforcement
[ ] Document authentication architecture
```

**Phase 3: Administrative Safeguards (Months 5-6)**
```
Month 5: Training & Awareness
Week 1-2: Security Training
[ ] Create training materials
[ ] Conduct security awareness training
[ ] Document training completion
[ ] Schedule quarterly refreshers

Week 3-4: Incident Response
[ ] Create incident response plan
[ ] Conduct tabletop exercise
[ ] Document escalation procedures
[ ] Create breach notification template

Month 6: Documentation & Testing
Week 1-2: Policy Documentation
[ ] Finalize all security policies
[ ] Document procedures
[ ] Create employee handbook section
[ ] Get management sign-off

Week 3-4: Compliance Testing
[ ] Test backup restore procedures
[ ] Test incident response plan
[ ] Conduct vulnerability scan
[ ] Document test results
[ ] Compile evidence package
```

**Phase 4: Continuous Compliance (Ongoing)**
```
Weekly:
[ ] Review audit logs
[ ] Monitor failed login attempts
[ ] Check system health
[ ] Review security alerts

Monthly:
[ ] Access review (who has access to what)
[ ] Vulnerability scan
[ ] Incident review
[ ] Update risk assessment

Quarterly:
[ ] Security awareness training refresher
[ ] Policy review and updates
[ ] Test disaster recovery plan
[ ] Third-party vendor review

Annually:
[ ] Comprehensive risk assessment
[ ] Security control testing
[ ] Policy review and approval
[ ] Readiness for audit (if seeking certification)
```

---

## Part 3: Security Policies & Procedures

### 3.1 Access Control Policy

```markdown
# Access Control Policy
Version: 1.0
Effective Date: 2025-11-22
Last Reviewed: 2025-11-22

## Purpose
Define standards for granting, reviewing, and revoking access to OgelBase systems and data.

## Scope
Applies to all employees, contractors, and third-party vendors with access to OgelBase infrastructure, applications, or data.

## Roles and Responsibilities

### System Administrator
- Provision user accounts
- Grant and revoke access
- Review access quarterly
- Monitor for unauthorized access

### Security Officer
- Approve access requests
- Conduct access reviews
- Investigate access violations
- Update access control policy

### End Users
- Protect credentials
- Report suspicious activity
- Follow least privilege principle
- Complete security training

## Access Request Process

1. **Request Submission**
   - Employee submits access request via email
   - Include: Name, role, systems needed, business justification
   - Manager approval required

2. **Access Review**
   - Security officer reviews request
   - Verifies business need
   - Confirms appropriate access level
   - Documents approval/denial

3. **Access Provisioning**
   - System admin grants access
   - User receives credentials
   - Access logged in audit trail
   - User acknowledges acceptable use policy

4. **Access Review**
   - Quarterly review of all access
   - Remove unnecessary access
   - Update roles as needed
   - Document review findings

5. **Access Revocation**
   - Immediate upon termination
   - Scheduled for role changes
   - Emergency revocation for security incidents
   - Documented in audit log

## Access Levels

### Railway Platform
- **Owner**: Full administrative access (CTO only)
- **Admin**: Deploy, configure services (senior engineers)
- **Developer**: View logs, metrics (all engineers)
- **Viewer**: Read-only access (product, design)

### Database
- **service_role**: Full access, bypass RLS (background jobs)
- **authenticated**: API requests with RLS enforcement
- **admin**: Schema changes, user management (DBAs)
- **readonly**: SELECT only for analytics

### API
- **System Admin**: Full API access
- **Organization Owner**: Org-specific admin access
- **Organization Member**: Read access to org data
- **Anonymous**: Public endpoints only

## Technical Controls

### Authentication
- Minimum password length: 12 characters
- Password complexity required
- MFA required for production access
- Session timeout: 15 minutes (API), 1 hour (Railway)

### Authorization
- Role-based access control (RBAC)
- Principle of least privilege
- Just-in-time access for elevated privileges
- Regular access reviews

### Audit Logging
- All authentication events logged
- Failed access attempts logged
- Access modifications logged
- Logs retained for 1 year

## Exception Process
Exceptions to this policy require:
- Written justification
- Security officer approval
- Executive sponsor
- Annual review of exception

## Policy Violations
Violations of access control policy may result in:
- Warning (first offense)
- Suspension of access (repeat offenses)
- Termination (malicious violations)
- Legal action (criminal activity)

## Related Policies
- Acceptable Use Policy
- Incident Response Policy
- Data Classification Policy
```

---

### 3.2 Incident Response Plan

```markdown
# Incident Response Plan
Version: 1.0
Effective Date: 2025-11-22

## Purpose
Define procedures for detecting, responding to, and recovering from security incidents.

## Incident Classification

### Severity 1: Critical
**Definition**: Confirmed data breach, system compromise, or service outage affecting >50% users

**Examples**:
- Unauthorized access to production database
- ePHI disclosure
- Ransomware infection
- DDoS attack causing outage

**Response Time**: Immediate (within 15 minutes)

**Response Team**:
- Incident Commander: CTO
- Technical Lead: Engineering Manager
- Security Lead: Security Officer
- Communications: CEO or designee

---

### Severity 2: High
**Definition**: Suspected security incident or partial service degradation

**Examples**:
- Multiple failed authentication attempts
- Anomalous database queries
- Performance degradation
- Suspected malware

**Response Time**: 4 hours

**Response Team**:
- Incident Commander: Engineering Manager
- Technical Lead: On-call engineer
- Security Lead: Security Officer

---

### Severity 3: Medium
**Definition**: Security event requiring investigation but no immediate threat

**Examples**:
- Single failed authentication
- Low-level vulnerability scan alert
- Policy violation by user
- Configuration drift

**Response Time**: 24 hours

**Response Team**:
- Incident Commander: On-call engineer
- Documentation: Security officer

---

## Incident Response Phases

### Phase 1: Detection and Analysis
```
1. Incident Detection
   - Automated monitoring alerts
   - User reports
   - Log analysis
   - Vulnerability scan findings

2. Initial Assessment
   - Confirm incident is occurring
   - Determine severity level
   - Identify affected systems
   - Estimate scope of impact

3. Team Notification
   - Page incident commander
   - Notify response team
   - Document notification time
   - Establish war room (Slack channel)

4. Evidence Preservation
   - Take database snapshot
   - Export relevant logs
   - Screenshot system state
   - Document timeline
```

### Phase 2: Containment
```
Short-Term Containment:
1. Isolate affected systems
   - Disable compromised accounts
   - Block malicious IP addresses
   - Take affected service offline if needed
   - Prevent further data access

2. Preserve Evidence
   - Do not modify affected systems
   - Export logs before they rotate
   - Take memory dumps if malware suspected
   - Document all actions taken

Long-Term Containment:
1. Apply temporary fixes
   - Patch vulnerabilities
   - Reset compromised credentials
   - Update firewall rules
   - Deploy compensating controls

2. Return to Limited Operations
   - Restore critical services first
   - Monitor closely for recurrence
   - Limit access to essentials
   - Prepare for recovery phase
```

### Phase 3: Eradication
```
1. Identify Root Cause
   - How did incident occur?
   - What vulnerability was exploited?
   - Were security controls bypassed?
   - Document root cause analysis

2. Remove Threat
   - Delete malware
   - Close vulnerabilities
   - Remove backdoors
   - Verify threat eliminated

3. Harden Systems
   - Apply security patches
   - Update security configurations
   - Implement additional controls
   - Test security improvements
```

### Phase 4: Recovery
```
1. Restore Systems
   - Restore from clean backups
   - Rebuild compromised systems
   - Verify system integrity
   - Test functionality

2. Return to Normal Operations
   - Gradually restore services
   - Monitor for recurrence
   - Validate data integrity
   - Resume normal operations

3. Monitoring
   - Enhanced monitoring for 30 days
   - Watch for indicators of compromise
   - Review logs daily
   - Alert on anomalies
```

### Phase 5: Post-Incident Activity
```
1. Lessons Learned Meeting
   - What happened?
   - What went well?
   - What needs improvement?
   - Action items for improvement

2. Documentation
   - Final incident report
   - Timeline of events
   - Actions taken
   - Recommendations

3. Update Security Controls
   - Implement lessons learned
   - Update incident response plan
   - Improve detection capabilities
   - Conduct additional training

4. Breach Notification (if applicable)
   - Notify affected individuals (GDPR: 72 hours)
   - Notify regulators if required (HIPAA: 60 days)
   - Public disclosure if required
   - Document notification
```

---

## Communication Plan

### Internal Communication
```
War Room: Create private Slack channel
- #incident-YYYYMMDD-HHmm
- Invite response team only
- Document all discussions
- Archive after resolution

Status Updates:
- Incident commander posts updates every 30 minutes
- Include: Current status, impact, ETA for resolution
- Tag @here for critical updates
- Update incident tracking system
```

### External Communication
```
Customer Communication (if needed):
- Draft message approved by CEO
- Post to status page
- Send email to affected customers
- Update every 2 hours until resolved

Media Communication:
- All media inquiries → CEO only
- No technical staff interviews without approval
- Prepared statement reviewed by legal
- Document all media interactions

Regulator Communication (if required):
- HIPAA breach: Notify HHS within 60 days
- GDPR breach: Notify DPA within 72 hours
- Legal team drafts notification
- CEO signs notification
```

---

## Incident Response Tools

### Detection Tools
- Railway monitoring dashboard
- PostgreSQL query logs
- Application logs (Pino.js)
- External uptime monitoring
- Security alerts

### Analysis Tools
- Log aggregation (ELK / Datadog)
- Database query analyzer (pg_stat_statements)
- Network traffic analysis
- Vulnerability scanners (OWASP ZAP)

### Containment Tools
- Railway CLI (service control)
- Database access revocation
- IP blocking (Kong Gateway)
- Service isolation (private network)

### Recovery Tools
- Railway backups
- Database snapshots
- Infrastructure as code (Git)
- Deployment rollback (railway rollback)

---

## Incident Response Checklist

### Severity 1 Incident Checklist
```
Detection Phase:
[ ] Incident confirmed
[ ] Severity assessed
[ ] Incident commander notified
[ ] Response team assembled
[ ] War room created
[ ] Evidence preservation started
[ ] Timeline documentation started

Containment Phase:
[ ] Affected systems identified
[ ] Systems isolated
[ ] Access revoked
[ ] Temporary fixes applied
[ ] Stakeholders notified
[ ] Status page updated

Eradication Phase:
[ ] Root cause identified
[ ] Vulnerabilities patched
[ ] Malware removed (if applicable)
[ ] System integrity verified
[ ] Security controls hardened

Recovery Phase:
[ ] Systems restored from backup
[ ] Functionality tested
[ ] Services returned to normal
[ ] Enhanced monitoring enabled
[ ] Post-incident review scheduled

Post-Incident Phase:
[ ] Incident report completed
[ ] Lessons learned documented
[ ] Action items assigned
[ ] Security controls updated
[ ] Training updated
[ ] Breach notification (if required)
```

---

## Post-Incident Report Template

```markdown
# Incident Report

## Incident Summary
- Incident ID: INC-YYYYMMDD-NNN
- Date/Time Detected: YYYY-MM-DD HH:MM UTC
- Date/Time Resolved: YYYY-MM-DD HH:MM UTC
- Severity Level: [1|2|3]
- Incident Commander: [Name]

## Incident Description
[Brief description of what happened]

## Impact Assessment
- Systems Affected: [List systems]
- Users Affected: [Number and description]
- Data Affected: [Type and quantity]
- Duration of Impact: [Hours/minutes]

## Timeline of Events
| Time (UTC) | Event | Action Taken |
|------------|-------|--------------|
| HH:MM | Incident detected | Alert received |
| HH:MM | Team notified | Incident commander paged |
| HH:MM | Containment | System isolated |
| HH:MM | Resolution | Service restored |

## Root Cause Analysis
[Detailed analysis of how incident occurred]

### Contributing Factors
1. [Factor 1]
2. [Factor 2]

## Response Actions
[What was done to contain and resolve]

## What Went Well
1. [Success 1]
2. [Success 2]

## Areas for Improvement
1. [Improvement 1]
2. [Improvement 2]

## Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| [Action] | [Name] | YYYY-MM-DD | [Open/Complete] |

## Recommendations
1. [Recommendation 1]
2. [Recommendation 2]

## Attachments
- Logs: [link]
- Evidence: [link]
- Communications: [link]
```

---

## Training and Exercises

### Tabletop Exercises
**Frequency**: Quarterly

**Scenarios**:
1. Database breach
2. DDoS attack
3. Ransomware infection
4. Insider threat
5. Supply chain compromise

**Participants**:
- Engineering team
- Security team
- Leadership team
- Customer support

---

## Contact Information

### Internal Contacts
```
Incident Commander (Primary): CTO
- Phone: [redacted]
- Email: [redacted]
- Availability: 24/7

Incident Commander (Backup): Engineering Manager
- Phone: [redacted]
- Email: [redacted]

Security Officer: [Name]
- Phone: [redacted]
- Email: [redacted]

CEO: [Name]
- Phone: [redacted]
- Email: [redacted]
```

### External Contacts
```
Railway Support:
- Email: help@railway.app
- Status: status.railway.app
- Priority Support: (check Railway plan)

Legal Counsel:
- Firm: [Law Firm Name]
- Contact: [Attorney Name]
- Phone: [redacted]

Forensics Team (if needed):
- Company: [Forensics Firm]
- Contact: [Contact Name]
- Phone: [redacted]
```

---

## Policy Review
This incident response plan will be reviewed:
- Annually (scheduled review)
- After any Severity 1 incident
- After significant infrastructure changes
- When new threats emerge
```

---

### 3.3 Business Continuity & Disaster Recovery Plan

```markdown
# Business Continuity and Disaster Recovery Plan
Version: 1.0
Effective Date: 2025-11-22

## Purpose
Ensure business operations can continue during and after a disaster affecting OgelBase infrastructure.

## Disaster Scenarios

### Scenario 1: Railway Platform Outage
**Impact**: All services down (Studio, Database, API)
**Likelihood**: Low (Railway 99.9% SLA)
**Mitigation**: None (platform-level failure)
**Recovery**: Wait for Railway restoration

**Procedure**:
1. Confirm outage (Railway status page)
2. Notify customers (status page, email)
3. Monitor Railway status
4. Test service restoration
5. Resume normal operations

---

### Scenario 2: Database Corruption or Loss
**Impact**: Data unavailable or corrupted
**Likelihood**: Very Low (Railway backups)
**RTO**: 15 minutes
**RPO**: 24 hours (last backup)

**Procedure**:
1. Assess database state
   - Can connect? Test with `psql`
   - Data corrupted? Run integrity checks
   - Data lost? Check last backup timestamp

2. Restore from backup
   ```bash
   # Railway CLI
   railway run psql $DATABASE_URL

   # Or via Railway dashboard:
   # Projects → Database → Backups → Restore
   ```

3. Verify data integrity
   - Run test queries
   - Check row counts match expected
   - Verify critical data exists
   - Test application functionality

4. Resume operations
   - Update DNS if needed
   - Notify customers of restoration
   - Monitor for issues

---

### Scenario 3: Service-Specific Failure

**Impact**: Individual service down (e.g., Kong Gateway)
**Likelihood**: Medium
**RTO**: 5 minutes
**RPO**: N/A (stateless services)

**Procedure**:
1. Identify failed service (Railway dashboard)
2. Check logs for error messages
3. Restart service (Railway auto-restart usually handles)
4. If restart fails, redeploy from Git
5. Verify service health

---

### Scenario 4: Security Incident (see Incident Response Plan)

---

### Scenario 5: Data Center Failure
**Impact**: Regional outage
**Likelihood**: Very Low (AWS multi-AZ)
**Recovery**: Railway handles failover

**Procedure**:
1. Railway automatically fails over to other AZ
2. Monitor Railway status page
3. Test service availability
4. No action required (Railway platform handles)

---

## Recovery Time and Recovery Point Objectives

| Service | RTO | RPO | Backup Frequency |
|---------|-----|-----|------------------|
| PostgreSQL Database | 15 min | 24 hours | Daily (Railway) |
| API Services | 5 min | 0 (stateless) | N/A (redeploy from Git) |
| Redis Cache | 5 min | 0 (cache) | N/A (rebuild from DB) |
| Studio UI | 2 min | 0 (static) | N/A (redeploy from Git) |

---

## Backup Strategy

### Database Backups (Railway Managed)
```
Backup Type: Automated snapshots
Frequency: Daily
Retention: 7-30 days (depends on Railway plan)
Location: Same region as database
Encryption: Encrypted at rest by Railway

Restore Procedure:
1. Railway Dashboard → Database → Backups
2. Select backup to restore
3. Click "Restore"
4. Verify restoration
5. Update application if needed
```

### Manual Backups (Before Major Changes)
```
Before applying migration:
railway run pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

Before large data import:
railway run pg_dump $DATABASE_URL --no-owner --no-privileges > backup.sql

Store backups:
- Local: Encrypted external drive
- Cloud: S3 bucket (encrypted)
- Retention: 90 days
```

### Application Backups (Git)
```
All code in version control:
- Git repository: GitHub
- Branches: main, staging, development
- Tags: Semantic versioning (v1.2.3)

Backup frequency: Continuous (every commit)
Retention: Infinite (Git history)
Location: GitHub + local developer machines
```

### Configuration Backups
```
Railway environment variables:
- Export monthly: railway vars --export > env_backup.txt
- Store encrypted in password manager (1Password, Vault)
- Document any manual Railway configuration changes

Docker configs:
- All in Git (docker-compose.yml, Dockerfiles)
- No manual configuration in Railway
```

---

## Disaster Recovery Testing

### Test Schedule
```
Monthly: Service restart test
- Restart each Railway service
- Verify automatic recovery
- Document any issues

Quarterly: Database restore test
- Create test database from backup
- Verify data integrity
- Measure recovery time
- Document procedure

Annually: Full DR test
- Simulate complete outage
- Restore from backups
- Test all recovery procedures
- Update DR plan based on findings
```

### Test Documentation Template
```markdown
# DR Test Report

**Test Date**: YYYY-MM-DD
**Test Type**: [Service Restart | Database Restore | Full DR]
**Tester**: [Name]

## Test Procedure
[What was done]

## Results
- RTO Target: [X minutes]
- RTO Actual: [Y minutes]
- RPO Target: [X hours]
- RPO Actual: [Y hours]
- Data Loss: [Yes/No, how much]

## Issues Encountered
1. [Issue 1]
2. [Issue 2]

## Recommendations
1. [Recommendation 1]
2. [Recommendation 2]

## Next Test Date
YYYY-MM-DD
```

---

## Alternate Processing Site

**Primary Site**: Railway (Region: US-East)

**Alternate Site Options**:
```
Option 1: Railway Different Region
- Pros: Same platform, familiar tools
- Cons: Would need to migrate data, reconfigure services
- RTO: ~2 hours (manual migration)
- Cost: Same as primary

Option 2: Different Cloud Provider (AWS, GCP)
- Pros: Geographic diversity
- Cons: Different platform, relearning curve
- RTO: ~8 hours (rebuild infrastructure)
- Cost: Higher (need to maintain standby)

Option 3: Self-Hosted Fallback
- Pros: Complete control
- Cons: High maintenance, requires hardware
- RTO: ~24 hours (provision hardware, deploy)
- Cost: High (hardware, colocation)

Recommendation: Option 1 (Railway different region)
- Keep infrastructure as code ready for deployment
- Document region migration procedure
- Test migration annually
- Only activate if primary region down >4 hours
```

---

## Emergency Contacts

### Internal
```
Engineering Team:
- On-Call Engineer: [rotation schedule]
- Engineering Manager: [contact]
- CTO: [contact]

Executive Team:
- CEO: [contact]
- COO: [contact]
```

### External
```
Railway Support:
- Priority Support: help@railway.app
- Status Page: status.railway.app
- Community: discord.gg/railway

Cloud Infrastructure:
- AWS Support: (if Railway uses AWS)

Vendors:
- Database Consultant: [if needed]
- DevOps Consultant: [if needed]
```

---

## Communication Plan During Disaster

### Internal Communication
```
Primary: Slack (#incident channel)
Backup: Email group (engineering@)
Tertiary: Phone tree

Status Updates:
- Every 30 minutes during active incident
- Hourly during recovery
- Final update when resolved
```

### Customer Communication
```
Status Page:
- URL: status.ogelbase.com (future)
- Updates every 15 minutes during outage
- Include: What happened, impact, ETA for resolution

Email:
- Send to affected customers only
- Include: Timeline, impact, what we're doing
- Apology + compensation if appropriate (SLA credits)

Social Media:
- Twitter/X: Brief status updates
- LinkedIn: Post-mortem after major incidents
```

---

## Data Retention During Disaster

```
Critical Data (Retain at All Costs):
- User accounts (platform.users)
- Organization data (platform.organizations)
- Project configurations (platform.projects)
- Credentials (platform.credentials)

Important Data (Restore from Backup):
- Audit logs (platform.audit_log)
- Session history (platform.user_sessions)
- Usage metrics (analytics tables)

Nice-to-Have Data (Acceptable Loss):
- Redis cache (rebuild from database)
- Temporary files
- Debug logs older than 7 days
```

---

## Post-Disaster Review

After any disaster or DR test:

```markdown
# Post-Disaster Review

**Incident**: [Description]
**Date**: YYYY-MM-DD
**Duration**: [X hours/minutes]

## What Happened
[Timeline of events]

## DR Plan Performance
- RTO Target: [X] | Actual: [Y]
- RPO Target: [X] | Actual: [Y]
- Plan Followed?: [Yes/No/Partially]

## What Worked Well
1. [Success 1]
2. [Success 2]

## What Didn't Work
1. [Failure 1]
2. [Failure 2]

## Action Items
| Action | Owner | Due Date |
|--------|-------|----------|
| Update DR plan | [Name] | YYYY-MM-DD |
| Fix issue X | [Name] | YYYY-MM-DD |

## DR Plan Updates
[Changes to make to this document]
```

---

## Appendix: Recovery Commands

### Database Recovery
```bash
# Check database status
railway run psql $DATABASE_URL -c "SELECT 1;"

# Restore from Railway backup
# (Via Railway dashboard - no CLI command)

# Restore from manual backup
railway run psql $DATABASE_URL < backup.sql

# Verify row counts
railway run psql $DATABASE_URL -c "
  SELECT schemaname, tablename, n_live_tup
  FROM pg_stat_user_tables
  WHERE schemaname = 'platform'
  ORDER BY n_live_tup DESC;
"
```

### Service Recovery
```bash
# Restart all services
railway restart

# Restart specific service
railway restart --service studio

# Redeploy from Git (if restart fails)
git push railway main --force

# Check service status
railway status

# View logs
railway logs --service studio
```

### Network Recovery
```bash
# Test private network connectivity
railway run curl http://postgres.railway.internal:5432

# Test public endpoint
curl https://studio-production.up.railway.app/api/health

# Check Redis connection
railway run redis-cli -h redis.railway.internal ping
```
```

---

### 3.4 Change Management Policy

```markdown
# Change Management Policy
Version: 1.0

## Purpose
Ensure changes to production systems are planned, tested, approved, and documented.

## Scope
All changes to:
- Application code
- Database schema
- Infrastructure configuration
- Security controls
- Third-party integrations

## Change Types

### Standard Change (Pre-Approved)
**Examples**:
- Bug fixes
- Content updates
- Configuration tweaks within documented parameters

**Approval**: Engineering Manager
**Testing**: Staging environment required
**Downtime**: None expected

---

### Normal Change (Requires Approval)
**Examples**:
- New features
- Database migrations
- Dependency updates
- Performance optimizations

**Approval**: Engineering Manager + CTO
**Testing**: Staging + QA review
**Downtime**: May require brief maintenance window

---

### Emergency Change (Fast-Track)
**Examples**:
- Security patches
- Critical bug fixes
- Service outage resolution

**Approval**: CTO (verbal approval acceptable, document after)
**Testing**: Minimal (production hotfix)
**Downtime**: During incident response

---

## Change Process

### 1. Plan Change
```
Change Request Form:
- Requestor: [Name]
- Type: [Standard|Normal|Emergency]
- Description: [What is changing]
- Justification: [Why this change is needed]
- Risk Assessment: [What could go wrong]
- Rollback Plan: [How to undo if fails]
- Testing Plan: [How to verify success]
- Scheduled For: [Date/Time]
```

### 2. Review Change
```
Review Checklist:
[ ] Change clearly described
[ ] Business justification provided
[ ] Risks identified and mitigated
[ ] Testing plan adequate
[ ] Rollback plan documented
[ ] Approvers identified
[ ] Maintenance window (if needed) scheduled
```

### 3. Approve Change
```
Approval Matrix:
Standard Change: Engineering Manager
Normal Change: Engineering Manager + CTO
Emergency Change: CTO (can approve verbally)

Approval Criteria:
- Risks acceptable
- Testing plan adequate
- Resources available
- No conflicting changes
```

### 4. Test Change
```
Staging Environment Testing:
1. Deploy to staging
2. Run automated tests
3. Manual QA testing
4. Load testing (if applicable)
5. Security testing (if applicable)
6. Document test results

Acceptance Criteria:
- All tests pass
- No new errors in logs
- Performance metrics acceptable
- Security scan clean
```

### 5. Implement Change
```
Deployment Checklist:
[ ] Backup database (if schema change)
[ ] Notify team of deployment
[ ] Create deployment tag in Git
[ ] Deploy to production (Railway auto-deploy or manual)
[ ] Monitor logs during deployment
[ ] Test critical functionality
[ ] Verify no errors
[ ] Document deployment time
```

### 6. Verify Change
```
Post-Deployment Verification:
- Health check endpoints return 200 OK
- Key user journeys work (manual test)
- No new errors in logs
- Performance metrics normal
- User reports no issues

Verification Time: 1 hour post-deployment
```

### 7. Document Change
```
Change Record:
- Change ID: CHG-YYYYMMDD-NNN
- Date/Time: YYYY-MM-DD HH:MM UTC
- Deployed By: [Name]
- Git Commit: [SHA]
- Success: [Yes/No]
- Issues: [Any issues encountered]
- Rollback: [Did we rollback? Why?]
```

---

## Emergency Change Procedures

```
Emergency Fast-Track:
1. Identify critical issue
2. Verbal approval from CTO
3. Create hotfix branch
4. Minimal testing (smoke test)
5. Deploy to production
6. Monitor closely (1 hour)
7. Document change after (within 24 hours)

When to Use Emergency Process:
- Production outage
- Active security breach
- Data loss in progress
- Critical business impact

When NOT to Use:
- "Urgent" feature request (not emergency)
- Routine bug fix (use normal process)
- Convenience (lack of planning)
```

---

## Rollback Procedures

### Code Rollback
```bash
# Rollback to previous deployment
railway rollback

# Or rollback to specific version
git revert HEAD
git push railway main
```

### Database Migration Rollback
```sql
-- Run rollback migration (007_rollback.sql)
BEGIN;
  -- Drop new columns
  -- Restore old policies
  -- Revert schema changes
COMMIT;
```

### Configuration Rollback
```bash
# Revert environment variable change
railway vars set VARIABLE_NAME="old_value"

# Restart services to pick up change
railway restart
```

---

## Change Calendar

```
Maintenance Windows:
- Preferred: Sunday 2:00-4:00 AM UTC (low traffic)
- Emergency: Any time (if critical)

Change Freeze Periods:
- Major holidays: No non-emergency changes
- End of quarter: Minimize changes (financial reporting)
- During incidents: Only changes related to resolution

Blackout Dates:
- [Holiday 1]: YYYY-MM-DD
- [Holiday 2]: YYYY-MM-DD
```

---

## Metrics and Reporting

### Change Metrics
```
Track Monthly:
- Total changes: [count]
- Standard: [count]
- Normal: [count]
- Emergency: [count]
- Successful: [%]
- Rolled back: [%]
- Average time to deploy: [minutes]

Change Failure Rate Target: <5%
Rollback Rate Target: <10%
```
```

---

### 3.5 Vendor Management Policy

```markdown
# Vendor Management Policy
Version: 1.0

## Purpose
Establish criteria for selecting, evaluating, and managing third-party vendors who process OgelBase data or provide critical services.

## Vendor Classification

### Critical Vendors (Highest Risk)
**Definition**: Has access to customer data or provides essential services

**Examples**:
- Railway (infrastructure provider)
- AWS/GCP (if Railway backend uses)
- Monitoring services (if they receive logs with PII)

**Requirements**:
- Security questionnaire completed
- SOC 2 report reviewed (if available)
- Data Processing Agreement (DPA) signed
- Reviewed annually

---

### Important Vendors (Medium Risk)
**Definition**: Provides important but not critical services, limited data access

**Examples**:
- GitHub (code hosting)
- Sentry (error tracking)
- Analytics platforms (if implemented)

**Requirements**:
- Security questionnaire completed
- Privacy policy reviewed
- DPA signed
- Reviewed every 2 years

---

### Low-Risk Vendors
**Definition**: No access to customer data, non-critical services

**Examples**:
- Design tools (Figma)
- Project management (Jira, Linear)
- Communication (Slack)

**Requirements**:
- Terms of Service reviewed
- No security assessment required
- Reviewed as needed

---

## Vendor Assessment Process

### Step 1: Security Questionnaire
```
Vendor Security Questionnaire:

1. Data Security
   [ ] How is data encrypted in transit?
   [ ] How is data encrypted at rest?
   [ ] Where is data stored geographically?
   [ ] Who has access to our data?
   [ ] How is access controlled and logged?

2. Compliance
   [ ] SOC 2 Type II certified?
   [ ] ISO 27001 certified?
   [ ] GDPR compliant?
   [ ] HIPAA compliant? (if needed)
   [ ] Other certifications?

3. Incident Response
   [ ] Incident response plan in place?
   [ ] How are customers notified of breaches?
   [ ] What is SLA for breach notification?
   [ ] Have you had any breaches? (disclose)

4. Business Continuity
   [ ] Backup procedures documented?
   [ ] Disaster recovery plan tested?
   [ ] What is RTO and RPO?
   [ ] Uptime SLA?

5. Subprocessors
   [ ] List all subprocessors
   [ ] How are subprocessors vetted?
   [ ] Can customer veto subprocessors?
```

### Step 2: Risk Assessment
```
Vendor Risk Matrix:
Risk = Impact × Likelihood

Impact:
- Critical: Access to large amounts of customer data
- High: Access to limited customer data
- Medium: Access to internal data only
- Low: No access to sensitive data

Likelihood:
- High: History of breaches, poor security practices
- Medium: Unknown security posture
- Low: SOC 2 certified, good reputation

Action Based on Risk:
- Critical/High: Reject vendor OR require extensive mitigation
- Medium: Accept with monitoring
- Low: Accept with standard contract
```

### Step 3: Contract Negotiation
```
Required Contract Terms:

1. Data Processing Agreement (DPA)
   - Defines data processing terms
   - GDPR Article 28 compliant
   - Specifies data retention and deletion
   - Requires security measures

2. Service Level Agreement (SLA)
   - Defines uptime commitments
   - Response time for issues
   - Penalties for SLA violations
   - Termination rights

3. Liability and Indemnification
   - Vendor liability for breaches
   - Indemnification for third-party claims
   - Insurance requirements
   - Limitation of liability

4. Termination and Data Return
   - Termination for cause
   - Data return procedures
   - Data deletion certification
   - Transition assistance
```

---

## Specific Vendor Assessments

### Railway (Infrastructure Provider)

**Vendor Category**: Critical

**Data Processed**:
- All customer data (database)
- Application logs (may contain PII)
- Environment variables (secrets)
- Deployment artifacts (code)

**Security Assessment**:
```
Railway Security Posture:
✅ Encryption at rest: Yes (database, backups)
✅ Encryption in transit: Yes (TLS 1.3)
✅ Access control: Team-based RBAC
✅ Audit logging: Deployment logs, access logs
✅ Uptime SLA: 99.9%
⚠️ SOC 2: Unknown (check with Railway)
❌ HIPAA BAA: Not provided by Railway

Risk Level: MEDIUM (good security, no HIPAA BAA)

Mitigation:
- Use Railway private network (reduce attack surface)
- Encrypt sensitive data at application level
- Regular security reviews of Railway configuration
- Monitor Railway status page for incidents

Acceptance: CONDITIONAL
- Acceptable for non-HIPAA workloads
- NOT acceptable for HIPAA without BAA
- Review annually
```

**Data Processing Agreement**:
- Railway Terms of Service apply
- Railway Privacy Policy reviewed: [Date]
- DPA status: [Check if Railway provides DPA]
- Review date: [YYYY-MM-DD]

**Monitoring**:
- Monthly: Review Railway security announcements
- Quarterly: Review Railway service performance
- Annually: Reassess Railway security posture

---

### GitHub (Code Hosting)

**Vendor Category**: Important

**Data Processed**:
- Source code (may contain secrets if misconfigured)
- Issue descriptions (may contain customer info)
- Pull request discussions
- Commit history

**Security Assessment**:
```
GitHub Security Posture:
✅ SOC 2 Type II certified
✅ ISO 27001 certified
✅ Encryption at rest and in transit
✅ 2FA enforcement available
✅ Audit logging
✅ GDPR compliant

Risk Level: LOW

Mitigation:
- Enable 2FA for all team members ✅
- Use branch protection rules
- Scan for secrets in commits (GitHub Advanced Security)
- No customer data in issues or PRs

Acceptance: APPROVED
```

---

## Vendor Monitoring

### Ongoing Monitoring
```
Monthly:
- Review vendor security announcements
- Check for new security incidents
- Monitor service performance

Quarterly:
- Review vendor SLA compliance
- Check for compliance cert renewals
- Review access logs (if available)

Annually:
- Re-evaluate vendor risk
- Update security questionnaire
- Review and renew contracts
- Check for alternative vendors
```

### Incident Response
```
If Vendor Has Breach:
1. Vendor notifies us (per contract)
2. Assess impact to OgelBase
3. Determine if our customer data affected
4. If yes: Trigger our incident response plan
5. If yes: Notify affected customers (GDPR 72 hours)
6. Document incident
7. Re-evaluate vendor relationship
```

---

## Vendor Offboarding

```
When Terminating Vendor:
1. Export all data from vendor
2. Verify data completeness
3. Request data deletion from vendor
4. Request deletion certification
5. Revoke vendor access to our systems
6. Update documentation
7. Transition to new vendor (if applicable)

Data Deletion Verification:
- Request signed certificate of deletion
- Specify deletion timeline (e.g., 30 days)
- Include backups in deletion request
- Document completion
```

---

## Vendor List (Current)

### Critical Vendors
| Vendor | Service | Data Access | Risk | Review Date |
|--------|---------|-------------|------|-------------|
| Railway | Infrastructure | All data | Medium | YYYY-MM-DD |

### Important Vendors
| Vendor | Service | Data Access | Risk | Review Date |
|--------|---------|-------------|------|-------------|
| GitHub | Code hosting | Source code | Low | YYYY-MM-DD |
| [Others] | [Service] | [Access] | [Risk] | [Date] |

### Low-Risk Vendors
| Vendor | Service | Review Date |
|--------|---------|-------------|
| [Tool 1] | [Purpose] | YYYY-MM-DD |
```

---

## Part 4: Audit Logging Strategy (Zero-Knowledge Compatible)

This is the critical section where security meets zero-knowledge architecture. The challenge: comprehensive audit logging WITHOUT compromising the zero-knowledge guarantee.

### 4.1 The Audit Logging Paradox

**The Problem**:
```
SOC 2 Requires: Log all data access
Zero-Knowledge Requires: Never see plaintext data

These requirements conflict!

Example Conflict:
SOC 2: "Log when user accesses medical record #12345"
Zero-Knowledge: "Cannot log what's IN medical record #12345"

Resolution: Log METADATA, not CONTENT
```

### 4.2 What to Log (METADATA ONLY)

**Safe to Log** (Doesn't violate zero-knowledge):
```sql
-- Authentication Events
{
  "event": "login_success",
  "user_id": "uuid",
  "timestamp": "2025-11-22T10:30:00Z",
  "ip_address": "203.0.113.42",
  "user_agent": "Mozilla/5.0...",
  "session_id": "hashed_session_token"
}

-- Data Access Patterns (NO CONTENT)
{
  "event": "record_accessed",
  "user_id": "uuid",
  "resource_type": "project",
  "resource_id": "project_uuid",
  "action": "SELECT",
  "timestamp": "2025-11-22T10:31:00Z",
  "row_count": 1
  -- ❌ DO NOT LOG: record contents
}

-- Administrative Actions
{
  "event": "user_role_changed",
  "admin_user_id": "uuid",
  "target_user_id": "uuid",
  "old_role": "member",
  "new_role": "owner",
  "timestamp": "2025-11-22T10:32:00Z"
}

-- Security Events
{
  "event": "failed_login",
  "attempted_email": "user@example.com",  -- OK to log
  "ip_address": "203.0.113.42",
  "timestamp": "2025-11-22T10:33:00Z",
  "failure_reason": "invalid_password",
  "attempt_count": 3
}
```

**NEVER Log** (Violates zero-knowledge):
```sql
-- ❌ Record contents
"password": "plaintext_password"
"credit_card": "4111-1111-1111-1111"
"medical_record": "Patient has condition X"

-- ❌ Encrypted payloads (still sensitive)
"encrypted_data": "AES-256-GCM-ciphertext..."

-- ❌ Decryption keys
"encryption_key": "base64_key_material"
"jwt_secret": "secret_value"
```

### 4.3 Audit Log Database Schema

```sql
-- Create audit log table in platform schema
CREATE TABLE IF NOT EXISTS platform.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who did it
    actor_user_id UUID REFERENCES platform.users(id) ON DELETE SET NULL,
    actor_ip_address INET,
    actor_user_agent TEXT,

    -- What happened
    event_type TEXT NOT NULL,  -- 'login', 'data_access', 'admin_action', etc.
    event_category TEXT NOT NULL,  -- 'authentication', 'authorization', 'data', 'admin'
    action TEXT NOT NULL,  -- 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', etc.

    -- What was affected (METADATA ONLY, NO CONTENT)
    resource_type TEXT,  -- 'user', 'organization', 'project', 'credential'
    resource_id UUID,  -- ID of affected resource
    resource_metadata JSONB,  -- Additional context (NO SENSITIVE DATA)

    -- When
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Context
    session_id TEXT,  -- Hashed session token
    request_id UUID,  -- Correlation ID for distributed tracing
    organization_id UUID REFERENCES platform.organizations(id) ON DELETE SET NULL,

    -- Result
    success BOOLEAN NOT NULL,
    error_message TEXT,  -- If failed, what was the error

    -- Compliance
    compliance_relevant BOOLEAN DEFAULT FALSE,  -- Flag for auditor review
    retention_until TIMESTAMPTZ  -- When this log can be deleted (GDPR)
);

-- Indexes for performance
CREATE INDEX idx_audit_log_timestamp ON platform.audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_user ON platform.audit_log(actor_user_id, timestamp DESC);
CREATE INDEX idx_audit_log_org ON platform.audit_log(organization_id, timestamp DESC);
CREATE INDEX idx_audit_log_event_type ON platform.audit_log(event_type, timestamp DESC);
CREATE INDEX idx_audit_log_resource ON platform.audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_compliance ON platform.audit_log(compliance_relevant, timestamp DESC)
    WHERE compliance_relevant = TRUE;

-- Partition by month for performance (optional, for high-volume logs)
-- CREATE TABLE platform.audit_log_2025_11 PARTITION OF platform.audit_log
--     FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
```

### 4.4 Automatic Audit Logging (Database Triggers)

**WARNING**: These triggers will fire on EVERY query. Test performance impact!

```sql
-- Function to log data access
CREATE OR REPLACE FUNCTION platform.log_data_access()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if session variable is set (user context available)
    IF current_setting('app.current_user_id', true) IS NOT NULL THEN
        INSERT INTO platform.audit_log (
            actor_user_id,
            event_type,
            event_category,
            action,
            resource_type,
            resource_id,
            resource_metadata,
            session_id,
            organization_id,
            success,
            compliance_relevant
        ) VALUES (
            current_setting('app.current_user_id', true)::UUID,
            TG_OP || '_' || TG_TABLE_NAME,
            'data',
            TG_OP,  -- 'INSERT', 'UPDATE', 'DELETE'
            TG_TABLE_NAME,
            COALESCE(NEW.id, OLD.id),  -- Resource ID
            jsonb_build_object(
                'table', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
                'operation', TG_OP
                -- ❌ DO NOT include OLD or NEW row data (contains sensitive info)
            ),
            current_setting('app.session_id', true),
            current_setting('app.current_org_id', true)::UUID,
            TRUE,
            TRUE  -- Flag as compliance-relevant
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to sensitive tables
CREATE TRIGGER audit_credentials_changes
    AFTER INSERT OR UPDATE OR DELETE ON platform.credentials
    FOR EACH ROW
    EXECUTE FUNCTION platform.log_data_access();

CREATE TRIGGER audit_users_changes
    AFTER INSERT OR UPDATE OR DELETE ON platform.users
    FOR EACH ROW
    EXECUTE FUNCTION platform.log_data_access();

-- Add to other sensitive tables as needed
-- CREATE TRIGGER audit_projects_changes...
```

### 4.5 Application-Level Audit Logging

**When to use application logging vs database triggers**:
- **Database triggers**: Data modifications (INSERT/UPDATE/DELETE)
- **Application logging**: Authentication, authorization, API calls

```typescript
// apps/studio/lib/api/audit-logger.ts

export enum AuditEventType {
  // Authentication
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  SESSION_EXPIRED = 'session_expired',
  PASSWORD_RESET = 'password_reset',

  // Authorization
  ACCESS_DENIED = 'access_denied',
  PERMISSION_ESCALATION = 'permission_escalation',

  // Data Access
  DATA_EXPORT = 'data_export',
  DATA_IMPORT = 'data_import',
  BULK_OPERATION = 'bulk_operation',

  // Administration
  USER_CREATED = 'user_created',
  USER_DELETED = 'user_deleted',
  ORG_CREATED = 'org_created',
  ROLE_CHANGED = 'role_changed',

  // Security
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  INVALID_TOKEN = 'invalid_token'
}

export interface AuditLogEntry {
  actorUserId?: string
  actorIpAddress?: string
  actorUserAgent?: string
  eventType: AuditEventType
  eventCategory: 'authentication' | 'authorization' | 'data' | 'admin' | 'security'
  action: string
  resourceType?: string
  resourceId?: string
  resourceMetadata?: Record<string, any>  // ❌ NO SENSITIVE DATA
  sessionId?: string
  requestId?: string
  organizationId?: string
  success: boolean
  errorMessage?: string
  complianceRelevant?: boolean
}

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    await queryPlatformDatabase({
      query: `
        INSERT INTO platform.audit_log (
          actor_user_id, actor_ip_address, actor_user_agent,
          event_type, event_category, action,
          resource_type, resource_id, resource_metadata,
          session_id, request_id, organization_id,
          success, error_message, compliance_relevant
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
      `,
      parameters: [
        entry.actorUserId || null,
        entry.actorIpAddress || null,
        entry.actorUserAgent || null,
        entry.eventType,
        entry.eventCategory,
        entry.action,
        entry.resourceType || null,
        entry.resourceId || null,
        entry.resourceMetadata ? JSON.stringify(entry.resourceMetadata) : null,
        entry.sessionId || null,
        entry.requestId || null,
        entry.organizationId || null,
        entry.success,
        entry.errorMessage || null,
        entry.complianceRelevant || false
      ]
    })
  } catch (error) {
    // ❌ DO NOT throw - audit logging failures should not break application
    console.error('Failed to log audit event:', error)
    // TODO: Send to external logging service (Datadog, Splunk)
  }
}
```

**Usage in API Routes**:

```typescript
// apps/studio/pages/api/platform/auth/login.ts

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { email, password } = req.body
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress
  const userAgent = req.headers['user-agent']

  try {
    // Attempt login
    const session = await authenticateUser(email, password)

    // ✅ Log successful login
    await logAuditEvent({
      actorUserId: session.userId,
      actorIpAddress: ipAddress as string,
      actorUserAgent: userAgent,
      eventType: AuditEventType.LOGIN_SUCCESS,
      eventCategory: 'authentication',
      action: 'LOGIN',
      sessionId: hashSessionToken(session.token),
      success: true,
      complianceRelevant: true
    })

    return res.status(200).json({ token: session.token })

  } catch (error) {
    // ✅ Log failed login attempt
    await logAuditEvent({
      actorIpAddress: ipAddress as string,
      actorUserAgent: userAgent,
      eventType: AuditEventType.LOGIN_FAILED,
      eventCategory: 'authentication',
      action: 'LOGIN',
      resourceMetadata: {
        email,  // ✅ OK to log email in failed attempt
        reason: error.message
      },
      success: false,
      errorMessage: error.message,
      complianceRelevant: true
    })

    return res.status(401).json({ error: 'Invalid credentials' })
  }
}
```

### 4.6 Audit Log Retention and Archival

**Retention Requirements**:
```
SOC 2: Audit logs must be retained for at least 1 year
HIPAA: Audit logs must be retained for 6 years
GDPR: Logs containing personal data must be deletable upon request

OgelBase Policy:
- Hot storage (PostgreSQL): 90 days (queryable)
- Warm storage (S3): 1 year (archived, retrievable)
- Cold storage (S3 Glacier): 6 years (compliance archive)
- After 6 years: Permanently deleted
```

**Archival Process**:

```sql
-- Monthly job: Archive logs older than 90 days to S3
CREATE OR REPLACE FUNCTION platform.archive_old_audit_logs()
RETURNS void AS $$
DECLARE
  archive_date TIMESTAMPTZ := NOW() - INTERVAL '90 days';
  archived_count INTEGER;
BEGIN
  -- Export to JSON (to be uploaded to S3)
  -- This would be done by application code, not SQL

  -- Delete archived logs from hot storage
  DELETE FROM platform.audit_log
  WHERE timestamp < archive_date
    AND compliance_relevant = FALSE;  -- Keep compliance-relevant logs longer

  GET DIAGNOSTICS archived_count = ROW_COUNT;

  RAISE NOTICE 'Archived % audit log entries', archived_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule via cron or application scheduler
-- Apps should export logs to S3 before calling this function
```

**S3 Archive Structure**:
```
s3://ogelbase-audit-logs/
  2025/
    11/
      audit_log_2025-11-01.json.gz
      audit_log_2025-11-02.json.gz
      ...
```

### 4.7 Audit Log Analysis and Reporting

**SOC 2 Audit Queries** (What auditors will ask for):

```sql
-- 1. Authentication events for specific user
SELECT
  timestamp,
  event_type,
  actor_ip_address,
  success
FROM platform.audit_log
WHERE actor_user_id = 'specific-user-uuid'
  AND event_category = 'authentication'
ORDER BY timestamp DESC
LIMIT 100;

-- 2. Failed login attempts (potential brute force)
SELECT
  actor_ip_address,
  COUNT(*) as failed_attempts,
  MIN(timestamp) as first_attempt,
  MAX(timestamp) as last_attempt
FROM platform.audit_log
WHERE event_type = 'login_failed'
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY actor_ip_address
HAVING COUNT(*) > 5
ORDER BY failed_attempts DESC;

-- 3. Administrative actions (privileged operations)
SELECT
  au.timestamp,
  u.email as admin_email,
  au.event_type,
  au.action,
  au.resource_type,
  au.resource_metadata
FROM platform.audit_log au
JOIN platform.users u ON u.id = au.actor_user_id
WHERE au.event_category = 'admin'
  AND au.timestamp > NOW() - INTERVAL '90 days'
ORDER BY au.timestamp DESC;

-- 4. Data access by organization (tenant isolation verification)
SELECT
  o.name as organization,
  COUNT(*) as access_count,
  COUNT(DISTINCT au.actor_user_id) as unique_users
FROM platform.audit_log au
JOIN platform.organizations o ON o.id = au.organization_id
WHERE au.event_category = 'data'
  AND au.timestamp > NOW() - INTERVAL '30 days'
GROUP BY o.name
ORDER BY access_count DESC;

-- 5. Security events requiring investigation
SELECT
  timestamp,
  event_type,
  actor_user_id,
  actor_ip_address,
  resource_metadata
FROM platform.audit_log
WHERE event_category = 'security'
  AND timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;

-- 6. Compliance-relevant events for auditor review
SELECT
  timestamp,
  event_type,
  event_category,
  action,
  success,
  error_message
FROM platform.audit_log
WHERE compliance_relevant = TRUE
  AND timestamp BETWEEN '2025-01-01' AND '2025-12-31'
ORDER BY timestamp;
```

**Automated Anomaly Detection** (Future Enhancement):

```sql
-- Detect unusual access patterns
-- (This would be run by a scheduled job, alerts on anomalies)

-- Example: User accessing data outside normal hours
SELECT
  u.email,
  COUNT(*) as after_hours_access,
  ARRAY_AGG(DISTINCT au.timestamp::DATE) as dates
FROM platform.audit_log au
JOIN platform.users u ON u.id = au.actor_user_id
WHERE au.event_category = 'data'
  AND EXTRACT(HOUR FROM au.timestamp) NOT BETWEEN 6 AND 22  -- Outside 6am-10pm
  AND au.timestamp > NOW() - INTERVAL '30 days'
GROUP BY u.email
HAVING COUNT(*) > 10  -- More than 10 after-hours accesses
ORDER BY after_hours_access DESC;
```

### 4.8 Audit Logging Compliance Checklist

**For SOC 2 Auditor**:

```markdown
[ ] Audit logs capture all authentication events
[ ] Audit logs capture all privileged operations
[ ] Audit logs capture data access patterns (metadata only)
[ ] Audit logs are tamper-proof (immutable table)
[ ] Audit logs retained for minimum 1 year
[ ] Audit log access is restricted (read-only for auditors)
[ ] Audit logs reviewed weekly by security team
[ ] Anomalous activity triggers alerts
[ ] Log retention policy documented
[ ] Log archival process tested quarterly
```

**For HIPAA Auditor**:

```markdown
[ ] Audit logs capture all ePHI access attempts
[ ] Audit logs include user ID, timestamp, action
[ ] Audit logs do NOT contain ePHI content (metadata only)
[ ] Audit logs retained for 6 years
[ ] Audit log access restricted to authorized personnel
[ ] Audit logs reviewed regularly (weekly)
[ ] Suspicious activity documented and investigated
[ ] Audit trail cannot be disabled by users
[ ] Audit log backup and recovery tested
```

---

## Part 5: Penetration Testing & Vulnerability Management

### 5.1 Why Penetration Testing Matters for Compliance

Both SOC 2 and HIPAA require regular security testing:

**SOC 2 CC7.1**: "The entity uses detection and monitoring procedures to identify anomalies."

**HIPAA §164.308(a)(8)**: "Conduct periodic technical and nontechnical evaluation...in response to environmental or operational changes."

Translation: **You must test your security controls actually work**.

### 5.2 Penetration Testing Approach for Railway Deployment

**Challenge**: Railway is a PaaS (Platform as a Service). You don't control the infrastructure.

**What You CAN Test**:
- Application vulnerabilities (SQL injection, XSS, CSRF)
- API authentication/authorization
- Session management
- Business logic flaws
- RLS policy enforcement (when active)

**What You CANNOT Test** (Railway's responsibility):
- Infrastructure vulnerabilities
- Hypervisor escape
- Physical security
- Network infrastructure

---

### 5.3 Penetration Testing Roadmap

**Phase 1: Automated Scanning (Monthly)**

Tools:
- **OWASP ZAP**: Free, open-source web app scanner
- **npm audit**: Check for vulnerable dependencies
- **Snyk**: Automated dependency scanning

```bash
# Install OWASP ZAP
docker pull zaproxy/zap-stable

# Run baseline scan against staging
docker run -t zaproxy/zap-stable zap-baseline.py \
  -t https://studio-staging.up.railway.app \
  -r zap-report.html

# Check for vulnerable npm packages
npm audit --production

# Or use Snyk (integrates with GitHub)
snyk test
```

**Phase 2: Manual Testing (Quarterly)**

Focus Areas:
1. **Authentication**
   - Test password complexity enforcement
   - Test MFA bypass attempts
   - Test session fixation
   - Test JWT token tampering
   - Test brute force protection

2. **Authorization**
   - Test horizontal privilege escalation (access other user's data)
   - Test vertical privilege escalation (member → owner)
   - Test org switching boundary violations
   - Test API endpoint authorization

3. **Input Validation**
   - Test SQL injection (all parameters)
   - Test XSS (reflected, stored, DOM-based)
   - Test command injection
   - Test file upload vulnerabilities

4. **Session Management**
   - Test session timeout enforcement
   - Test concurrent session limits
   - Test logout functionality
   - Test session token randomness

5. **Business Logic**
   - Test payment/billing bypass
   - Test rate limiting enforcement
   - Test data export limits
   - Test multi-tenant isolation

**Test Scenarios for Multi-Tenant Security**:

```typescript
// Scenario 1: Horizontal Privilege Escalation
// User A tries to access User B's organization

// User A's valid token
const userAToken = "eyJhbGci...";  // User A's JWT

// Try to access User B's org (slug: "other-org")
const response = await fetch("https://api/platform/organizations/other-org", {
  headers: { Authorization: `Bearer ${userAToken}` }
});

// Expected: 403 Forbidden
// Actual: [Test and document]

---

// Scenario 2: RLS Policy Bypass (when RLS active)
// User tries to directly query database (if they somehow got access)

// Attempt SQL injection to bypass RLS
const maliciousQuery = "'; DROP TABLE users; --";
const response = await fetch("/api/platform/projects", {
  method: "POST",
  body: JSON.stringify({ name: maliciousQuery }),
  headers: { Authorization: `Bearer ${validToken}` }
});

// Expected: 400 Bad Request (input validation) OR safe parameterization
// Actual: [Test and document]

---

// Scenario 3: JWT Token Tampering
// Modify JWT claims to escalate privileges

import jwt from 'jsonwebtoken';

// Decode token without verification
const decodedToken = jwt.decode(validToken);
console.log(decodedToken);
// { userId: "uuid", email: "user@example.com", iat: ..., exp: ... }

// Attempt to modify and re-sign with different key
const tamperedToken = jwt.sign(
  { userId: decodedToken.userId, email: "admin@example.com" },
  "guessed-secret"  // Try to guess JWT_SECRET
);

const response = await fetch("/api/platform/profile", {
  headers: { Authorization: `Bearer ${tamperedToken}` }
});

// Expected: 401 Unauthorized (signature verification fails)
// Actual: [Test and document]
```

**Phase 3: External Penetration Test (Annually)**

**When to Engage External Pentesters**:
- Before major product launch
- After significant architecture changes
- Annual compliance requirement (SOC 2, HIPAA)
- After security incident (verify fixes)

**Choosing a Pentest Firm**:
```
Requirements:
- Experience with web applications
- Experience with multi-tenant SaaS
- SOC 2 / HIPAA experience (if seeking compliance)
- References from similar companies
- Clear deliverables (executive summary + technical report)

Cost: $10k-30k for web app pentest (depends on scope)
Duration: 1-2 weeks testing + 1 week report
```

**Pentest Scope Document**:
```markdown
# Penetration Test Scope

## In Scope
- Web application: studio.ogelbase.com
- API endpoints: api.ogelbase.com
- Authentication and authorization mechanisms
- Session management
- Multi-tenant isolation
- Data access controls

## Out of Scope
- Railway infrastructure (PaaS provider)
- Social engineering
- Physical security
- Denial of service testing (would affect production)
- Third-party dependencies (unless direct exploit)

## Rules of Engagement
- Test only against staging environment
- No testing during business hours (9am-5pm UTC)
- Stop testing if service impact detected
- Report critical vulnerabilities within 24 hours
- Final report due 1 week after testing

## Credentials Provided
- Test user accounts (3 different roles)
- Test API tokens
- Test organization with sample data
```

---

### 5.4 Vulnerability Management Process

**When Vulnerabilities Are Discovered**:

```markdown
# Vulnerability Severity Levels

## Critical (P0)
**Definition**: Immediate risk of data breach or system compromise

**Examples**:
- SQL injection allowing database access
- Authentication bypass
- RLS policy bypass (when active)
- Hardcoded credentials in code

**Response Time**: Fix within 24 hours
**Disclosure**: Notify customers after patch deployed

---

## High (P1)
**Definition**: Significant security risk requiring immediate attention

**Examples**:
- XSS allowing session theft
- CSRF on sensitive operations
- Privilege escalation
- Sensitive data exposure

**Response Time**: Fix within 7 days
**Disclosure**: Include in monthly security bulletin

---

## Medium (P2)
**Definition**: Security weakness with lower risk

**Examples**:
- Missing security headers
- Information disclosure (version numbers)
- Weak password policy
- Deprecated crypto algorithms

**Response Time**: Fix within 30 days
**Disclosure**: Include in quarterly security review

---

## Low (P3)
**Definition**: Minor security issue or best practice

**Examples**:
- Verbose error messages
- Unnecessary HTTP methods enabled
- Missing rate limiting on non-sensitive endpoints

**Response Time**: Fix when convenient (next sprint)
**Disclosure**: Not required
```

**Vulnerability Tracking**:

```markdown
# Vulnerability Record Template

**ID**: VULN-YYYYMMDD-NNN
**Title**: [Brief description]
**Severity**: [Critical|High|Medium|Low]
**Status**: [Open|In Progress|Resolved|Accepted Risk]

## Description
[Detailed description of vulnerability]

## Impact
[What could an attacker do with this vulnerability?]

## Affected Components
- [Component 1]
- [Component 2]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Observe vulnerability]

## Remediation
[How to fix the vulnerability]

## Acceptance Criteria
- [ ] Vulnerability fixed in code
- [ ] Fix tested and verified
- [ ] Regression test added
- [ ] Deployed to production
- [ ] Retested after deployment

## Timeline
- Discovered: YYYY-MM-DD
- Assigned: YYYY-MM-DD
- Fixed: YYYY-MM-DD
- Deployed: YYYY-MM-DD
- Verified: YYYY-MM-DD

## References
- [CVE number if applicable]
- [Related vulnerabilities]
- [Documentation]
```

---

### 5.5 Secure SDLC (Software Development Lifecycle)

**Shift Left Security** (Find vulnerabilities BEFORE production):

```markdown
# Security Gates in Development Pipeline

## 1. Developer Workstation
**Tools**:
- ESLint security plugin (detect common bugs)
- Git secrets scanning (prevent committing secrets)
- IDE security hints (VS Code extensions)

**Actions**:
- Pre-commit hooks check for secrets
- Linter runs on every save
- Warnings about security anti-patterns

---

## 2. Pull Request
**Tools**:
- GitHub Code Scanning (CodeQL)
- Snyk vulnerability scan
- OWASP Dependency Check

**Actions**:
- Automated security review comments
- Block merge if critical vulnerabilities found
- Require security review for auth/crypto changes

---

## 3. CI/CD Pipeline
**Tools**:
- SAST (Static Application Security Testing): Semgrep
- Dependency scanning: npm audit, Snyk
- License compliance: license-checker

**Actions**:
- Run security tests on every push
- Generate security report
- Fail build if critical issues found

---

## 4. Staging Deployment
**Tools**:
- DAST (Dynamic Application Security Testing): OWASP ZAP
- Manual security testing
- Penetration testing (quarterly)

**Actions**:
- Automated vulnerability scan
- Manual testing for business logic flaws
- Verify security controls operational

---

## 5. Production Deployment
**Tools**:
- Runtime protection: (future) WAF, RASP
- Monitoring: Audit logs, security alerts
- Incident detection: SIEM (future)

**Actions**:
- Gradual rollout (canary deployment)
- Monitor error rates and security alerts
- Rollback if security issues detected

---

## 6. Post-Deployment
**Tools**:
- Bug bounty program (future)
- External pentests (annual)
- Vulnerability disclosure program

**Actions**:
- Continuous monitoring
- Respond to security reports
- Regular security reviews
```

---

### 5.6 Penetration Testing Checklist (Quarterly)

```markdown
# Quarterly Penetration Test Checklist

## Preparation
[ ] Schedule testing window (off-hours)
[ ] Backup production database (in case of accidental impact)
[ ] Notify team of testing
[ ] Prepare staging environment with production-like data
[ ] Document test scenarios

## Authentication Testing
[ ] Test password complexity enforcement
[ ] Test account lockout after failed attempts
[ ] Test MFA bypass attempts
[ ] Test session fixation
[ ] Test JWT token tampering
[ ] Test JWT signature verification
[ ] Test password reset flow
[ ] Test remember me functionality

## Authorization Testing
[ ] Test horizontal privilege escalation (user A → user B data)
[ ] Test vertical privilege escalation (member → owner)
[ ] Test org switching boundary violations
[ ] Test API endpoint authorization (all endpoints)
[ ] Test RLS policy enforcement (if active)
[ ] Test service role authorization (admin endpoints)

## Input Validation Testing
[ ] Test SQL injection (all input fields)
[ ] Test XSS (reflected, stored, DOM-based)
[ ] Test command injection
[ ] Test path traversal
[ ] Test file upload vulnerabilities
[ ] Test JSON parsing exploits
[ ] Test XML external entity (XXE)
[ ] Test SSRF (Server-Side Request Forgery)

## Session Management Testing
[ ] Test session timeout enforcement (15 min)
[ ] Test concurrent session limits
[ ] Test logout functionality (token invalidation)
[ ] Test session fixation
[ ] Test session token randomness
[ ] Test session token in URL (should not be)

## Business Logic Testing
[ ] Test multi-tenant isolation
[ ] Test rate limiting enforcement
[ ] Test payment/billing logic
[ ] Test data export limits
[ ] Test bulk operations
[ ] Test organization deletion (cascading)

## Cryptography Testing
[ ] Test TLS configuration (SSL Labs scan)
[ ] Test certificate validation
[ ] Test weak cipher suites
[ ] Test JWT secret strength (should not be guessable)
[ ] Test password hashing (bcrypt with salt)

## API Security Testing
[ ] Test CORS configuration
[ ] Test API rate limiting
[ ] Test API authentication on all endpoints
[ ] Test API error handling (no sensitive info in errors)
[ ] Test API versioning

## Infrastructure Testing (Limited - Railway handles most)
[ ] Test for exposed services (should only be Railway URLs)
[ ] Test for default credentials
[ ] Test for information disclosure (headers, error pages)
[ ] Test for security headers (CSP, HSTS, X-Frame-Options)

## Post-Testing
[ ] Document all findings
[ ] Prioritize vulnerabilities by severity
[ ] Create tickets for remediation
[ ] Retest after fixes deployed
[ ] Update security documentation
[ ] Share learnings with team
```

---

### 5.7 Vulnerability Disclosure Policy (Future)

When ready for external security researchers:

```markdown
# Responsible Disclosure Policy

## Reporting Security Vulnerabilities

We welcome reports of security vulnerabilities in OgelBase. We ask that you follow responsible disclosure principles.

### How to Report
Email: security@ogelbase.com (create this email)
PGP Key: [Provide PGP public key for encrypted reports]

Include in your report:
- Description of vulnerability
- Steps to reproduce
- Impact assessment
- Proof of concept (if available)

### What to Expect
- Initial response within 48 hours
- Regular updates on remediation progress
- Recognition in security hall of fame (if desired)
- Bounty payment (if bug bounty program active)

### Rules of Engagement
✅ DO:
- Report vulnerabilities privately before public disclosure
- Give us reasonable time to fix (90 days)
- Test only against your own account

❌ DON'T:
- Access other users' data
- Perform DoS attacks
- Social engineer our employees
- Test against production (use staging if possible)

### Safe Harbor
We will not pursue legal action against researchers who:
- Follow this policy
- Act in good faith
- Don't cause harm
- Don't access unnecessary data

### Out of Scope
- Vulnerabilities in third-party services (Railway, GitHub, etc.)
- Social engineering attacks
- Physical security
- Denial of Service
- Spam or social engineering
```

---

## Part 6: Gap Analysis - Current vs Compliance Requirements

### 6.1 SOC 2 Gap Analysis

| SOC 2 Control | Required | Current State | Gap | Priority |
|---------------|----------|---------------|-----|----------|
| **Security (CC)** |
| CC1.1 - Board oversight | ✅ | ⚠️ Informal | Need formal security committee | 🟡 MEDIUM |
| CC1.2 - Security responsibilities | ✅ | ⚠️ Defined but not documented | Document in org chart | 🟡 MEDIUM |
| CC1.3 - Background checks | ✅ | ❌ Not implemented | Implement for employees with data access | 🔴 HIGH |
| CC2.1 - Security policies | ✅ | ⚠️ Partially documented | Complete all required policies | 🔴 HIGH |
| CC3.1 - Risk assessment | ✅ | ❌ Not conducted | Conduct formal risk assessment | 🔴 HIGH |
| CC4.1 - Security monitoring | ✅ | ⚠️ Basic monitoring | Implement comprehensive monitoring | 🟡 MEDIUM |
| CC5.1 - Access controls | ✅ | ✅ MFA, RBAC implemented | Minor: Document access matrix | 🟢 LOW |
| CC6.1 - Logical access | ✅ | ✅ Working | None | 🟢 DONE |
| CC7.1 - Anomaly detection | ✅ | ❌ Manual only | Implement automated anomaly detection | 🟡 MEDIUM |
| CC8.1 - Change management | ✅ | ⚠️ Git workflow exists | Document formal change procedures | 🟡 MEDIUM |
| CC9.1 - Network security | ✅ | ⚠️ Railway private network in progress | Complete private network migration | 🔴 HIGH |
| **Availability (A)** |
| A1.1 - Availability commitments | ✅ | ⚠️ Informal (99.5%) | Document SLA formally | 🟡 MEDIUM |
| A1.2 - Uptime monitoring | ✅ | ✅ Railway + external | None | 🟢 DONE |
| A1.3 - Incident response | ✅ | ⚠️ Informal procedures | Document formal incident response plan | 🔴 HIGH |
| **Processing Integrity (PI)** |
| PI1.1 - Data processing accuracy | ✅ | ✅ DB constraints, validation | None | 🟢 DONE |
| PI1.2 - Error detection | ✅ | ✅ Validation + logging | None | 🟢 DONE |
| **Confidentiality (C)** |
| C1.1 - Data classification | ✅ | ⚠️ Informal | Document data classification policy | 🟡 MEDIUM |
| C1.2 - Encryption at rest | ✅ | ✅ PostgreSQL encryption | None | 🟢 DONE |
| C1.3 - Encryption in transit | ✅ | ✅ TLS 1.3 | None | 🟢 DONE |
| **Privacy (P)** |
| P1.1 - Privacy notice | ✅ | ❌ Not published | Create and publish privacy policy | 🔴 HIGH |
| P2.1 - Choice and consent | ✅ | ❌ Not implemented | Implement consent management | 🟡 MEDIUM |
| P3.1 - Data minimization | ✅ | ✅ Collecting minimal data | None | 🟢 DONE |
| P4.1 - Data retention | ✅ | ⚠️ Informal | Document retention policy | 🟡 MEDIUM |
| P5.1 - User data access | ✅ | ❌ Not implemented | Implement data export API | 🟡 MEDIUM |
| P6.1 - Third-party disclosure | ✅ | ⚠️ Railway only | Document all third parties | 🟡 MEDIUM |

**Summary**:
- **DONE** (🟢): 9/32 controls (28%)
- **IN PROGRESS** (⚠️): 15/32 controls (47%)
- **NOT STARTED** (❌): 8/32 controls (25%)

**Estimated Time to SOC 2 Readiness**: 4-6 months (without certification audit)

---

### 6.2 HIPAA Gap Analysis

| HIPAA Requirement | Current State | Gap | Priority | Blocker |
|-------------------|---------------|-----|----------|---------|
| **Administrative Safeguards** |
| §164.308(a)(1)(i) - Risk analysis | ❌ Not conducted | Need formal healthcare risk analysis | 🔴 CRITICAL | Must do before handling ePHI |
| §164.308(a)(1)(ii)(A) - Risk management | ❌ Not implemented | Implement risk management process | 🔴 CRITICAL | Requires risk analysis first |
| §164.308(a)(1)(ii)(B) - Sanction policy | ❌ Not documented | Document policy violation procedures | 🟡 HIGH | None |
| §164.308(a)(2) - Assigned security responsibility | ✅ CTO is security officer | None | 🟢 DONE | None |
| §164.308(a)(3)(i) - Workforce security | ⚠️ Partially documented | Complete workforce security policy | 🟡 HIGH | None |
| §164.308(a)(3)(ii)(A) - Authorization | ⚠️ RBAC implemented | Document access authorization process | 🟡 MEDIUM | None |
| §164.308(a)(3)(ii)(B) - Workforce clearance | ❌ No background checks | Implement background check policy | 🟡 HIGH | None |
| §164.308(a)(3)(ii)(C) - Termination | ⚠️ Informal | Document termination procedures | 🟡 MEDIUM | None |
| §164.308(a)(4)(i) - Information access mgmt | ⚠️ RBAC + RLS (when active) | Complete RLS enforcement | 🔴 CRITICAL | Waiting on middleware |
| §164.308(a)(5)(i) - Security awareness | ❌ No training program | Create security training materials | 🟡 HIGH | None |
| §164.308(a)(6)(i) - Security incidents | ⚠️ Informal procedures | Document formal incident response plan | 🔴 CRITICAL | None |
| §164.308(a)(6)(ii) - Response and reporting | ⚠️ Informal | Document breach notification procedures | 🔴 CRITICAL | Legal review needed |
| §164.308(a)(7)(i) - Contingency plan | ⚠️ Railway backups exist | Document formal DR plan | 🟡 HIGH | None |
| §164.308(a)(7)(ii)(A) - Data backup | ✅ Railway daily backups | None | 🟢 DONE | None |
| §164.308(a)(7)(ii)(B) - Disaster recovery | ⚠️ Untested | Test and document DR procedures | 🟡 HIGH | None |
| §164.308(a)(7)(ii)(C) - Emergency mode | ❌ Not defined | Define emergency mode operations | 🟡 MEDIUM | None |
| §164.308(a)(7)(ii)(E) - Data criticality | ⚠️ Informal | Document data criticality analysis | 🟡 MEDIUM | None |
| §164.308(a)(8) - Periodic evaluation | ❌ Not scheduled | Schedule annual security evaluation | 🟡 HIGH | None |
| §164.308(b)(1) - Business associate contracts | ❌ **NO BAA WITH RAILWAY** | **CRITICAL BLOCKER** | 🔴 **SHOWSTOPPER** | Railway doesn't provide BAA |
| **Physical Safeguards** |
| §164.310(a)(1) - Facility access | ✅ Railway responsibility | None | 🟢 DONE | Railway handles |
| §164.310(b) - Workstation use | ⚠️ Informal policy | Document workstation security policy | 🟡 MEDIUM | None |
| §164.310(c) - Workstation security | ⚠️ Partially implemented | Enforce laptop encryption + security | 🟡 MEDIUM | None |
| §164.310(d)(1) - Device and media controls | ❌ Not documented | Document disposal procedures | 🟡 MEDIUM | None |
| **Technical Safeguards** |
| §164.312(a)(1) - Unique user IDs | ✅ Implemented | None | 🟢 DONE | None |
| §164.312(a)(2)(i) - Emergency access | ⚠️ Break-glass exists | Document emergency access procedures | 🟡 MEDIUM | None |
| §164.312(a)(2)(iii) - Auto logoff | ✅ 15-min session timeout | None | 🟢 DONE | None |
| §164.312(a)(2)(iv) - Encryption/decryption | ✅ TLS + DB encryption | None | 🟢 DONE | None |
| §164.312(b) - Audit controls | ⚠️ Partial audit logging | Implement comprehensive audit logging | 🔴 CRITICAL | See Section 4 |
| §164.312(c)(1) - Integrity controls | ✅ DB constraints + audit trail | None | 🟢 DONE | None |
| §164.312(c)(2) - Mechanism to authenticate | ⚠️ Audit triggers exist | Apply to all ePHI tables | 🟡 HIGH | None |
| §164.312(d) - Person/entity authentication | ✅ MFA + JWT | None | 🟢 DONE | None |
| §164.312(e)(1) - Transmission security | ✅ TLS 1.3 everywhere | None | 🟢 DONE | None |
| §164.312(e)(2)(i) - Integrity controls | ✅ TLS provides integrity | None | 🟢 DONE | None |
| §164.312(e)(2)(ii) - Encryption | ✅ TLS encryption | None | 🟢 DONE | None |

**Summary**:
- **DONE** (🟢): 10/33 requirements (30%)
- **IN PROGRESS** (⚠️): 16/33 requirements (49%)
- **NOT STARTED** (❌): 7/33 requirements (21%)
- **CRITICAL BLOCKER** (🔴): **Railway does not provide HIPAA BAA**

**HIPAA Compliance Status**: **NOT POSSIBLE** without Business Associate Agreement (BAA) from Railway

**Alternatives for HIPAA Workloads**:
1. **Supabase Platform** ($599/month + $350 HIPAA addon) - Provides BAA
2. **AWS/GCP with HIPAA BAA** - Self-host all services, get BAA from cloud provider
3. **Self-host on-premises** - Physical control, but expensive and complex

---

## Conclusion

### What We CAN Achieve on Railway:

✅ **Technical Controls**:
- All encryption requirements (TLS, database, application-level)
- Authentication and authorization (JWT, MFA, RBAC)
- Audit logging (comprehensive, zero-knowledge compatible)
- Secure session management
- Multi-tenant isolation (when RLS fully deployed)
- Backup and disaster recovery
- Vulnerability management
- Incident response capability

✅ **Operational Controls**:
- Security policies and procedures
- Change management
- Access control processes
- Monitoring and alerting
- Security awareness training

---

### What We CANNOT Achieve on Railway:

❌ **Official Certifications**:
- SOC 2 Type II certification (requires third-party audit, $15k-50k)
- HIPAA compliance certification (requires BAA from Railway - not available)
- ISO 27001 certification (requires third-party audit + process maturity)

❌ **Legal Requirements**:
- Business Associate Agreement (BAA) for HIPAA (Railway doesn't provide)
- Legal attestation of compliance (requires auditor)
- Insurance coverage tied to certification (requires actual cert)

---

### Recommended Path Forward:

**For Non-Healthcare/Non-Regulated Workloads**:
```
Path: Build SOC 2-Equivalent Controls on Railway

Benefits:
- Lower cost ($25-99/month Railway vs $599+ Supabase)
- Technical controls equivalent to SOC 2
- Can demonstrate security to customers
- Audit-ready if later seeking certification

Timeline: 4-6 months to implement all controls

Investment:
- Engineering time: 200-300 hours
- External pentest: $10k-30k (annual)
- Monitoring tools: $100-500/month (optional)
```

**For Healthcare/Regulated Workloads**:
```
Path: Migrate to HIPAA-Compliant Platform

Options:
1. Supabase Platform ($599/mo + $350 HIPAA)
   - Provides BAA
   - SOC 2 Type II certified
   - HIPAA audited infrastructure
   - Same tech stack (easier migration)

2. AWS/GCP with HIPAA BAA
   - More control
   - Higher complexity
   - Need to build/maintain all services
   - BAA available from cloud provider

Recommendation: Supabase Platform (easier, proven)

Timeline: 2-3 months to migrate + 2-3 months for certification audit
Investment: $11k+/year (subscription + audit)
```

---

### Next Steps:

**Immediate (This Sprint)**:
1. ✅ Read this compliance framework (you're here)
2. [ ] Decide: Are we handling healthcare data (ePHI)?
3. [ ] If YES → Plan migration to HIPAA-compliant platform
4. [ ] If NO → Proceed with SOC 2-equivalent controls on Railway

**Short-Term (Next 4 Weeks)**:
1. [ ] Implement comprehensive audit logging (Section 4)
2. [ ] Complete Railway private network migration
3. [ ] Document all security policies (Section 3)
4. [ ] Conduct initial risk assessment

**Medium-Term (3-6 Months)**:
1. [ ] Complete all SOC 2-equivalent technical controls
2. [ ] Conduct first external penetration test
3. [ ] Implement automated security scanning in CI/CD
4. [ ] Security awareness training for all team members

**Long-Term (6-12 Months)**:
1. [ ] If seeking certification: Engage SOC 2 auditor
2. [ ] Annual penetration testing
3. [ ] Continuous compliance monitoring
4. [ ] Consider bug bounty program

---

### Document Ownership:

**Author**: Zainab Hassan, Platform Security Engineer
**Reviewed By**: [To be filled]
**Approved By**: [To be filled]
**Last Updated**: 2025-11-22
**Next Review**: 2026-02-22 (90 days)

---

**This document is living and will evolve as:**
- Railway capabilities change
- New security requirements emerge
- Compliance standards update
- Your product and architecture mature

**Questions or concerns? Contact**: Zainab Hassan (zainab@ogelbase.com - create this email)

---

END OF RAILWAY COMPLIANCE FRAMEWORK
