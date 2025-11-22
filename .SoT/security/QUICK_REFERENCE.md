# HIPAA Compliance Quick Reference Guide

**Version:** 1.0
**Date:** 2025-01-22
**For:** Engineering, Product, Legal, Sales teams

---

## 🎯 TL;DR: What You Need to Know

### The Big Picture

✅ **Railway is a conduit** → We don't need a BAA with Railway
✅ **We sign BAAs with customers** → We are the Business Associate
✅ **Zero-knowledge encryption** → Railway can't access ePHI even if compromised
✅ **6-12 month timeline** → To SOC 2 + HIPAA certification
✅ **$75k-145k first year** → Audits, certifications, legal review

---

## 🔑 Key Concepts

### What is Zero-Knowledge Encryption?

**Simple Explanation:**
We **never** see your health data in plaintext. You encrypt it on your device before it reaches us. We store encrypted gibberish that's useless without your keys.

**Technical Explanation:**
Client-side AES-256-GCM encryption with HKDF key derivation. User master keys never transmitted to server. Even with full database access, we cannot decrypt ePHI.

### What is a Business Associate (BA)?

**Simple Explanation:**
A company that handles health data on behalf of a healthcare provider. We're a BA because we store (encrypted) health data for our customers.

### What is a Conduit?

**Simple Explanation:**
Infrastructure that just moves data without looking inside (like the post office delivering sealed envelopes). Railway is a conduit because they only store encrypted data they can't decrypt.

**Why It Matters:**
Conduits don't need Business Associate Agreements. Saves time, money, and complexity.

---

## 📋 For Engineering Teams

### What Can I Build?

✅ **Yes - Build these:**
- Client-side encryption features (keys never leave device)
- Encrypted data storage (ciphertext only)
- Audit logging (metadata only, no PHI)
- TLS 1.3 connections
- Authentication/authorization systems

❌ **No - Don't build these:**
- Server-side decryption (we can't decrypt, by design)
- Plaintext PHI in logs or error messages
- PHI analysis features (we don't have plaintext access)
- Key escrow or recovery systems (defeats zero-knowledge)

### Security Checklist (Every PR)

Before merging code that touches PHI:

- [ ] Encryption happens client-side (before network transmission)
- [ ] No plaintext PHI in logs, errors, or debug output
- [ ] No encryption keys in environment variables or code
- [ ] All database queries use parameterized queries (no string concat)
- [ ] TLS 1.3 enforced for all connections
- [ ] Input validation on all user inputs
- [ ] Audit logging for all PHI access (metadata only)

### Incident Response (If you see plaintext PHI in logs)

**STOP. This is a potential HIPAA breach.**

1. **Immediate:** Take screenshot, delete logs, notify security team
2. **Within 1 hour:** Security team assesses scope (how much PHI exposed? to whom?)
3. **Within 24 hours:** Notify customers (preliminary breach notification)
4. **Within 30 days:** Full breach notification to customers
5. **Within 60 days:** Customers notify affected patients

**Severity:** Exposing even 1 patient's PHI can trigger breach notification to hundreds of patients.

---

## 📋 For Product Teams

### What Features Can We Ship?

✅ **Yes - Ship these:**
- End-to-end encrypted backup
- Multi-device sync (encrypted)
- Secure sharing (encrypted, user-controlled keys)
- Zero-knowledge password recovery (no backdoors)
- Compliance reports for customers (audit logs, encryption status)

❌ **No - Don't promise these:**
- Server-side PHI search (we can't search encrypted data)
- Admin access to customer PHI (defeats zero-knowledge)
- PHI analytics or insights (we don't have plaintext)
- Key recovery by support team (users own their keys)

### Customer Messaging (Sales/Marketing)

**Key Differentiators:**
1. **"We can't access your health data, even if we wanted to"**
   → True zero-knowledge encryption

2. **"Infrastructure breach doesn't expose your data"**
   → Railway compromise = encrypted ciphertext only

3. **"One BAA, not a chain of subcontractors"**
   → Simplified compliance (Railway is conduit)

4. **"Your keys, your control"**
   → Users own encryption keys (we never see them)

**What NOT to say:**
- ❌ "We're HIPAA compliant" (not yet - certification in progress)
- ❌ "We can recover your data if you lose your password" (we can't - zero-knowledge)
- ❌ "We encrypt data on our servers" (misleading - we encrypt on client)
- ❌ "Railway is HIPAA compliant" (Railway is a conduit, not subject to HIPAA)

---

## 📋 For Legal/Compliance Teams

### BAA Signing Process

**When a customer requests a BAA:**

1. ✅ Use our BAA template (`.SoT/security/CUSTOMER_BAA_TEMPLATE.md`)
2. ⚠️ **CRITICAL:** Legal counsel must review before signing (do NOT use template as-is)
3. ✅ Customize for customer-specific requirements
4. ✅ Sign and return within 10 business days (typical enterprise SLA)

**Red Flags (Escalate to Legal):**
- Customer wants us to sign as Covered Entity (we're Business Associate)
- Customer requires Railway BAA (Railway is conduit, no BAA needed)
- Customer requires on-premises deployment (breaks zero-knowledge architecture)
- Customer requires key escrow (defeats zero-knowledge guarantee)

### Common Customer Questions

**Q: "Do you have a BAA with Railway?"**
**A:** No. Railway is a conduit service provider (like AWS S3 with client-side encryption). They have no access to decrypted ePHI due to our zero-knowledge architecture. We have legal documentation supporting this classification.

**Q: "What happens if Railway gets hacked?"**
**A:** Attackers would obtain encrypted ciphertext only. No plaintext ePHI exposure because Railway doesn't have decryption keys. This meets HIPAA's "unusable, unreadable" safe harbor (no breach notification required).

**Q: "Are you SOC 2 certified?"**
**A (as of 2025-01-22):** Not yet. Certification in progress (6-12 month timeline). We can provide:
- Independent security audit reports
- Penetration testing results
- Zero-knowledge architecture documentation
- Current security controls documentation

**Q: "Can you help us recover encrypted data if customer loses password?"**
**A:** No. Our zero-knowledge architecture means we don't have access to encryption keys. This is by design for maximum security. Customers must securely store their master passwords.

---

## 📋 For Sales Teams

### Qualification Questions

**Before offering HIPAA features, ask:**

1. ✅ "Are you a Covered Entity (healthcare provider, health plan, clearinghouse)?"
   → If NO: They might not need BAA (e.g., wellness apps, research)

2. ✅ "Will you be storing Protected Health Information (PHI)?"
   → If NO: They might not need BAA

3. ✅ "Do you need us to sign a Business Associate Agreement (BAA)?"
   → If YES: Proceed with BAA process

4. ✅ "What's your timeline for SOC 2 certification?"
   → If they need SOC 2 now: Set expectations (Q4 2025 target)

### Pricing Guidance

**HIPAA Tier (vs. Standard Tier):**
- **Standard:** $X/month (no BAA, no compliance guarantees)
- **HIPAA:** $X + 50-100%/month (includes BAA, compliance documentation, audit support)

**Why the price increase?**
- Legal review of customer BAA ($5k-15k per customer)
- Annual compliance audits ($50k-100k/year)
- Enhanced security monitoring and incident response
- Priority support for HIPAA-related issues
- Audit rights (customers can audit our security)

**When to discount:**
- Pilot customers (first 5 healthcare customers → 50% off first year)
- Multi-year contracts (10-20% discount)
- Referrals from existing healthcare customers (15% discount)

---

## 📋 For Support Teams

### Handling HIPAA Support Tickets

**General Rules:**
1. ❌ **NEVER** ask customer to send PHI in support ticket (email, chat, etc.)
2. ❌ **NEVER** access customer's encrypted data (we can't decrypt anyway)
3. ✅ **ALWAYS** use secure communication (encrypted email, secure portal)
4. ✅ **ALWAYS** log support interactions in audit trail

**Common Support Scenarios:**

**Scenario 1: "I can't access my encrypted backups"**
- ✅ Verify: Is customer using correct password/key?
- ✅ Check: Is backup still in database (check by backup ID hash)?
- ✅ Troubleshoot: Client-side decryption errors (browser console)
- ❌ Do NOT: Attempt server-side decryption (we can't)

**Scenario 2: "I lost my password, can you recover my data?"**
- ❌ No, we cannot (zero-knowledge architecture)
- ✅ Explain: Encryption keys derived from password, never stored on server
- ✅ Recommend: Use backup recovery keys (if customer created them)
- ✅ Document: This limitation in customer onboarding materials

**Scenario 3: "Can you tell me what data is in this backup?"**
- ❌ No, we cannot (encrypted, we don't have keys)
- ✅ Customer must download and decrypt client-side
- ✅ We can provide: Backup metadata (size, date, device hash)

**Scenario 4: "We suspect unauthorized access to our account"**
- ✅ Immediate: Revoke all authentication tokens
- ✅ Within 1 hour: Security team investigates (check audit logs)
- ✅ Within 4 hours: Preliminary assessment (was PHI accessed?)
- ✅ Within 24 hours: Notify customer (potential breach)
- 🚨 This may trigger breach notification process

---

## 🚨 Incident Response Quick Guide

### When to Escalate (Immediate)

**Escalate to security@company.com immediately if:**
- Plaintext PHI in logs or error messages
- Encryption keys exposed (leaked in code, logs, etc.)
- Unauthorized database access detected
- Customer reports potential breach
- Security vulnerability disclosed publicly
- Audit finding: Critical or High severity

### Breach Notification Timeline

```
Discovery → 30 days → Customer notification
            60 days → Customer notifies patients (if breach confirmed)
```

**What Counts as a Breach?**
- ✅ Plaintext PHI exposed (logs, unauthorized access)
- ✅ Encryption keys compromised (enables decryption of backups)
- ✅ Software bug exposes PHI to unauthorized users
- ❌ Railway infrastructure breach (only ciphertext exposed)
- ❌ Failed authentication attempts (blocked, no PHI accessed)
- ❌ Encrypted backups deleted (PHI not exposed, just unavailable)

---

## 📚 Additional Resources

### Internal Documentation
- **Executive Summary:** `.SoT/security/HIPAA_COMPLIANCE_EXECUTIVE_SUMMARY.md`
- **Railway Conduit Classification:** `.SoT/security/RAILWAY_CONDUIT_CLASSIFICATION.md`
- **Customer BAA Template:** `.SoT/security/CUSTOMER_BAA_TEMPLATE.md`
- **Audit Preparation:** `.SoT/security/INDEPENDENT_AUDIT_PREPARATION.md`

### External Resources
- **HHS HIPAA Website:** https://www.hhs.gov/hipaa/index.html
- **OCR Breach Portal:** https://ocrportal.hhs.gov/ocr/breach/breach_report.jsf
- **NIST Cybersecurity Framework:** https://www.nist.gov/cyberframework
- **AES-256 Specification:** https://csrc.nist.gov/publications/detail/fips/197/final

### Training
- **HIPAA Training (Annual):** [Link to LMS]
- **Security Awareness Training:** [Link to KnowBe4 or similar]
- **Zero-Knowledge Architecture Onboarding:** [Link to internal docs]
- **Incident Response Drills:** Quarterly (check calendar)

---

## 🎓 Definitions (Plain English)

| Term | Simple Explanation | Technical Explanation |
|------|-------------------|----------------------|
| **ePHI** | Electronic health information | Protected Health Information in electronic form (emails, databases, backups) |
| **Covered Entity (CE)** | Hospitals, doctors, health plans | Organizations that directly provide healthcare services |
| **Business Associate (BA)** | Companies that help CEs with health data | Us - we store encrypted health data for healthcare providers |
| **Conduit** | Infrastructure that just moves data | Railway - stores encrypted data without ability to decrypt |
| **Zero-Knowledge** | We can't see your data, even if we try | Client-side encryption; server never has decryption keys |
| **Breach** | Unauthorized access to health data | Compromise of PHI confidentiality (triggers notification) |
| **AES-256-GCM** | Military-grade encryption | Symmetric encryption algorithm (NIST approved, 256-bit key) |
| **TLS 1.3** | Secure internet connection | Transport Layer Security (encrypts data in transit) |
| **Audit Log** | Record of who did what, when | Tamper-proof log of system activities (HIPAA requirement) |

---

## ❓ FAQ

**Q: Can I use this platform for non-healthcare data?**
A: Yes! Zero-knowledge encryption benefits everyone, not just healthcare.

**Q: What if customer wants on-premises deployment?**
A: Breaks our zero-knowledge architecture (Railway conduit model). Escalate to product/engineering.

**Q: Can we offer key escrow for enterprise customers?**
A: No. Defeats zero-knowledge guarantee. We mathematically cannot access user keys.

**Q: What if Railway refuses to cooperate as conduit?**
A: Contingency plan: Migrate to HIPAA-certified infrastructure (AWS, GCP). Timeline: 3-6 months.

**Q: Do we need SOC 2 AND HIPAA?**
A: Yes. Most healthcare enterprise customers require both. SOC 2 = trust, HIPAA = legal requirement.

**Q: Can I share this document externally?**
A: No. Internal only. For customer-facing materials, use official marketing content.

---

## 📞 Who to Contact

| Question About | Contact |
|---------------|---------|
| **BAA signing, legal questions** | Legal Team (legal@company.com) |
| **Security incidents, breaches** | Security Team (security@company.com) |
| **SOC 2 / HIPAA certification** | Compliance Officer (compliance@company.com) |
| **Customer compliance questions** | Sales Engineering (sales-eng@company.com) |
| **Technical implementation** | Engineering Lead (cto@company.com) |
| **Zero-knowledge architecture** | Zainab Hassan (zainab@company.com) |

---

**Last Updated:** 2025-01-22
**Owner:** Zainab Hassan (Platform Security Engineer)
**Review Cycle:** Quarterly or upon regulatory changes
**Next Review:** 2025-04-22

---

**© 2025 [Company Name]**
**Remember:** When in doubt about HIPAA compliance, escalate to security or legal teams. Better to ask than to cause a breach.
