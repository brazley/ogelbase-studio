# Neon Extraction Quick Reference

**TL;DR**: Extract Proxy (~15k LOC Rust), integrate PgBouncer, add simple autoscaling. Delivers 70% of Neon's value in 3-6 months. Skip custom storage for now.

---

## Prioritized Component List

| # | Component | Extract? | Complexity | Railway Compat | Business Value | Timeline |
|---|-----------|----------|------------|----------------|----------------|----------|
| 1 | **Proxy** | ✅ YES | LOW-MED | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 2 months |
| 2 | **PgBouncer** | ✅ YES (Already exists) | LOW | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 2 weeks |
| 3 | **Autoscaler** | ✅ YES | MEDIUM | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 2 months |
| 4 | **Pageserver** | ⏸️ DEFER | VERY HIGH | ⭐⭐ | ⭐⭐⭐⭐⭐ | 18 months |
| 5 | **Safekeeper** | ⏸️ DEFER | VERY HIGH | ⭐ | ⭐⭐⭐⭐ | 12 months |
| 6 | **Storage Controller** | ❌ SKIP | VERY HIGH | ⭐ | ⭐⭐ | N/A |
| 7 | **Storage Broker** | ❌ SKIP | MEDIUM | ⭐ | ⭐ | N/A |
| 8 | **Control Plane** | ❌ SKIP | LOW-MED | ⭐ | ⭐ | N/A |
| 9 | **Custom Compute** | ❌ SKIP | VERY HIGH | ⭐ | ⭐ | N/A |

---

## Phase 1 Roadmap (6 months)

### Month 1-2: Proxy Extraction
- Clone neondatabase/neon repo
- Extract proxy/ directory (~15k LOC Rust)
- Remove Neon control plane dependencies
- Add Railway API integration
- WebSocket/HTTP protocol testing
- Deploy to Railway staging

**Deliverable**: Standalone proxy handling 10k+ connections

### Month 2: PgBouncer Integration
- Deploy Railway's PgBouncer template
- Configure dynamic pool sizing (0.9 * max_connections)
- Integrate with proxy layer
- Performance benchmarking

**Deliverable**: Connection pooling supporting 10k concurrent connections

### Month 3-4: Autoscaling
- Extract autoscaler-agent logic (~1k LOC Rust)
- Implement load average monitoring
- Build Railway API integration for compute resizing
- Add scale-to-zero capability
- Prometheus metrics export

**Deliverable**: Basic autoscaling with scale-to-zero (<60s resume)

### Month 5-6: Integration & Launch
- End-to-end production testing
- Documentation (architecture, deployment, migration)
- Private beta (10+ customers)
- Monitoring/observability dashboards
- Public launch

**Deliverable**: Production-ready serverless Postgres

---

## Key Files to Extract

```
neon/
├── proxy/                    # ⭐ Core extraction target
│   ├── src/
│   │   ├── proxy.rs         # Main proxy logic
│   │   ├── auth.rs          # Authentication
│   │   ├── pool.rs          # Connection pooling
│   │   └── websocket.rs     # WebSocket support
│   ├── Cargo.toml           # Rust dependencies
│   └── README.md            # Proxy documentation
│
├── libs/                     # ⭐ Shared utilities
│   ├── utils/               # Common utilities
│   ├── metrics/             # Metrics collection
│   └── postgres_ffi/        # Postgres FFI bindings
│
└── docs/                     # 📚 Architecture reference
    ├── proxy.md             # Proxy documentation
    ├── autoscaling.md       # Autoscaling architecture
    └── sourcetree.md        # Repository structure
```

---

## Technical Stack (Phase 1)

### Core Technologies
- **Rust**: Proxy implementation, autoscaler
- **PgBouncer**: Connection pooling (C)
- **Postgres**: Standard Railway Postgres (no modifications)
- **Railway API**: Compute management, metrics, provisioning

### Dependencies (from Neon's Cargo.toml)
```toml
tokio = "*"              # Async runtime
hyper = "*"              # HTTP/2
rustls = "*"             # TLS
serde = "*"              # Serialization
postgres = "*"           # Postgres protocol
prometheus = "*"         # Metrics
```

### Infrastructure
- Railway's container orchestration
- Railway's networking primitives
- Railway's Postgres service
- Railway's metrics API

---

## Architecture Diagram (Phase 1)

```
┌─────────────┐
│   Client    │ ← @neondatabase/serverless driver
└──────┬──────┘
       │ HTTP/WebSocket
       ▼
┌──────────────────┐
│   Neon Proxy     │ ← Extracted from Neon (Rust)
│ - WebSocket→TCP  │
│ - Auth           │
│ - Routing        │
└──────┬───────────┘
       │ TCP
       ▼
┌──────────────────┐
│   PgBouncer      │ ← Railway template (C)
│ - Pool mgmt      │
│ - 10k conns      │
└──────┬───────────┘
       │ TCP (reduced)
       ▼
┌──────────────────┐
│ Railway Postgres │ ← Standard Postgres
│ - No mods        │
│ - pgBackRest     │
└──────────────────┘

┌──────────────────┐
│  Autoscaler      │ ← Extracted logic (Rust)
│ - Load monitor   │
│ - Scale-to-zero  │
│ - Railway API    │
└──────────────────┘
```

---

## Licensing Checklist

✅ **Allowed** (Apache 2.0):
- Fork and modify any component
- Commercial use without royalties
- Sublicense under different terms
- Private use without disclosure

⚠️ **Required**:
- Include Apache 2.0 license text
- State changes in modified files
- Preserve copyright notices
- Include NOTICE file content

❌ **Prohibited**:
- Use Neon trademarks
- Patent litigation (triggers termination)
- Claim warranty

---

## Success Metrics

### Technical KPIs
- [ ] 10,000+ concurrent connections supported
- [ ] <100ms connection establishment latency
- [ ] 100% Postgres protocol compatibility
- [ ] WebSocket/HTTP support functional
- [ ] <60s scale-to-zero resume time
- [ ] 99.9% uptime SLA

### Business KPIs
- [ ] 50%+ cost reduction for low-traffic DBs
- [ ] 30%+ of new Postgres on serverless offering
- [ ] 20%+ competitive win rate improvement
- [ ] NPS 50+ from serverless users
- [ ] 10+ beta customers in production

---

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Rust expertise gap | MED | Hire 1-2 Rust engineers or contract consultancy |
| Railway API limitations | MED | Work with Railway team, simplify autoscaling if needed |
| Neon architecture changes | LOW | Fork at stable tag, control upgrade timing |
| Performance regressions | LOW | Comprehensive benchmarking, aggressive optimization |
| Databricks IP claims | LOW | Apache 2.0 protects, code pre-dates acquisition |

---

## Resources

### Official Neon Resources
- **Repository**: https://github.com/neondatabase/neon
- **Docs**: https://github.com/neondatabase/neon/tree/main/docs
- **Blog**: https://neon.com/blog (architecture posts)
- **License**: Apache 2.0

### Community Resources
- **local-neon-http-proxy**: https://github.com/TimoWilhelm/local-neon-http-proxy
- **Neon serverless driver**: https://github.com/neondatabase/serverless
- **Railway PgBouncer**: https://railway.com/deploy/postgres-pgbouncer

### Technical Deep Dives
- Architecture decisions: https://neon.com/blog/architecture-decisions-in-neon
- Autoscaling: https://neon.com/blog/scaling-serverless-postgres
- Storage engine: https://neon.com/blog/how-we-scale-an-open-source-multi-tenant-storage-engine-for-postgres-written-rust

---

## Alternatives (If Extraction Too Complex)

### Plan B: Simplified TypeScript Proxy
- Build Neon-inspired proxy in TypeScript/Node.js
- 4-6 months development time
- Less specialized knowledge required
- Trade performance for faster implementation

### Plan C: Partner with Existing Solutions
- Use Neon's serverless driver with Railway Postgres
- Minimal development effort
- Vendor dependency and margin pressure
- Not recommended due to Databricks acquisition uncertainty

### Plan D: Standard Postgres + Enhancements
- PgBackRest for PITR
- PgBouncer for pooling
- Custom autoscaling without proxy layer
- No edge/serverless driver support
- Simpler but less differentiated

---

## Team Requirements

### Phase 1 Team (3-6 months)
- **1x Senior Rust Engineer**: Proxy extraction, architecture
- **1x Mid-Level Rust Engineer**: Autoscaler, utilities
- **1x Railway Platform Engineer**: API integration, deployment
- **1x DevOps Engineer**: Infrastructure, monitoring, testing
- **1x Technical Writer**: Documentation, migration guides

### Skills Required
- Rust (tokio, async, FFI)
- Postgres internals (wire protocol, WAL)
- Distributed systems (basic understanding)
- Railway API/platform knowledge
- Connection pooling (PgBouncer)

---

## Next Steps

### This Week
1. Clone neondatabase/neon repository
2. Build locally, understand dependencies
3. Map proxy/ directory in detail
4. Deploy local-neon-http-proxy with Railway Postgres
5. Assemble team (hire/contract Rust engineers)

### Next 2 Weeks
1. Complete technical validation
2. Create detailed extraction plan
3. Set up development environment
4. Begin proxy extraction work
5. Kick off Phase 1 implementation

---

**Last Updated**: November 21, 2025
**Document Owner**: Zara Okafor (Dylan Torres - Web Dev TPM)
**Status**: Ready for executive review and go/no-go decision
