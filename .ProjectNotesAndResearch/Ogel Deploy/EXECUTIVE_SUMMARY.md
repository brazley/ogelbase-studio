# Ogel Deploy: Executive Summary
## Building Our Own Vercel/Netlify on Railway

**Date**: 2025-11-22
**Research Team**: Maya Patel, Jordan Kim, Marcus Chen, Hassan Malik, Omar Diallo
**TPM**: Dylan Torres

---

## 🎯 Bottom Line

**We can build a production-grade deployment platform on Railway** by adapting Appwrite's battle-tested architecture. Total implementation: **8-12 weeks** to MVP, **$20-32/month** operational cost.

---

## What We Discovered

### Appwrite Architecture

Appwrite is a **Firebase alternative** with a "Sites" feature that deploys web apps alongside backend services. Key insights:

**✅ Strengths**:
- Queue-based build system (non-blocking)
- Docker isolation (secure builds)
- 12+ framework support (Next.js, React, Vue, Svelte, etc.)
- Unified backend + frontend (not bolted on)
- Self-hostable (no vendor lock-in)
- Battle-tested multi-tenancy

**⚠️ Trade-offs**:
- Container-based (1-3s cold starts vs Vercel's edge workers)
- No ISR (Incremental Static Regeneration)
- Single region by default
- Resource intensive (each preview = full container)

---

## Our Implementation Strategy

### Phase 1: Infrastructure Setup (Weeks 1-2)
**Owner**: Hassan Malik + Maya Patel

- Deploy MariaDB on Railway for Appwrite
- Configure Appwrite services (API, Executor, Workers)
- Set up private network connectivity
- **Cost**: +$10-15/month
- **Deliverable**: Appwrite running on Railway

### Phase 2: Studio Integration (Weeks 3-4)
**Owner**: Jordan Kim + Marcus Chen

- Build Studio ↔ Appwrite API bridge
- Project provisioning workflow
- Environment variable injection
- Custom domain management
- **Deliverable**: Deploy button in Studio UI

### Phase 3: Build Pipeline (Weeks 5-6)
**Owner**: Maya Patel + Rafael Santos

- Implement build queue (BullMQ/Redis)
- GitHub webhook integration
- Real-time build logs (WebSocket)
- Preview URL generation
- **Deliverable**: CI/CD for deployed apps

### Phase 4: Production Features (Weeks 7-8)
**Owner**: Full Team

- Template marketplace (40+ starters)
- Framework auto-detection
- SSL automation
- Rollback mechanism
- **Deliverable**: Production-ready platform

---

## Architecture Decisions

### Two-Database Approach (Recommended)

```
┌─────────────────────────────────────────────┐
│           PostgreSQL (Studio)               │
│  • User auth & org management               │
│  • Project metadata                         │
│  • Billing & subscriptions                  │
│  • RLS-enforced multi-tenancy               │
└─────────────────────────────────────────────┘
                     ↕
┌─────────────────────────────────────────────┐
│          MariaDB (Appwrite/Apps)            │
│  • Deployed app data                        │
│  • Collections & documents                  │
│  • File metadata                            │
│  • Namespace-based isolation                │
└─────────────────────────────────────────────┘
           ↕                    ↕
    ┌──────────┐        ┌─────────────┐
    │  Redis   │        │  Railway    │
    │  Queue   │        │  Volumes    │
    └──────────┘        └─────────────┘
```

**Why Two Databases?**
- ✅ No Appwrite fork to maintain
- ✅ PostgreSQL RLS for sensitive Studio data
- ✅ Appwrite's proven patterns for app data
- ✅ Clear separation of concerns
- ✅ Independent scaling

**Security**: Apps never get direct DB credentials. They only receive Appwrite API endpoints and project-scoped keys (more secure than raw DB access).

---

## Cost Breakdown

### Current Stack
```
Studio (Railway):     $20/month
Postgres:             $5/month
Redis:                $5/month
MongoDB:              $5/month
──────────────────────────────
Total:                $35/month
```

### With Ogel Deploy
```
Current:              $35/month
MariaDB:              +$5-10/month
Appwrite Service:     +$10/month (embedded workers)
Storage (initial):    Included (Railway volumes)
──────────────────────────────
Total:                $50-55/month
```

### With Optimizations (Month 2+)
```
Private Network:      -$9/month (egress savings)
Service Consolidation: -$10/month
External Storage (R2): -$5/month
──────────────────────────────
Optimized Total:      $26-31/month
```

**Cost per deployed app**: ~$0.50-2/month depending on traffic

---

## What We Get vs Vercel/Netlify

### Feature Comparison

| Feature | Vercel | Netlify | Ogel Deploy |
|---------|--------|---------|-------------|
| Static Sites | ✅ | ✅ | ✅ |
| SSR (Next.js) | ✅ | ✅ | ✅ |
| Preview URLs | ✅ | ✅ | ✅ |
| Custom Domains | ✅ | ✅ | ✅ |
| Auto SSL | ✅ | ✅ | ✅ |
| Edge Workers | ✅ | ✅ | ❌ (containers) |
| ISR | ✅ | ❌ | ❌ |
| Backend Integration | External | External | **✅ Native** |
| Self-Hosted | ❌ | ❌ | **✅ Yes** |
| Cost (5 projects) | $20+ | $19+ | **~$2-10** |

### Our Differentiators

**✅ Unified Backend + Frontend**
- No external API calls (same private network)
- Shared auth, database, storage
- Single dashboard for everything

**✅ Self-Hosted Control**
- Your data, your infrastructure
- No vendor lock-in
- Custom modifications possible

**✅ Cost Efficiency**
- $0.50-2/app vs $20/month minimum
- No egress fees within Railway network
- Pay only for what you use

---

## Technical Architecture

### Build Flow

```
GitHub Push
    ↓
Webhook → Studio API
    ↓
Create Deployment Record (PostgreSQL)
    ↓
Enqueue Build Job (Redis)
    ↓
Build Worker picks job
    ↓
Clone repo in Docker container
    ↓
npm install → npm run build
    ↓
Package artifacts to Storage
    ↓
Update deployment status
    ↓
Generate preview URL
    ↓
WebSocket: notify user (build complete)
```

### Service Architecture

```
┌────────────────────────────────────────────┐
│         Studio (Next.js + tRPC)            │
│  • Project management UI                   │
│  • Deployment dashboard                    │
│  • Build logs viewer                       │
│  • Settings & domains                      │
└────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────┐
│         Appwrite API Service               │
│  • Project provisioning                    │
│  • Build orchestration                     │
│  • Domain management                       │
│  • Storage API                             │
└────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────┐
│        Background Build Workers            │
│  • Webhook handler                         │
│  • Build executor (Docker)                 │
│  • Audit worker                            │
│  • Cleanup worker                          │
└────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────┐
│            Data Layer                      │
│  PostgreSQL │ MariaDB │ Redis │ Storage    │
└────────────────────────────────────────────┘
```

---

## Framework Support

**Confirmed Working**:
- ✅ Next.js (static + SSR)
- ✅ React (CRA, Vite)
- ✅ Vue (Vue CLI, Vite)
- ✅ Svelte/SvelteKit
- ✅ Nuxt
- ✅ Remix
- ✅ Astro
- ✅ Angular
- ✅ Solid.js
- ✅ Qwik
- ✅ Flutter Web
- ✅ Static HTML/CSS/JS

**Auto-Detection**: Appwrite's Utopia Detector library automatically identifies framework and configures build settings.

---

## Security Model

### Multi-Tenancy Isolation

**Studio Data (PostgreSQL RLS)**:
```sql
-- Database-enforced isolation
CREATE POLICY "Users can only see their orgs"
ON platform.organizations
FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM platform.organization_members
    WHERE organization_id = id
  )
);
```

**Deployed App Data (Appwrite Namespace)**:
```javascript
// Application-enforced isolation
const table = `_${projectId}_users`; // e.g., _789_users
// Every query automatically scoped to project
```

**API Key Scoping**:
- Project-scoped keys (can't access other projects)
- Scope-limited (read-only, admin, custom)
- Expiration support
- Rotation via Studio UI

### Build Security

- Docker isolation (no shared state)
- Resource limits (CPU, memory, time)
- Network isolation during builds
- Artifact signing and verification

---

## Implementation Risks

### Medium Risk

**Database Compatibility**:
- **Risk**: Appwrite expects MySQL/MariaDB
- **Mitigation**: Deploy MariaDB on Railway (proven working)
- **Fallback**: PostgreSQL adapter (requires Appwrite fork)

**Build Performance**:
- **Risk**: Container cold starts (1-3s)
- **Mitigation**: Keep workers warm, connection pooling
- **Fallback**: Pre-warm containers for active projects

### Low Risk

**Railway Networking**:
- **Risk**: Private network DNS resolution
- **Mitigation**: Already proven with our current stack
- **Fallback**: Public endpoints with auth

**Storage Costs**:
- **Risk**: Railway volume pricing
- **Mitigation**: Migrate to Cloudflare R2 (cheap egress)
- **Fallback**: S3-compatible storage

---

## Success Metrics

### Week 2 (Infrastructure)
- ✅ Appwrite running on Railway
- ✅ Private network connectivity verified
- ✅ Health checks passing

### Week 4 (Integration)
- ✅ Deploy button working in Studio
- ✅ Project provisioning flow complete
- ✅ Environment variables injected correctly

### Week 6 (Build Pipeline)
- ✅ GitHub integration functional
- ✅ Builds complete successfully
- ✅ Preview URLs accessible
- ✅ Real-time logs working

### Week 8 (Production)
- ✅ SSL automation working
- ✅ Custom domains configured
- ✅ Rollback mechanism tested
- ✅ 5+ templates available
- ✅ End-to-end smoke tests passing

---

## Team Assignments

### Infrastructure (Hassan Malik)
- Railway service setup
- Network configuration
- Resource optimization
- Cost monitoring

### Backend Integration (Jordan Kim)
- Studio ↔ Appwrite API bridge
- Project provisioning
- Domain management
- Authentication flow

### Build Pipeline (Maya Patel)
- Queue implementation (BullMQ)
- Docker build execution
- Artifact storage
- Webhook handlers

### Frontend (Marcus Chen)
- Studio UI updates
- Deployment dashboard
- Build logs viewer
- Template marketplace

### Database (Omar Diallo)
- MariaDB setup
- Schema migrations
- Multi-tenancy validation
- Performance tuning

---

## Next Steps

### This Week (Immediate)

**Dylan (TPM)**:
1. ✅ Review this executive summary
2. ⏳ Get stakeholder approval (budget, timeline)
3. ⏳ Create Sprint in `.SoT/sprints/sprint-XX/`
4. ⏳ Break into tickets with clear deliverables

**Hassan**:
1. ⏳ Deploy MariaDB on Railway (test environment)
2. ⏳ Configure Appwrite (docker-compose → Railway services)
3. ⏳ Validate private network connectivity
4. ⏳ Document setup process

**Omar**:
1. ⏳ Create database schema for project mapping
2. ⏳ Design Studio ↔ Appwrite data sync
3. ⏳ Test multi-tenancy isolation
4. ⏳ Prepare migration scripts

### Next Week (Sprint Planning)

1. Finalize architecture decisions
2. Set up development environment
3. Create technical design docs
4. Begin Phase 1 implementation

---

## Open Questions for Decision

### Technical

1. **MariaDB vs MySQL 8.0?**
   - Railway supports both
   - Appwrite works with either
   - **Recommendation**: MariaDB (slightly cheaper, same performance)

2. **Storage Backend?**
   - Railway volumes (simple, integrated)
   - Cloudflare R2 (cheap, scalable)
   - **Recommendation**: Start with volumes, migrate to R2 in Phase 4

3. **Build Caching?**
   - Appwrite doesn't cache by default
   - Could implement layer caching
   - **Recommendation**: Phase 2 optimization (not MVP)

### Business

1. **Pricing Model?**
   - Free tier (X projects)?
   - Pay-per-deployment?
   - Flat rate per project?
   - **Recommendation**: Discuss with stakeholders

2. **Resource Limits?**
   - Build timeout (default: 10 min)?
   - Storage quota per project?
   - Bandwidth limits?
   - **Recommendation**: Start conservative, adjust based on usage

3. **Support Model?**
   - Self-service only?
   - Community support (Discord)?
   - Enterprise support tiers?
   - **Recommendation**: Self-service for MVP

---

## Comparison to BuildShip Vision

### BuildShip (API Builder)
- **Focus**: Visual workflow builder for API endpoints
- **Timeline**: 8 weeks to MVP
- **Tech**: ReactFlow + Bun server
- **Target**: Backend developers, API automation

### Ogel Deploy (App Deployment)
- **Focus**: Deploy full-stack web apps (frontend + backend)
- **Timeline**: 8-12 weeks to MVP
- **Tech**: Appwrite + Railway
- **Target**: Frontend developers, full-stack apps

### Synergy

These are **complementary**, not competing:

1. **BuildShip** = Create custom API endpoints
2. **Ogel Deploy** = Deploy apps that use those APIs

**Combined Vision**: Full-stack platform where you can:
- Build custom backend APIs (BuildShip)
- Deploy frontend apps (Ogel Deploy)
- All integrated, all self-hosted

---

## Conclusion

Appwrite provides a **proven blueprint** for building Vercel/Netlify functionality. By adapting their architecture to Railway, we can deliver:

- ✅ **Self-hosted** deployment platform
- ✅ **Unified** backend + frontend experience
- ✅ **Cost-effective** ($0.50-2/app vs $20/month)
- ✅ **Production-ready** architecture (battle-tested)
- ✅ **Framework-agnostic** (12+ frameworks supported)
- ✅ **Railway-native** (private network, optimal costs)

**Recommendation**: Proceed with implementation. Start with Phase 1 infrastructure setup while finalizing business decisions.

---

## Research Documentation

All detailed analysis available in:

```
.ProjectNotesAndResearch/Ogel Deploy/
├── EXECUTIVE_SUMMARY.md           # This document
├── ARCHITECTURE_OVERVIEW.md       # Full architecture deep dive (Jordan)
├── QUICK_REFERENCE.md             # Fast lookup guide (Jordan)
├── DEPLOYMENT_INFRASTRUCTURE.md   # Build pipeline & deployment (Maya)
├── FRONTEND_DEPLOYMENT.md         # Framework support & UX (Marcus)
├── INFRASTRUCTURE_STRATEGY.md     # Railway adaptation plan (Hassan)
├── DATABASE_ARCHITECTURE.md       # Multi-tenancy & data model (Omar)
└── DATABASE_ARCHITECTURE_DIAGRAMS.md  # Visual diagrams (Omar)
```

**Total Research Output**: ~200KB of comprehensive analysis

---

**Date**: 2025-11-22
**Status**: Research Complete, Awaiting Go Decision
**Next Milestone**: Stakeholder approval + Sprint planning
