# Business Associate Agreement (BAA) Template

**For Zero-Knowledge Encrypted Backup (ZKEB) Platform**

**Version:** 1.0
**Effective Date:** [INSERT DATE]
**Prepared By:** Zainab Hassan (Platform Security Engineer)
**Legal Review:** [REQUIRED BEFORE USE]

---

## ⚠️ LEGAL NOTICE

**THIS IS A TEMPLATE FOR LEGAL REVIEW ONLY.**

This document must be reviewed and customized by qualified legal counsel before execution. HIPAA BAAs have significant legal implications, and this template should be adapted to your specific:
- Business structure
- State laws
- Insurance coverage
- Risk tolerance
- Customer requirements

**DO NOT USE THIS TEMPLATE WITHOUT LEGAL COUNSEL REVIEW.**

---

## Table of Contents

1. [BAA Cover Document](#1-baa-cover-document)
2. [Business Associate Agreement Terms](#2-business-associate-agreement-terms)
3. [Technical Safeguards Appendix](#3-technical-safeguards-appendix-zkeb-architecture)
4. [Breach Notification Procedures](#4-breach-notification-procedures-appendix-b)
5. [Subcontractor Provisions](#5-subcontractor-provisions-appendix-c)
6. [Audit Rights and Compliance](#6-audit-rights-and-compliance-appendix-d)

---

## 1. BAA Cover Document

```
BUSINESS ASSOCIATE AGREEMENT

This Business Associate Agreement ("Agreement") is entered into as of [DATE] ("Effective Date") by and between:

COVERED ENTITY:
[Company Name]
[Address]
[City, State, ZIP]
("Covered Entity")

BUSINESS ASSOCIATE:
[Your Company Name]
[Address]
[City, State, ZIP]
("Business Associate")

WHEREAS, Covered Entity and Business Associate have entered into a services agreement dated [DATE] ("Services Agreement") under which Business Associate may create, receive, maintain, or transmit Protected Health Information ("PHI") on behalf of Covered Entity;

WHEREAS, Covered Entity and Business Associate intend to protect the privacy and provide for the security of PHI disclosed to Business Associate pursuant to the Services Agreement in compliance with the Health Insurance Portability and Accountability Act of 1996, Public Law 104-191 ("HIPAA"), the Health Information Technology for Economic and Clinical Health Act, Public Law 111-005 ("HITECH Act"), and regulations promulgated thereunder, including the Privacy, Security, Breach Notification, and Enforcement Rules at 45 C.F.R. Parts 160 and 164 (collectively, the "HIPAA Rules");

NOW, THEREFORE, in consideration of the mutual promises and covenants contained herein and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the parties agree as follows:
```

---

## 2. Business Associate Agreement Terms

### Article 1: Definitions

**1.1 General Definitions**

All capitalized terms used but not otherwise defined in this Agreement shall have the meanings set forth in the HIPAA Rules at 45 C.F.R. Parts 160 and 164.

**1.2 Specific Definitions**

- **"ePHI"** means Protected Health Information that is transmitted by or maintained in electronic media.
- **"Individual"** shall have the same meaning as the term "individual" in 45 C.F.R. § 160.103 and shall include a person who qualifies as a personal representative in accordance with 45 C.F.R. § 164.502(g).
- **"Privacy Rule"** shall mean the Standards for Privacy of Individually Identifiable Health Information at 45 C.F.R. Part 160 and Part 164, Subparts A and E.
- **"Security Rule"** shall mean the Security Standards for the Protection of Electronic Protected Health Information at 45 C.F.R. Part 160 and Part 164, Subparts A and C.
- **"Breach"** shall have the meaning set forth in 45 C.F.R. § 164.402.
- **"ZKEB Platform"** means Business Associate's zero-knowledge encrypted backup system, including client-side encryption SDK and cloud infrastructure.

---

### Article 2: Obligations and Activities of Business Associate

**2.1 Permitted Uses and Disclosures**

Business Associate may use or disclose PHI only:
1. To perform functions, activities, or services for, or on behalf of, Covered Entity as specified in the Services Agreement;
2. For the proper management and administration of Business Associate, provided that:
   - Disclosures are Required by Law; OR
   - Business Associate obtains reasonable assurances from the person to whom the information is disclosed that it will remain confidential and will be used or further disclosed only as Required by Law or for the purpose for which it was disclosed to the person, and the person notifies Business Associate of any instances of which it is aware in which the confidentiality of the information has been breached;
3. To provide Data Aggregation services to Covered Entity as permitted by 45 C.F.R. § 164.504(e)(2)(i)(B);
4. As Required by Law.

**2.2 Prohibited Uses and Disclosures**

Business Associate shall not use or disclose PHI:
1. In a manner that would violate the HIPAA Rules if done by Covered Entity;
2. For marketing purposes, except as permitted by 45 C.F.R. § 164.508(a)(3);
3. For fundraising purposes, except as permitted by 45 C.F.R. § 164.514(f)(1);
4. For the sale of PHI, except as permitted by 45 C.F.R. § 164.502(a)(5)(ii).

**2.3 Safeguards**

Business Associate shall:
1. Implement administrative, physical, and technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of ePHI that it creates, receives, maintains, or transmits on behalf of Covered Entity;
2. Comply with the Security Rule (45 C.F.R. Part 164, Subpart C);
3. Ensure that any agent, including a subcontractor, to whom it provides ePHI agrees to implement reasonable and appropriate safeguards to protect the ePHI;
4. Report to Covered Entity any use or disclosure of PHI not provided for by this Agreement of which it becomes aware;
5. Report to Covered Entity any Security Incident of which it becomes aware.

**2.4 Zero-Knowledge Architecture (ZKEB-Specific)**

Business Associate warrants that:
1. All ePHI is encrypted client-side using AES-256-GCM before transmission to Business Associate's infrastructure;
2. Business Associate does not have access to encryption keys and cannot decrypt ePHI;
3. Business Associate's infrastructure providers (e.g., Railway.app, cloud providers) are designated as conduit service providers and do not have access to decrypted ePHI;
4. Business Associate maintains independent security audit reports confirming the zero-knowledge architecture.

**Technical Details:** See Appendix A (Technical Safeguards).

---

### Article 3: Obligations of Covered Entity

**3.1 Provide Notice of Privacy Practices**

Covered Entity shall provide Business Associate with the notice of privacy practices that Covered Entity produces in accordance with 45 C.F.R. § 164.520, as well as any changes to such notice.

**3.2 Provide Permission for Uses and Disclosures**

Covered Entity shall:
1. Obtain any consent, authorization, or permission that may be required by the Privacy Rule prior to furnishing PHI to Business Associate;
2. Notify Business Associate of any limitation(s) in the notice of privacy practices that affect Business Associate's use or disclosure of PHI;
3. Notify Business Associate of any changes in, or revocation of, permission by an Individual to use or disclose PHI;
4. Notify Business Associate of any restriction to the use or disclosure of PHI that Covered Entity has agreed to in accordance with 45 C.F.R. § 164.522.

**3.3 Permissible Requests**

Covered Entity shall not request Business Associate to use or disclose PHI in any manner that would not be permissible under the HIPAA Rules if done by Covered Entity.

---

### Article 4: Individual Rights

**4.1 Right to Access**

Business Associate shall, within **ten (10) business days** of a request by Covered Entity, make available to Covered Entity or, as directed by Covered Entity, to an Individual, PHI maintained by Business Associate in a Designated Record Set, to meet Covered Entity's obligations under 45 C.F.R. § 164.524.

**ZKEB Implementation:**
- Business Associate maintains encrypted backups but cannot decrypt them (zero-knowledge)
- Covered Entity or Individual must use their encryption keys to access PHI
- Business Associate will provide encrypted data in standard format upon request

**4.2 Right to Amendment**

Business Associate shall, within **ten (10) business days** of notice from Covered Entity, make any amendments to PHI in a Designated Record Set that Covered Entity directs or agrees to pursuant to 45 C.F.R. § 164.526.

**ZKEB Limitation:**
- Due to zero-knowledge architecture, Business Associate cannot modify encrypted PHI
- Covered Entity must decrypt, amend, re-encrypt, and upload amended version
- Business Associate will delete old version upon confirmation

**4.3 Right to an Accounting**

Business Associate shall, within **thirty (30) days** of a request by Covered Entity, make available to Covered Entity the information required to provide an accounting of disclosures in accordance with 45 C.F.R. § 164.528.

**ZKEB Implementation:**
- Business Associate maintains comprehensive audit logs of all PHI access (non-decryptable metadata only)
- Audit logs include: timestamps, device identifiers (hashed), actions performed
- Does NOT include: plaintext PHI content, encryption keys, full IP addresses

---

### Article 5: Breach Notification

**5.1 Discovery and Reporting**

Business Associate shall notify Covered Entity of any Breach of Unsecured PHI without unreasonable delay and in no case later than **thirty (30) days** after discovery of the Breach.

**5.2 Content of Breach Notification**

The notification shall include, to the extent known:
1. Identification of each Individual whose Unsecured PHI has been, or is reasonably believed to have been, accessed, acquired, or disclosed during the Breach;
2. A brief description of what happened, including the date of the Breach and the date of discovery;
3. A description of the types of Unsecured PHI involved (e.g., name, SSN, DOB, medical record number);
4. A brief description of the investigation, mitigation, and corrective actions taken or to be taken;
5. Steps Individuals should take to protect themselves from potential harm;
6. Contact procedures for Individuals to ask questions or obtain additional information.

**5.3 ZKEB Architecture Advantage**

Due to zero-knowledge encryption:
- Infrastructure compromise (e.g., Railway.app breach) does NOT constitute a HIPAA Breach if only encrypted ciphertext is exposed
- Encrypted PHI meets HIPAA's "unusable, unreadable" safe harbor (45 C.F.R. § 164.402)
- Breach notification only required if encryption keys are compromised (unlikely due to client-side storage)

**Detailed Procedures:** See Appendix B (Breach Notification Procedures).

---

### Article 6: Subcontractors

**6.1 Subcontractor Requirements**

Business Associate shall ensure that any subcontractor that creates, receives, maintains, or transmits PHI on behalf of Business Associate:
1. Agrees in writing to the same restrictions and conditions that apply to Business Associate with respect to such PHI;
2. Agrees to implement reasonable and appropriate safeguards to protect the PHI;
3. Reports to Business Associate any Breach of Unsecured PHI.

**6.2 ZKEB Subcontractor Designation**

Business Associate designates the following infrastructure providers as **conduit service providers** (NOT Business Associates under HIPAA) due to zero-knowledge architecture:
- Railway.app (cloud infrastructure)
- [Any CDN provider] (content delivery)
- [Any object storage provider] (if applicable)

**Rationale:** These providers do not have access to decrypted PHI and function solely as data transport/storage infrastructure.

**Detailed Provisions:** See Appendix C (Subcontractor Provisions).

---

### Article 7: Term and Termination

**7.1 Term**

This Agreement shall be effective as of the Effective Date and shall remain in effect until the earlier of:
1. Termination of the Services Agreement; OR
2. Written termination by either party upon thirty (30) days' written notice to the other party for material breach of this Agreement.

**7.2 Effect of Termination**

Upon termination of this Agreement:
1. Business Associate shall, at Covered Entity's option:
   - **Return** all PHI received from, or created or received by Business Associate on behalf of, Covered Entity; OR
   - **Destroy** all PHI and retain no copies (if return is infeasible)
2. Business Associate shall provide written certification of destruction within thirty (30) days.

**ZKEB Implementation:**
- Business Associate will delete all encrypted backups from production and backup systems
- Covered Entity retains copies of encrypted backups (can decrypt with their keys)
- Business Associate provides cryptographic proof of deletion (e.g., blockchain timestamp)

**7.3 Survival**

The obligations of Business Associate under Sections 2.3 (Safeguards), 5 (Breach Notification), and 7.2 (Effect of Termination) shall survive termination of this Agreement.

---

### Article 8: Audit and Inspection Rights

**8.1 Access to Books and Records**

Covered Entity may, upon reasonable notice to Business Associate, inspect Business Associate's facilities, systems, books, and records relating to the use and disclosure of PHI to monitor compliance with this Agreement.

**8.2 Independent Security Audits**

Business Associate shall:
1. Maintain at least one independent security audit report per year from a qualified third-party auditor;
2. Provide audit reports to Covered Entity upon request (within 15 days);
3. Ensure audit scope includes cryptographic implementation review and zero-knowledge architecture verification.

**8.3 Right to Audit Infrastructure**

Covered Entity may, at its own expense, conduct or engage a third party to conduct an independent audit of Business Associate's compliance with this Agreement, provided:
- Auditor signs confidentiality agreement
- Audit conducted during normal business hours with reasonable advance notice (30 days)
- Audit does not unreasonably disrupt Business Associate's operations

**Detailed Procedures:** See Appendix D (Audit Rights and Compliance).

---

### Article 9: Liability and Indemnification

**9.1 Limitation of Liability**

Except for breaches of confidentiality or security obligations:
1. Neither party shall be liable for indirect, incidental, consequential, or punitive damages;
2. Total liability under this Agreement shall not exceed [AMOUNT OR "fees paid in the 12 months preceding the claim"];
3. These limitations do not apply to:
   - Breach of confidentiality obligations
   - Willful misconduct or gross negligence
   - Violation of HIPAA Rules

**9.2 Indemnification**

Business Associate shall indemnify, defend, and hold harmless Covered Entity from and against any:
1. Civil penalties imposed by HHS Office for Civil Rights (OCR) for Business Associate's violations of HIPAA Rules;
2. Reasonable attorneys' fees and costs incurred by Covered Entity in responding to OCR investigations or enforcement actions arising from Business Associate's conduct;
3. Claims, damages, and costs arising from Business Associate's Breach of Unsecured PHI (excluding infrastructure compromises that do not result in plaintext PHI exposure due to zero-knowledge encryption).

**Covered Entity Indemnification:**
Covered Entity shall indemnify Business Associate for:
1. OCR penalties arising from Covered Entity's misuse of the ZKEB Platform;
2. Claims arising from Covered Entity's failure to obtain required authorizations or consents;
3. Claims arising from Covered Entity's failure to protect their encryption keys or master passwords.

---

### Article 10: Miscellaneous Provisions

**10.1 Regulatory References**

A reference in this Agreement to a section in the HIPAA Rules means the section as in effect or as amended, and for which compliance is required.

**10.2 Amendment**

The parties agree to take such action as is necessary to amend this Agreement to comply with changes to the HIPAA Rules. Upon either party's written request, the parties shall negotiate in good faith to amend this Agreement.

**10.3 No Third-Party Beneficiaries**

Nothing in this Agreement shall confer upon any person other than the parties and their respective successors or assigns any rights, remedies, obligations, or liabilities whatsoever.

**10.4 Governing Law**

This Agreement shall be governed by the laws of the State of [STATE], without regard to its conflicts of law principles.

**10.5 Interpretation**

This Agreement shall be interpreted as broadly as necessary to implement and comply with the HIPAA Rules. Any ambiguity shall be resolved in favor of a meaning that complies with the HIPAA Rules.

**10.6 Entire Agreement**

This Agreement, together with the Services Agreement and all Appendices hereto, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior agreements, whether written or oral.

---

### SIGNATURE PAGE

**IN WITNESS WHEREOF**, the parties have executed this Business Associate Agreement as of the Effective Date.

**COVERED ENTITY:**

By: ___________________________
Name: [Name]
Title: [Title]
Date: _________________________

**BUSINESS ASSOCIATE:**

By: ___________________________
Name: [Name]
Title: [Title]
Date: _________________________

---

## 3. Technical Safeguards Appendix (ZKEB Architecture)

### APPENDIX A: TECHNICAL SAFEGUARDS

This Appendix describes the technical safeguards implemented by Business Associate to comply with the Security Rule (45 C.F.R. § 164.308, 164.310, 164.312).

---

#### A.1 Zero-Knowledge Encryption Architecture

**Overview:**
Business Associate operates a Zero-Knowledge Encrypted Backup (ZKEB) platform where all ePHI is encrypted client-side before transmission. Business Associate has no access to encryption keys and cannot decrypt ePHI.

**Encryption Specifications:**
- **Algorithm:** AES-256-GCM (NIST FIPS 197 approved)
- **Key Derivation:** HKDF (HMAC-based Key Derivation Function) using SHA-256
- **User Master Key:** Derived from user password using PBKDF2 (100,000 iterations, 256-bit salt)
- **Nonce:** 96-bit random nonce (unique per encryption operation)
- **Authentication:** GCM mode provides built-in authentication tag (128-bit)

**Key Management:**
- User Master Key (UMK) never leaves client device
- Data Encryption Keys (DEK) derived from UMK using HKDF
- Keys stored in device's secure storage (Keychain/Keystore/IndexedDB with encryption)
- No keys transmitted to or stored on Business Associate's servers

**Data Flow:**
```
Client Device
  ├─ Plaintext ePHI (memory only, never persisted)
  ├─ Client-Side Encryption (AES-256-GCM)
  ├─ Ciphertext + Nonce + Tag
  └─ HTTPS/TLS 1.3 transmission
      ↓
Business Associate Infrastructure
  ├─ PostgreSQL Database (stores encrypted ciphertext only)
  ├─ NO decryption capability (no keys)
  └─ Audit logs (non-PHI metadata only)
```

**Security Guarantee:**
- Even if Business Associate's entire infrastructure is compromised, attackers obtain only encrypted ciphertext
- Ciphertext is computationally infeasible to decrypt without user's master key
- Meets HIPAA "unusable, unreadable" safe harbor (45 C.F.R. § 164.402)

---

#### A.2 Administrative Safeguards (§164.308)

**Security Management Process (§164.308(a)(1))**
- **Risk Analysis:** Annual security risk assessments conducted
- **Risk Management:** Identified risks mitigated through technical controls
- **Sanctions Policy:** Disciplinary actions for HIPAA violations documented
- **Information System Activity Review:** Audit logs reviewed monthly

**Workforce Security (§164.308(a)(3))**
- Background checks for all employees with system access
- Role-based access control (RBAC) limiting PHI access
- Termination procedures include immediate access revocation

**Training (§164.308(a)(5))**
- Annual HIPAA training for all workforce members
- Specialized security training for engineering team
- Incident response drills conducted quarterly

**Business Associate Management (§164.308(b))**
- BAAs in place with subcontractors (if any create/receive/maintain PHI)
- Infrastructure providers designated as conduits (no BAA required due to zero-knowledge)

---

#### A.3 Physical Safeguards (§164.310)

**Facility Access Controls (§164.310(a))**
- Physical servers managed by Railway.app (SOC 2 compliant data centers)
- Access logs maintained by infrastructure provider
- Business Associate has no physical access to hardware (cloud-based)

**Workstation Security (§164.310(b))**
- Employee workstations require full-disk encryption
- Screen lock after 5 minutes of inactivity
- Multi-factor authentication (MFA) required for all business systems

**Device and Media Controls (§164.310(d))**
- No ePHI stored on removable media (cloud-only architecture)
- Encrypted backups stored in Railway-managed PostgreSQL (encrypted at rest)
- Data disposal: Encrypted backups securely deleted upon customer request (cryptographic proof provided)

---

#### A.4 Technical Safeguards (§164.312)

**Access Control (§164.312(a)(1))**
- **Unique User Identification:** Device ID + user account (both required)
- **Emergency Access:** Break-glass admin access (dual authorization, fully audited)
- **Automatic Logoff:** Sessions expire after 30 minutes of inactivity
- **Encryption/Decryption:** AES-256-GCM (client-side only)

**Audit Controls (§164.312(b))**
- Comprehensive audit logging of all system activities:
  - Authentication attempts (success/failure)
  - PHI access (encrypted blob retrieval)
  - Configuration changes
  - Administrative actions
- Logs stored for 7 years (HIPAA retention requirement)
- Logs are append-only (immutable) and cryptographically hashed for integrity

**Integrity Controls (§164.312(c)(1))**
- Digital signatures (RSA-4096) verify backup authenticity
- HMAC (SHA-256) detects unauthorized PHI modification
- Version control for encrypted backups

**Transmission Security (§164.312(e)(1))**
- TLS 1.3 with Perfect Forward Secrecy (PFS)
- Certificate pinning (client-side) prevents man-in-the-middle attacks
- HSTS (HTTP Strict Transport Security) enforced

---

#### A.5 Audit Logging (Non-PHI Metadata Only)

Business Associate logs the following metadata (does NOT contain plaintext PHI):

**Logged:**
- Timestamp (ISO 8601)
- Device ID hash (SHA-256, not reversible)
- User ID hash (SHA-256, not reversible)
- Action performed (e.g., "backup_created", "backup_retrieved")
- Resource ID hash (SHA-256 of backup ID)
- Result (success/failure)
- IP address prefix (first 3 octets only, GDPR/CCPA compliant)

**NOT Logged:**
- Plaintext device IDs
- User credentials or passwords
- Encryption keys
- PHI content (encrypted or plaintext)
- Full IP addresses

**Example Audit Log Entry:**
```json
{
  "timestamp": "2025-01-22T14:35:22.123Z",
  "event_type": "backup_created",
  "device_id_hash": "a1b2c3d4e5f6...sha256...",
  "user_id_hash": "f9e8d7c6b5a4...sha256...",
  "backup_id_hash": "3k9m2n8p1q7r...sha256...",
  "result": "success",
  "ip_prefix": "192.168.1.0/24"
}
```

---

#### A.6 Independent Security Audits

Business Associate shall:
1. Conduct annual penetration testing by independent security firm (e.g., Cure53, Trail of Bits, NCC Group)
2. Maintain SOC 2 Type II certification (annual audit)
3. Undergo HIPAA security review by qualified auditor
4. Provide audit reports to Covered Entity upon request (NDA required)

**Most Recent Audit:** [Date, Auditor Name, Summary of Findings]

---

## 4. Breach Notification Procedures (Appendix B)

### APPENDIX B: BREACH NOTIFICATION PROCEDURES

This Appendix details the procedures Business Associate will follow upon discovery of a Breach of Unsecured PHI, in accordance with 45 C.F.R. § 164.410.

---

#### B.1 Breach Definition and Discovery

**Breach Defined:**
A Breach is the unauthorized acquisition, access, use, or disclosure of PHI that compromises the security or privacy of the PHI, **EXCEPT**:
1. Unintentional acquisition, access, or use by workforce member acting in good faith and within scope of authority;
2. Inadvertent disclosure from person authorized to access PHI to another person authorized to access PHI at the same entity;
3. Where Business Associate has a good faith belief that unauthorized recipient could not reasonably have retained the PHI.

**Discovery:**
A Breach is considered "discovered" when Business Associate knows or should have known of the Breach through reasonable diligence.

**ZKEB Exception:**
- Compromise of Railway.app infrastructure alone does NOT constitute a Breach if only encrypted ciphertext is exposed (meets "unusable, unreadable" safe harbor)
- Breach only occurs if encryption keys are compromised OR encryption is broken

---

#### B.2 Initial Incident Response (0-24 Hours)

**Upon discovery of potential Breach:**

1. **Containment (Immediate)**
   - Isolate affected systems
   - Revoke compromised credentials
   - Block unauthorized access
   - Preserve forensic evidence

2. **Assessment (Within 4 Hours)**
   - Determine scope of compromise
   - Identify affected Individuals (via device/user hashes)
   - Assess whether encrypted PHI was exposed (ciphertext only = NOT a Breach)
   - Estimate number of affected records

3. **Internal Notification (Within 8 Hours)**
   - Notify CEO, CTO, Security Team
   - Activate incident response team
   - Initiate investigation

4. **Covered Entity Notification (Within 24 Hours - Preliminary)**
   - Preliminary notification to Covered Entity (even if investigation ongoing)
   - Provide initial assessment
   - Commit to follow-up within 30 days

---

#### B.3 Investigation and Mitigation (Days 1-7)

**Forensic Investigation:**
- Determine root cause of Breach
- Timeline of unauthorized access
- What PHI was accessed/acquired
- Who accessed it (if known)
- Extent of data exfiltration (if any)

**Mitigation Actions:**
- Close security vulnerability
- Implement additional safeguards
- Reset credentials/keys if necessary
- Notify law enforcement (if criminal activity suspected)

**Risk Assessment:**
- Evaluate probability of compromise (was encryption broken?)
- Assess risk of harm to Individuals
- Document why Breach notification is/isn't required

---

#### B.4 Breach Notification to Covered Entity (Within 30 Days)

Business Associate shall provide written notice to Covered Entity containing:

**Required Information (§164.410(c)):**
1. **Identification of Individuals:**
   - Number of Individuals affected
   - Device/user hashes (if cannot identify specific Individuals)
   - Types of PHI involved (diagnosis codes, treatment records, etc.)

2. **Description of Breach:**
   - Date of Breach
   - Date of discovery
   - How Breach occurred (e.g., "SQL injection", "stolen credentials")
   - Type of PHI accessed (encrypted vs. plaintext)

3. **Mitigation and Corrective Actions:**
   - Steps taken to mitigate harm
   - Security improvements implemented
   - Measures to prevent recurrence

4. **Individual Notification Plan:**
   - Recommended actions for affected Individuals
   - Resources for credit monitoring (if SSN exposed)
   - Contact information for questions

5. **Contact Information:**
   - Incident response lead name, title, email, phone

**Delivery Method:**
- Email to Covered Entity's designated HIPAA Security Officer
- Certified mail if email unavailable
- Follow-up phone call to confirm receipt

---

#### B.5 Individual Notification (Covered Entity's Responsibility)

**Covered Entity must notify affected Individuals within 60 days** of discovery, per 45 C.F.R. § 164.404.

**Business Associate's Role:**
- Provide list of affected Individuals (if available)
- Draft template notification letter (for Covered Entity's review)
- Assist with mailing logistics (if requested)

**Notification Content (Covered Entity's Letter):**
- Brief description of Breach
- Types of PHI involved
- Steps Individuals should take (e.g., monitor credit reports)
- What Covered Entity is doing to investigate and prevent recurrence
- Contact information for questions

---

#### B.6 Regulatory Notification

**If Breach affects 500+ Individuals:**
- Covered Entity must notify HHS Office for Civil Rights (OCR) within 60 days
- Business Associate must provide detailed information for OCR report
- OCR will publish Breach on "Wall of Shame" website

**Media Notification (500+ Individuals in same state/jurisdiction):**
- Covered Entity must notify prominent media outlets in affected area
- Business Associate drafts press release (for Covered Entity's review)

---

#### B.7 Post-Breach Review

**Within 90 Days of Breach:**
- Conduct post-mortem analysis
- Update security policies and procedures
- Implement lessons learned
- Report findings to Covered Entity

**Annual Breach Report:**
- Business Associate provides annual summary of all Breach incidents (even minor ones)
- Trends, root causes, corrective actions

---

#### B.8 ZKEB-Specific Breach Scenarios

**Scenario 1: Railway.app Infrastructure Breach**
- **Outcome:** NOT a HIPAA Breach (encrypted ciphertext exposed, keys not compromised)
- **Action:** Notify Covered Entity (informational), no Individual notification required
- **Rationale:** Meets "unusable, unreadable" safe harbor (45 C.F.R. § 164.402)

**Scenario 2: Client Device Theft**
- **Outcome:** Potentially a Breach (if device not encrypted or password weak)
- **Action:** Individual notification (if device contained unsecured PHI), 60-day timeline
- **Business Associate Role:** Log suspicious activity, provide forensic support

**Scenario 3: Encryption Key Compromise**
- **Outcome:** HIPAA Breach (keys enable decryption of past backups)
- **Action:** Immediate notification (Covered Entity + Individuals), key rotation, credential reset
- **Business Associate Role:** Force re-encryption of all backups with new keys

**Scenario 4: Software Bug Exposes Plaintext PHI**
- **Outcome:** HIPAA Breach (zero-knowledge guarantee broken)
- **Action:** Immediate notification, emergency patch, third-party audit
- **Business Associate Role:** Full breach notification process

---

## 5. Subcontractor Provisions (Appendix C)

### APPENDIX C: SUBCONTRACTOR PROVISIONS

This Appendix clarifies Business Associate's use of subcontractors and infrastructure providers in relation to PHI processing.

---

#### C.1 Subcontractor Definition (HIPAA Context)

**Per 45 C.F.R. § 160.103:**
A subcontractor is a person to whom a Business Associate delegates a function, activity, or service involving the creation, receipt, maintenance, or transmission of PHI.

**Key Requirement:**
Business Associates must obtain satisfactory assurances (via written contract) that subcontractors will:
1. Appropriately safeguard PHI
2. Comply with HIPAA Rules
3. Report Breaches

---

#### C.2 Conduit Exception for Infrastructure Providers

**Business Associate designates the following as CONDUIT service providers (NOT subcontractors requiring BAA):**

1. **Railway.app (Cloud Infrastructure)**
   - **Role:** Provides compute, network, storage infrastructure
   - **PHI Access:** NONE (stores only encrypted ciphertext)
   - **BAA Required:** NO (conduit exception)
   - **Justification:** Railway cannot decrypt PHI due to zero-knowledge encryption; functions solely as data transport/storage layer

2. **[CDN Provider, e.g., Cloudflare]**
   - **Role:** Content delivery network for static assets
   - **PHI Access:** NONE (caches encrypted data only)
   - **BAA Required:** NO (conduit exception)

3. **[Object Storage, e.g., AWS S3 with client-side encryption]**
   - **Role:** Encrypted backup storage (if applicable)
   - **PHI Access:** NONE (client-side encryption before upload)
   - **BAA Required:** NO (conduit exception)

**Legal Basis:**
HHS OCR Guidance (2013) states that entities providing only data transmission services without accessing PHI content are NOT Business Associates.

**Technical Proof:**
- Independent security audit confirms infrastructure providers cannot decrypt PHI
- Zero-knowledge architecture documented in Appendix A
- Data flow analysis shows no plaintext PHI accessible to infrastructure

---

#### C.3 Subcontractors Requiring BAA (If Applicable)

**If Business Associate engages subcontractors that DO access PHI (e.g., data analytics, transcription services), Business Associate shall:**

1. **Execute BAA with Subcontractor**
   - Same HIPAA obligations as this Agreement
   - Require subcontractor to safeguard PHI
   - Flow-down breach notification requirements

2. **Notify Covered Entity**
   - Provide list of subcontractors with PHI access
   - Update list annually or upon changes
   - Obtain Covered Entity approval before adding new subcontractors (if required)

3. **Audit Subcontractor Compliance**
   - Annual review of subcontractor safeguards
   - Request SOC 2 reports or conduct audits
   - Terminate subcontractor if non-compliant

**Current Subcontractors with PHI Access:**
- [None - due to zero-knowledge architecture, no subcontractors access PHI]
- [If applicable, list subcontractor name, role, BAA date]

---

#### C.4 Subcontractor Liability

**Business Associate remains liable to Covered Entity for:**
- Any HIPAA violations by subcontractors
- Breaches caused by subcontractor negligence
- Compliance failures by subcontractors

**Business Associate will:**
- Indemnify Covered Entity for subcontractor-caused Breaches
- Take corrective action if subcontractor violates HIPAA
- Terminate subcontractor relationship if necessary

---

#### C.5 Changes to Subcontractor List

**Business Associate shall notify Covered Entity:**
- **30 days in advance** before adding new subcontractor with PHI access
- **Within 10 days** after terminating subcontractor relationship
- **Immediately** if subcontractor experiences a Breach

**Covered Entity's Right to Disapprove:**
- Covered Entity may object to new subcontractor (written objection within 15 days)
- If objection, Business Associate shall not engage subcontractor OR terminate existing Services Agreement

---

## 6. Audit Rights and Compliance (Appendix D)

### APPENDIX D: AUDIT RIGHTS AND COMPLIANCE VERIFICATION

This Appendix describes Covered Entity's rights to audit Business Associate's compliance with this Agreement and the HIPAA Rules.

---

#### D.1 Audit Schedule and Scope

**Annual Audit (Minimum):**
- Covered Entity may conduct one (1) audit per year at Business Associate's expense (included in service fees)
- Additional audits permitted if:
  - Breach has occurred
  - OCR investigation initiated
  - Reasonable suspicion of non-compliance

**Audit Scope:**
1. **Technical Controls:**
   - Encryption implementation (AES-256-GCM)
   - Key management procedures
   - Network security (TLS configuration)
   - Access controls (authentication/authorization)

2. **Administrative Controls:**
   - HIPAA policies and procedures
   - Workforce training records
   - Risk assessments
   - Incident response plans

3. **Physical Controls:**
   - Data center security (via infrastructure provider attestation)
   - Workstation security
   - Media disposal procedures

4. **Audit Logs:**
   - Review of PHI access logs
   - Verification of log integrity (immutability)
   - Analysis of anomalous activity

5. **Subcontractor Management:**
   - BAAs with subcontractors (if applicable)
   - Conduit designations (Railway.app, etc.)

---

#### D.2 Audit Process

**Step 1: Audit Request (45 days advance notice)**
- Covered Entity sends written audit request
- Specifies audit scope, dates, auditor information
- Business Associate acknowledges receipt within 5 days

**Step 2: Confidentiality Agreement**
- Auditor signs NDA with Business Associate
- Scope limited to HIPAA compliance verification
- No disclosure of proprietary information outside audit purpose

**Step 3: Document Review (Remote)**
- Business Associate provides requested documents electronically
- Policies, procedures, audit logs, training records
- Security audit reports, penetration test results

**Step 4: Technical Assessment (On-Site or Remote)**
- Auditor interviews key personnel (CTO, Security Engineer)
- Review of architecture diagrams and data flows
- Code review of encryption implementation (if necessary)
- Network security assessment

**Step 5: Audit Report (Within 30 Days)**
- Auditor prepares written report of findings
- Classifies findings: Critical, High, Medium, Low
- Recommendations for corrective action

**Step 6: Remediation (Within 60 Days)**
- Business Associate remediates Critical and High findings
- Provides evidence of remediation to Covered Entity
- For Medium/Low findings, proposes remediation timeline

---

#### D.3 Independent Security Audit Reports

**Business Associate shall provide Covered Entity with:**

1. **Annual SOC 2 Type II Report**
   - Service Organization Control (SOC) 2 audit
   - Covers Security, Availability, Confidentiality Trust Service Criteria
   - Observation period: Minimum 6 months

2. **Annual Penetration Test Report**
   - Conducted by independent security firm (e.g., Cure53, Trail of Bits)
   - OWASP Top 10 vulnerabilities tested
   - Zero-knowledge encryption architecture verified
   - Critical/High findings must be remediated before release

3. **HIPAA Security Assessment (Every 2 Years)**
   - Independent assessment of HIPAA Security Rule compliance
   - 45 C.F.R. §164.308, 164.310, 164.312 controls verified
   - Gap analysis and recommendations

**Delivery:**
- Reports provided to Covered Entity within 15 days of request
- Confidential treatment (shared only with authorized personnel)

---

#### D.4 Access to Books and Records

**Per 45 C.F.R. § 164.504(e)(2)(ii)(I):**
Business Associate's agreements with Covered Entity must provide that HHS Secretary has the right to access Business Associate's books and records to determine compliance with HIPAA.

**Business Associate agrees:**
1. To make internal practices, books, and records relating to PHI available to HHS Secretary for purposes of determining compliance with HIPAA Rules
2. If Business Associate does not provide access within 30 days, Covered Entity may terminate this Agreement

**Scope of HHS Access:**
- Policies and procedures related to PHI
- Training materials and workforce training records
- Audit logs and security incident reports
- Contracts with subcontractors
- Security risk assessments
- Breach notification records

---

#### D.5 Audit Costs

**Business Associate's Responsibility:**
- One (1) annual audit included in service fees
- Provide documents and reasonable cooperation at no additional cost
- Remediate findings at Business Associate's expense

**Covered Entity's Responsibility:**
- Auditor fees (unless audit triggers by Business Associate breach)
- Travel and expenses for on-site audits

**Breach-Triggered Audits:**
- If audit conducted due to Business Associate's Breach or non-compliance:
  - Business Associate pays all audit costs (including auditor fees)
  - Business Associate pays for follow-up audits to verify remediation

---

#### D.6 Corrective Action Plans

**For each audit finding, Business Associate shall:**

1. **Critical Findings (Immediate Risk to PHI):**
   - Acknowledge within 24 hours
   - Remediate within 7 days
   - Provide evidence of remediation

2. **High Findings (Significant Risk):**
   - Acknowledge within 3 business days
   - Remediate within 30 days
   - Provide corrective action plan (CAP) within 10 days

3. **Medium Findings (Moderate Risk):**
   - Acknowledge within 5 business days
   - Remediate within 60 days
   - Quarterly progress reports

4. **Low Findings (Best Practice):**
   - Acknowledge within 10 business days
   - Remediate within 90 days or explain why not feasible

**Failure to Remediate:**
- Covered Entity may terminate Agreement for material breach
- Business Associate liable for OCR penalties if violations persist

---

## Conclusion and Next Steps

This BAA template provides a comprehensive framework for HIPAA-compliant zero-knowledge encrypted backup services. **Key Takeaways:**

✅ **Railway is a conduit** (no BAA required with Railway)
✅ **We sign BAAs directly with customers** (we are the Business Associate)
✅ **Zero-knowledge architecture** provides superior security (infrastructure breach ≠ PHI breach)
✅ **Technical safeguards documented** (Appendix A)
✅ **Breach notification procedures** (Appendix B)
✅ **Subcontractor designations** (Appendix C - Railway as conduit)
✅ **Audit rights** (Appendix D - annual audits, SOC 2, penetration testing)

---

### CRITICAL NEXT STEPS:

1. ✅ **Legal Review REQUIRED**
   - Have qualified HIPAA attorney review this template
   - Customize for your jurisdiction and business model
   - Verify indemnification clauses with insurance provider

2. ✅ **Independent Security Audit**
   - Engage third-party auditor (Cure53, Trail of Bits, NCC Group)
   - Verify zero-knowledge architecture
   - Obtain written attestation for customer due diligence

3. ✅ **Insurance Coverage**
   - Cyber liability insurance ($1M-5M recommended)
   - Verify coverage includes HIPAA violations and breach costs
   - Review indemnification limits with insurer

4. ✅ **Customer Due Diligence Package**
   - Prepare package including:
     - This BAA template
     - Technical safeguards documentation (Appendix A)
     - Railway conduit classification document
     - Independent audit reports
     - SOC 2 Type II report (once obtained)

5. ✅ **OCR Pre-Consultation (Optional but Recommended)**
   - For high-value customers, consider pre-launch OCR guidance
   - Submit technical architecture for informal review
   - Document OCR feedback for customer assurance

---

**Document Control:**
- **Version:** 1.0 (DRAFT - Legal Review Required)
- **Classification:** Legal Template - HIPAA Compliance
- **Review Cycle:** Annually or upon regulatory changes
- **Next Review:** 2026-01-22
- **Approvals Required:** Legal Counsel (MANDATORY), Compliance Officer, CEO

---

**© 2025 [Company Name]**
**Prepared by:** Zainab Hassan, Platform Security Engineer
**Legal Disclaimer:** THIS IS A TEMPLATE ONLY. Do not execute without legal counsel review. HIPAA compliance is complex and fact-specific; this template provides a starting point but must be customized to your specific circumstances.

**Contact for Legal Review:**
[Legal Counsel Name]
[Law Firm]
[Email]
[Phone]
