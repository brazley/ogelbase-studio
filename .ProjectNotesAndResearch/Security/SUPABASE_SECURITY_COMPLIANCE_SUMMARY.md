# Supabase Security Compliance & Features Summary
**Research Date:** November 21, 2025
**Purpose:** Understanding Supabase's security posture for OgelBase project

---

## Executive Summary

Supabase provides **SOC 2 Type 2** and **HIPAA** compliance certifications with strong security features across all tiers. Most security features are available on all paid plans, with enterprise-grade network security requiring Enterprise tier. **HIPAA compliance requires minimum Team plan ($599/month) plus $350/month add-on.**

---

## 1. COMPLIANCE CERTIFICATIONS

### ✅ SOC 2 Type 2 Compliant
- **Status:** Active and regularly audited
- **Availability:** All projects (Free, Pro, Team, Enterprise)
- **Access to Reports:** Team and Enterprise customers can access SOC 2 reports via dashboard
- **Audit Frequency:** Annual audits with continuous monitoring between cycles

### ✅ HIPAA Compliant
- **Status:** Available for Protected Health Information (PHI/ePHI)
- **Minimum Plan Required:** Team Plan ($599/month)
- **Additional Cost:** $350/month HIPAA add-on
- **Requirements:**
  - Sign Business Associate Agreement (BAA) with Supabase
  - Configure HIPAA-specific project settings per security advisor
  - Enable Point-in-Time Recovery (requires small compute add-on)
  - Enable SSL enforcement
  - Disable data sharing in Supabase AI editor
- **Audit Frequency:** Annual audits covering all HIPAA controls
- **Shared Responsibility Model:**
  - **Supabase (Business Associate):** Infrastructure security, vendor BAAs (AWS, etc.), breach reporting, technical safeguards
  - **Customer (Covered Entity):** HIPAA Privacy Rule, Security Rule, Breach Notification Rule compliance, internal processes

### ❌ ISO 27001
- **Status:** Not currently certified
- **Alternative:** For Enterprise customers, Supabase can collaborate to assess specific ISO 27001 controls not covered in SOC 2 report and implement necessary controls within agreed timeframe
- **Note:** SOC 2 Type 2 covers many similar controls to ISO 27001

### ✅ Other Compliance
- **GDPR:** Compliant (EU data protection)
- **PCI DSS:** Uses Stripe (PCI Level 1) for payment processing; no credit card data stored

---

## 2. SECURITY FEATURES BY TIER

### 🆓 Free Plan ($0/month)
**Included Security Features:**
- ✅ Data encryption at rest (AES-256)
- ✅ Data encryption in transit (TLS/SSL)
- ✅ Row Level Security (RLS) - PostgreSQL native
- ✅ Authentication with JWT tokens
- ✅ OAuth providers & magic links
- ✅ Separate API keys (anon & service role)
- ✅ DDoS protection (Cloudflare CDN)
- ✅ Basic rate limiting
- ✅ Application-level encryption for sensitive tokens/keys
- ❌ No database backups
- ❌ No PITR (Point-in-Time Recovery)
- ❌ No SOC 2 report access
- ❌ No HIPAA support
- ❌ No SSO
- ❌ No custom domains
- ❌ Community support only

### 💎 Pro Plan ($25/month)
**Everything in Free, plus:**
- ✅ Daily automated backups (7-day retention)
- ✅ Point-in-Time Recovery (PITR) - Available as paid add-on (hourly billing)
- ✅ Email support
- ✅ Cost controls & spend caps (enabled by default)
- ✅ Higher usage quotas with predictable overage rates
- ✅ $10/month compute credits included
- ❌ No SOC 2 report access
- ❌ No HIPAA support
- ❌ No SSO for dashboard
- ❌ No advanced collaboration features

### 👥 Team Plan ($599/month)
**Everything in Pro, plus:**
- ✅ SOC 2 Type 2 report access
- ✅ HIPAA compliance eligibility (requires $350/month add-on)
- ✅ SSO for dashboard access
- ✅ Extended backup retention (14 days)
- ✅ Extended log retention (28 days)
- ✅ Organization-level roles & permissions
- ✅ Service Level Agreements (SLAs)
- ✅ Advanced team collaboration features
- ✅ Centralized billing
- ✅ Better support response times
- ❌ No 24/7 support
- ❌ No private Slack channel
- ❌ No custom security reviews

### 🏢 Enterprise Plan (Custom Pricing)
**Everything in Team, plus:**
- ✅ Extended backup retention (30 days)
- ✅ AWS PrivateLink (VPC private connectivity via AWS VPC Lattice)
- ✅ Custom contracted quotas & SLAs
- ✅ 24/7 priority support
- ✅ Dedicated private Slack channel
- ✅ Custom security reviews & audits
- ✅ Bring Your Own Cloud (BYO Cloud) deployment option
- ✅ Dedicated account management
- ✅ ISO 27001 control collaboration
- ✅ Custom compliance requirements support

---

## 3. CORE SECURITY FEATURES (Standard Across Plans)

### 🔐 Data Protection
| Feature | Description | Availability |
|---------|-------------|--------------|
| **Encryption at Rest** | AES-256 encryption for all stored data | All plans |
| **Encryption in Transit** | TLS/SSL for all connections | All plans |
| **Sensitive Data Protection** | Application-level encryption for tokens/keys before storage | All plans |
| **Database Backups** | Daily automated backups | Pro+ (7-30 day retention) |
| **Point-in-Time Recovery** | Restore to any point in time (seconds granularity) | Pro+ (add-on, hourly billing) |

### 🛡️ Access Control & Authentication
| Feature | Description | Availability |
|---------|-------------|--------------|
| **Row Level Security (RLS)** | PostgreSQL native row-level access control, auto-enabled on new tables | All plans |
| **JWT Token Authentication** | Secure token-based authentication | All plans |
| **OAuth Providers** | Social login integration (Google, GitHub, etc.) | All plans |
| **Magic Links** | Passwordless authentication | All plans |
| **Multi-Factor Auth (MFA)** | 2FA for user accounts | All plans |
| **API Key Separation** | Distinct anon (public) and service role (admin) keys | All plans |
| **Role-Based Access Control** | Organization-level roles (Read-Only, Billing-Only, etc.) | Team+ |
| **SSO for Dashboard** | Single sign-on for team access | Team+ |

### 🚨 Threat Protection
| Feature | Description | Availability |
|---------|-------------|--------------|
| **DDoS Protection** | Cloudflare CDN-level protection | All plans |
| **Brute Force Prevention** | fail2ban implementation | All plans |
| **Rate Limiting** | Customizable API rate limits | All plans |
| **IP-based Rate Limiting** | Automatic blocking after 100 requests/5min from same IP | All plans |
| **Spend Caps** | Budget controls to prevent surprise bills | Pro+ |
| **Auth Rate Limits** | Configurable authentication endpoint throttling | All plans |

### 📊 Monitoring & Auditing
| Feature | Description | Availability |
|---------|-------------|--------------|
| **Database Query Logs** | Monitor and identify unauthorized access | All plans |
| **Audit Logging** | Trigger-based audit tables with auth.uid() and IP tracking | All plans (manual setup) |
| **Log Retention** | 1 day (Free), 7 days (Pro), 28 days (Team), custom (Enterprise) | Tier-dependent |
| **Security Scanning** | GitHub, Vanta, and Snyk for vulnerability detection | All plans |
| **Penetration Testing** | Regular third-party security assessments | Platform-wide |

### 🌐 Network Security
| Feature | Description | Availability |
|---------|-------------|--------------|
| **SSL/TLS Enforcement** | Mandatory encrypted connections | All plans (HIPAA requires explicit enforcement) |
| **API Security Controls** | Securing Data API endpoints | All plans |
| **CORS Configuration** | Cross-origin request management | All plans |
| **Custom Domains** | Branded domain support | Team+ |
| **AWS PrivateLink** | VPC private connectivity (no public internet exposure) | Enterprise (Private Alpha) |

---

## 4. WHAT WE SHOULD LEVERAGE

### ✨ Security "Goodies" Included in All Plans
These are powerful security features available even on Free/Pro plans that we should utilize:

1. **Row Level Security (RLS)** - PostgreSQL-native, auto-enabled on new tables
   - Define policies to control row access based on user identity
   - Essential for multi-tenant applications
   - Zero additional cost

2. **JWT Token Authentication** - Industry-standard secure tokens
   - Separate anon (public) and service role (admin) keys
   - Works seamlessly with modern frontend frameworks

3. **Multi-Factor Authentication (MFA)** - Security without complexity
   - Protect user accounts with 2FA
   - Built-in, no third-party integration needed

4. **DDoS Protection via Cloudflare** - Enterprise-grade defense
   - Included at all tiers
   - Protects against volumetric attacks

5. **Rate Limiting & Brute Force Prevention** - Automatic protection
   - IP-based throttling (100 requests/5min)
   - fail2ban implementation
   - Customizable limits

6. **Encryption Everywhere** - AES-256 at rest, TLS in transit
   - No configuration needed
   - Meets most compliance requirements

7. **Audit Logging Capability** - Track everything
   - Database triggers for audit tables
   - Capture auth.uid() and IP addresses
   - Essential for compliance and forensics

8. **OAuth Providers** - Secure social login
   - Pre-integrated with major providers
   - Reduces password-related vulnerabilities

### 🎯 Security Best Practices We Should Implement

1. **Enable RLS on all tables** - Especially for any user-generated content
2. **Use service role key only server-side** - Never expose to frontend
3. **Set up audit logging tables** - Track sensitive operations
4. **Configure rate limits** - Beyond defaults for critical endpoints
5. **Monitor database logs regularly** - Set up alerts for suspicious patterns
6. **Implement proper JWT expiration** - Short-lived tokens with refresh strategy
7. **Use environment variables** - Never commit API keys to repositories
8. **Enable spend caps** (Pro+) - Protect against billing surprises

---

## 5. HIPAA COMPLIANCE - DETAILED REQUIREMENTS

### If We Need HIPAA Compliance:

**Minimum Investment:**
- Team Plan: $599/month
- HIPAA Add-on: $350/month
- PITR Add-on: ~$100-200/month (required, varies by usage)
- **Total: ~$1,049-1,149/month minimum**

**Process:**
1. Upgrade to Team or Enterprise plan
2. Request HIPAA add-on through Supabase dashboard
3. Sign Business Associate Agreement (BAA)
4. Configure HIPAA project:
   - Enable Point-in-Time Recovery
   - Enable SSL enforcement
   - Disable data sharing in AI editor
   - Follow security advisor recommendations
5. Implement internal compliance:
   - HIPAA Privacy Rule compliance
   - Security Rule implementation
   - Breach notification procedures
   - Staff training programs
   - Business associate management

**Key Considerations:**
- Self-hosted Supabase does NOT support HIPAA out of the box
- Requires annual audits (covered by Supabase)
- Shared responsibility: Supabase handles infrastructure, you handle application logic & processes
- All standard SOC 2 controls PLUS additional HIPAA-specific controls

---

## 6. PRICING TIER DECISION GUIDE

### Choose **Free Plan** ($0/month) if:
- Development/testing environment
- Personal projects or MVPs
- Can tolerate 1 week inactivity pausing
- Don't need backups or production support
- ✅ **Still get:** Encryption, RLS, Auth, DDoS protection, rate limiting

### Choose **Pro Plan** ($25/month) if:
- Production application
- Need daily backups (7-day retention)
- Want email support & cost controls
- Don't need SOC 2 reports or HIPAA
- Can handle compliance manually
- ✅ **Get:** All Free features + backups, PITR option, better support

### Choose **Team Plan** ($599/month) if:
- Need SOC 2 report access for customers/audits
- Planning for HIPAA compliance (add $350/month)
- Want SSO for team dashboard access
- Need longer log retention (28 days vs 7 days)
- Require SLAs and better support
- Managing multiple team members with role-based access
- ✅ **Get:** All Pro features + compliance reports, SSO, extended retention, SLAs

### Choose **Enterprise Plan** (Custom) if:
- Need AWS PrivateLink (VPC private connectivity)
- Require 30-day backup retention
- Want 24/7 support with dedicated Slack channel
- Need custom security reviews or ISO 27001 collaboration
- Require BYO Cloud deployment
- Have large-scale, mission-critical requirements
- ✅ **Get:** Everything + maximum security, compliance, and support

---

## 7. RECOMMENDATIONS FOR THIS PROJECT

### Immediate Actions (Current Phase):
1. **Start with Pro Plan** ($25/month) for development
   - Gets us production-ready infrastructure
   - Daily backups for safety
   - Email support for blockers
   - Can add PITR if needed (~$100/month extra)

2. **Enable RLS on all tables** from day one
   - Free security feature
   - Easier to implement early than retrofit later

3. **Set up audit logging tables** for sensitive operations
   - Track user actions
   - Essential for future compliance

4. **Configure rate limiting** beyond defaults
   - Protect authentication endpoints
   - Prevent abuse

5. **Use separate environments** (Free for dev, Pro for staging/prod)
   - Free plan fine for local development
   - Pro plan for actual user testing and production

### Future Considerations:

**If we need SOC 2 compliance** (for enterprise customers):
- Upgrade to Team Plan ($599/month)
- Access SOC 2 Type 2 reports
- Show customers our infrastructure meets security standards

**If we need HIPAA compliance** (for healthcare data):
- Budget $1,000-1,200/month minimum
- Plan 2-4 weeks for BAA process and configuration
- Implement internal HIPAA compliance program
- Consider consulting with HIPAA compliance expert

**If we scale to enterprise customers:**
- Consider Enterprise plan for PrivateLink (VPC isolation)
- 24/7 support becomes valuable
- Custom SLAs and security reviews available

---

## 8. SECURITY FEATURE COMPARISON TABLE

| Feature | Free | Pro | Team | Enterprise |
|---------|------|-----|------|------------|
| **Encryption (rest/transit)** | ✅ | ✅ | ✅ | ✅ |
| **Row Level Security** | ✅ | ✅ | ✅ | ✅ |
| **JWT Auth + OAuth** | ✅ | ✅ | ✅ | ✅ |
| **MFA Support** | ✅ | ✅ | ✅ | ✅ |
| **DDoS Protection** | ✅ | ✅ | ✅ | ✅ |
| **Rate Limiting** | ✅ | ✅ | ✅ | ✅ |
| **Daily Backups** | ❌ | ✅ (7d) | ✅ (14d) | ✅ (30d) |
| **Point-in-Time Recovery** | ❌ | ✅ (add-on) | ✅ (add-on) | ✅ (add-on) |
| **SOC 2 Report Access** | ❌ | ❌ | ✅ | ✅ |
| **HIPAA Compliance** | ❌ | ❌ | ✅ (+$350) | ✅ (+$350) |
| **SSO for Dashboard** | ❌ | ❌ | ✅ | ✅ |
| **Log Retention** | 1 day | 7 days | 28 days | Custom |
| **Support Level** | Community | Email | Priority | 24/7 + Slack |
| **SLAs** | ❌ | ❌ | ✅ | ✅ (custom) |
| **AWS PrivateLink** | ❌ | ❌ | ❌ | ✅ |
| **Custom Security Reviews** | ❌ | ❌ | ❌ | ✅ |
| **BYO Cloud** | ❌ | ❌ | ❌ | ✅ |

---

## 9. KEY TAKEAWAYS

### ✅ What Supabase Does Well:
- Strong baseline security on all plans (even Free)
- PostgreSQL native features (RLS) instead of proprietary solutions
- Transparent compliance (SOC 2, HIPAA available)
- Reasonable pricing for compliance features
- Infrastructure security handled (encryption, DDoS, monitoring)

### ⚠️ Important Limitations:
- HIPAA requires minimum Team plan + $350/month add-on
- ISO 27001 not certified (can collaborate on controls for Enterprise)
- Free plan has no backups (data loss risk)
- Advanced network security (PrivateLink) Enterprise-only
- Self-hosted Supabase doesn't support HIPAA out of the box

### 💡 Smart Moves:
- Leverage RLS from day one (free, powerful, standard)
- Start Pro plan for production ($25/month gets you backups + support)
- Implement audit logging early (easier than retrofitting)
- Use environment-based approach (Free dev, Pro prod)
- Plan compliance budget if targeting healthcare or enterprise

### 🎯 Recommended Starting Point:
**Pro Plan ($25/month) with:**
- RLS enabled on all tables
- Audit logging for sensitive operations
- Rate limiting configured
- Monitoring alerts set up
- Environment variables for secrets

This gives production-ready security without over-investing before validation.

---

## Resources
- Supabase Security Overview: https://supabase.com/security
- SOC 2 Compliance: https://supabase.com/docs/guides/security/soc-2-compliance
- HIPAA Compliance: https://supabase.com/docs/guides/security/hipaa-compliance
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Pricing: https://supabase.com/pricing
- Platform Security: https://supabase.com/docs/guides/security/platform-security
