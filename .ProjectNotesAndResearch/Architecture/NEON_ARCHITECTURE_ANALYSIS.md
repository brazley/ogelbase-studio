# Neon Database Architecture Analysis
**Analysis Date**: November 21, 2025
**Repository**: https://github.com/neondatabase/neon
**Purpose**: Railway Deployment Compatibility Assessment

---

## Executive Summary

Neon is an open-source serverless PostgreSQL platform built in Rust that fundamentally restructures PostgreSQL by separating storage and compute layers. The system redistributes data across a cluster of nodes with a sophisticated multi-service architecture designed for cloud-native deployment.

**Key Architectural Principle**: Stateless compute nodes + distributed storage layer + consensus-based WAL service.

---

## Service Inventory

### Critical Core Services (Required for Basic Operation)

| Service | Purpose | Port(s) | Language | Scalability |
|---------|---------|---------|----------|-------------|
| **Storage Broker** | Pub-sub message broker for safekeeper/pageserver coordination | 50051 (gRPC) | Rust | Stateless, single instance sufficient |
| **Pageserver** | Primary storage engine, handles GetPage@LSN requests | 9898 (HTTP), 6400 (pg protocol) | Rust | Can scale, but complex |
| **Safekeeper** (×3) | Quorum-based WAL consensus service | 5454 (replication), 7676-7678 (HTTP) | Rust | **Requires 3 instances minimum** |
| **Compute Node** | Stateless PostgreSQL instance (modified fork) | 55433 (PostgreSQL), 3080 (HTTP) | C/Rust | Scales independently |
| **Object Storage** | S3-compatible storage (MinIO/AWS S3) | 9000 (API), 9001 (console) | N/A | External dependency |

### Optional Services

| Service | Purpose | Production Need |
|---------|---------|----------------|
| **Storage Controller** | Multi-pageserver orchestration API | Required for multi-pageserver clusters |
| **Proxy** | PostgreSQL protocol auth/routing layer | Production-grade authentication |
| **Control Plane** | Local dev provisioning tooling | Development only, not production |

---

## Technology Stack

### Primary Languages
- **Rust** (core services): pageserver, safekeeper, storage_broker, proxy, storage_controller
- **C/PostgreSQL** (modified): Custom PostgreSQL fork (v14-v17 supported)
- **Python 3.11+** (testing): Integration test framework

### Key Dependencies

**Build-time:**
- Rust toolchain (version pinned via `rust-toolchain.toml`)
- Protocol Buffers 3.15+ (service communication)
- PostgreSQL client libraries (libpq)
- OpenSSL, libseccomp, readline, zlib

**Runtime:**
- S3-compatible object storage (AWS S3, MinIO, Azure Blob)
- Postgres database for storage_controller state (if multi-pageserver)

### Build System
- **Primary**: GNU Make with recursive makefiles
- **Rust**: Cargo with workspace structure
- **Cache optimization**: cargo-chef for Docker layer caching
- **Test framework**: cargo-nextest (not standard cargo test)

---

## Inter-Service Communication Patterns

### Communication Protocols

| Source → Destination | Protocol | Purpose |
|---------------------|----------|---------|
| Compute → Pageserver | PostgreSQL wire (libpq) | GetPage@LSN requests |
| Compute → Safekeeper | PostgreSQL streaming replication | WAL shipping |
| Safekeeper → Storage Broker | gRPC pub-sub | Timeline status updates |
| Pageserver → Storage Broker | gRPC subscribe | Discover active safekeepers |
| Pageserver → Safekeeper | PostgreSQL streaming replication | WAL retrieval |
| Pageserver → S3 | AWS S3 API | Layer file archival |
| Safekeeper → S3 | AWS S3 API | WAL offloading |
| Storage Controller → Pageserver | HTTP/REST | Shard management |

### Critical Dependencies

**Startup Order:**
1. Object Storage (MinIO/S3) must be available
2. Storage Broker must start first
3. Safekeepers can start (discover via broker)
4. Pageserver starts (connects to broker, safekeepers, S3)
5. Compute nodes start last (connect to pageserver)

**Quorum Requirements:**
- **Safekeeper cluster**: Minimum 3 instances, requires 2/3 majority for writes
- **Pageserver**: Single writer per tenant (no replication at pageserver level)

---

## Storage Requirements

### Persistent Volumes Needed

| Service | Volume Purpose | Growth Pattern | Durability Need |
|---------|---------------|----------------|-----------------|
| **Pageserver** | Layer files cache | Grows with WAL, bounded by GC | High (but recoverable from S3) |
| **Safekeeper** | WAL segments | Grows until offloaded to S3 | **Critical** (consensus data) |
| **Compute** | Ephemeral state | Minimal (stateless) | Low |
| **S3/MinIO** | Permanent storage | Linear with database size + retention | **Critical** (source of truth) |

### Storage Architecture Notes

- **Immutable layer files**: Pageserver creates new files, never modifies existing
- **Dual-tier storage**: Local disk (hot) + S3 (cold/archival)
- **GC policy**: Default 64 MB LSN horizon, configurable retention
- **Branch overhead**: Parent timelines require layer retention for child branches

---

## Multi-Tenancy & Isolation

### Tenant Model
- **Identifier**: 32-character hexadecimal string
- **Isolation**: Physical directory separation (`/tenants/<tenant_id>`)
- **Write safety**: Single writer guarantee per tenant-timeline
- **Dynamic provisioning**: Tenants created without pageserver restart

### Resource Boundaries
- Independent WAL redo processes per tenant
- Separate timelines and branches per tenant
- No cross-tenant data leakage in storage or protocol layers

---

## Existing Containerization Approach

### Docker Images (Official)

**neondatabase/neon**
- Contains: pageserver, safekeeper, proxy binaries
- Base: Debian Bookworm
- Size: Multi-stage build optimized
- Versions: Tagged with release versions + "latest"

**neondatabase/compute-node**
- Contains: Modified PostgreSQL (v14, v15, v16, v17)
- Separate images per PG version
- Built from vendor/postgres-vXX directories

### Multi-Stage Build Strategy

```
Stage 1: pg-build    → Compile all PostgreSQL versions
Stage 2: plan        → cargo-chef dependency caching
Stage 3: build       → Compile Rust binaries
Final:   Runtime     → Minimal Debian + binaries + configs
```

**Build-time configurables:**
- `PG_VERSION`: Default 16
- `TAG`: Image version
- `BUILD_TYPE`: debug/release

### Docker Compose Example

**Current implementation** (test-oriented, not production):
```yaml
services:
  minio: MinIO S3-compatible storage
  storage-broker: gRPC coordination
  pageserver: Storage engine
  safekeeper-{1,2,3}: Quorum consensus
  compute: PostgreSQL endpoint
```

**Notable gaps in compose setup:**
- No storage_controller (required for production multi-pageserver)
- No proxy service (auth layer missing)
- Health checks basic
- Not designed for horizontal scaling

---

## Authentication & Security

### JWT-Based Authentication

**Algorithm**: EdDSA (RFC 8037)
**Key Distribution**: Single key pair per installation
- Private key: Signs tokens (control plane only)
- Public key: Distributed to all services for validation

### Token Scopes

| Scope | Access Level |
|-------|-------------|
| `tenant` | Single tenant data |
| `pageserverapi` | All-tenant pageserver API |
| `safekeeperdata` | All safekeeper data |
| `generations_api` | Storage controller upcalls |
| `admin` | Control plane/admin APIs |

### Authentication Configuration

**Pageserver**: `http_auth_type` and `pg_auth_type` (Trust or NeonJWT)
**Safekeeper**: `auth-validation-public-key-path` (omit to disable)

**Critical Limitation**: No key rotation without full service restart.

---

## Deployment Considerations for Railway

### ✅ Railway-Compatible Characteristics

1. **Containerized**: Fully Dockerized with official images
2. **12-factor friendly**: Environment-driven configuration
3. **Stateless compute**: Compute nodes can scale horizontally
4. **S3 integration**: Can use Railway-connected S3 storage
5. **HTTP health checks**: Services expose /v1/status endpoints
6. **Port flexibility**: Configurable service ports

### ⚠️ Railway Compatibility Challenges

1. **Quorum requirement**: Safekeepers need 3 stable instances
   - Railway's ephemeral containers may cause quorum instability
   - Network partitions could break consensus

2. **Multi-service orchestration**: 5-7 services need coordination
   - Railway doesn't have native service dependency management
   - No built-in pub-sub broker (need storage_broker)

3. **Storage controller**: Production needs Postgres for state
   - Adds another database dependency
   - Not included in docker-compose example

4. **Persistent volumes**: Safekeepers need durable storage
   - Railway volumes are per-service
   - No shared volumes across safekeeper replicas

5. **Network topology**: Services need reliable inter-service communication
   - Storage broker needs static addressing
   - Pageserver needs to discover safekeepers via broker

6. **Resource intensity**: Pageserver is memory-heavy
   - Railway resource limits may constrain performance
   - No documented minimum resource requirements

### 🔴 Critical Blockers for Railway

1. **No Kubernetes**: Neon's production design assumes k8s orchestration
   - Storage broker documentation mentions "delegates fault tolerance to Kubernetes"
   - No documented non-k8s production deployment pattern

2. **Complex failure recovery**: Quorum consensus + distributed state
   - Automatic recovery requires sophisticated orchestration
   - Railway's simple restart policy may be insufficient

3. **Stateful service coordination**: Safekeepers are stateful and interdependent
   - Railway's container model is optimized for stateless services
   - No native support for Raft/Paxos-style consensus

4. **Build complexity**: Multi-stage builds with PostgreSQL compilation
   - Extremely long build times (compiles 4 PG versions)
   - Railway build timeout limits may be exceeded

---

## Service Dependency Graph

```
                   ┌─────────────┐
                   │   MinIO/S3  │
                   │   (Object   │
                   │   Storage)  │
                   └──────┬──────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         │                │                │
    ┌────▼────┐      ┌────▼────┐     ┌────▼────┐
    │Safekeeper│ ◄───►│Safekeeper│◄───►│Safekeeper│
    │    1     │      │    2     │     │    3     │
    └────┬─────┘      └────┬─────┘     └────┬─────┘
         │                 │                 │
         │           ┌─────▼─────┐           │
         └──────────►│  Storage  │◄──────────┘
                     │   Broker  │
                     │  (gRPC)   │
                     └─────┬─────┘
                           │
                      ┌────▼────┐
                      │  Page   │
                      │  Server │
                      └────┬────┘
                           │
                      ┌────▼────┐
                      │ Compute │
                      │  Node   │
                      │  (PG)   │
                      └─────────┘
```

**Legend:**
- `─►` : Service dependency (startup order)
- `◄─►` : Bidirectional communication

---

## Missing Documentation

The following critical production deployment information is not documented:

1. **Resource requirements**: No CPU/memory minimums specified
2. **Production deployment guide**: No k8s manifests, Helm charts, or IaC templates
3. **Monitoring & observability**: No documented metrics/logging strategy
4. **Backup & recovery**: No documented disaster recovery procedures
5. **Performance tuning**: No guidance on production configuration
6. **High availability**: No HA deployment patterns documented
7. **Network requirements**: No bandwidth/latency specifications
8. **Key rotation**: No procedure for JWT key rotation without downtime

---

## Recommended Next Steps

### Phase 1: Feasibility Assessment
1. **Prototype single-node setup**: Deploy all services on Railway to test basic functionality
2. **Test safekeeper stability**: Monitor quorum behavior under Railway container restarts
3. **Measure resource usage**: Profile memory/CPU under realistic workload
4. **Test failure scenarios**: Simulate container restarts, network partitions

### Phase 2: Architecture Adaptation (If Feasible)
1. **External S3**: Use AWS S3 instead of MinIO (reduce service count)
2. **Single safekeeper?**: Research if 1-node safekeeper acceptable for dev/staging
3. **Railway-specific health checks**: Implement robust readiness probes
4. **Environment-based config**: Map all config to Railway env vars

### Phase 3: Production Considerations (If Pursuing)
1. **External Kubernetes**: Deploy Neon on managed k8s, expose via Railway proxy
2. **Managed PostgreSQL**: Use Railway Postgres for storage_controller state
3. **External consensus**: Replace safekeeper quorum with managed etcd/consul
4. **Simplified fork**: Create Railway-optimized Neon variant (significant engineering)

---

## Conclusion

**Architectural Complexity**: High
**Railway Compatibility**: Low-to-Medium

Neon's architecture is **explicitly designed for Kubernetes orchestration** with sophisticated consensus requirements, stateful services, and complex inter-service dependencies. Railway's simplified container platform lacks native support for:

- Quorum-based consensus (3-node safekeeper requirement)
- Stateful set management
- Service mesh / advanced networking
- Automatic failure recovery for distributed systems

**Recommendation**: Neon is **not a good fit for native Railway deployment** without significant architectural modifications. Consider:

1. **Alternative 1**: Deploy Neon on managed Kubernetes (GKE/EKS), proxy through Railway
2. **Alternative 2**: Use managed Neon Cloud (official hosted service)
3. **Alternative 3**: Build Railway-specific serverless Postgres from simpler architecture (e.g., single-node with S3 WAL archival)

The engineering effort to adapt Neon for Railway would be **substantial** (estimated 3-6 months) and would require maintaining a fork divergent from upstream.
