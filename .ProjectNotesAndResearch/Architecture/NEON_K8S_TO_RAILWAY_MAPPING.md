# Neon Kubernetes → Railway Primitive Mapping

**Last Updated:** 2025-01-21
**Purpose:** Map Neon's actual K8s primitives to Railway equivalents with gaps, workarounds, and trade-offs

---

## Executive Summary

Neon uses Kubernetes for three primary reasons:
1. **Stateful quorum-based Safekeepers** (3+ nodes, Paxos consensus, persistent WAL storage)
2. **Stateless compute autoscaling** (VMs in pods, scale-to-zero, live migration)
3. **Service discovery mesh** (storage broker pub/sub, pageserver-safekeeper coordination)

**Railway's Position:** Can handle #2 excellently, struggles with #1 (no multi-replica volumes or stable identities), and has gaps in #3 (no pub/sub, limited service discovery).

---

## Component 1: Safekeepers (Stateful WAL Service)

### What Neon Needs

**Purpose:** Quorum-based Write-Ahead Log persistence using Paxos consensus
- Minimum 3 replicas for majority quorum
- Persistent disk storage for WAL durability
- Stable network identities for Paxos leader election
- Each safekeeper must know its peers' addresses
- Split-brain prevention via consensus algorithm
- NO direct safekeeper-to-safekeeper communication (all via compute node)

**Current K8s Implementation:**
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: safekeeper
spec:
  serviceName: safekeeper
  replicas: 3
  volumeClaimTemplates:
  - metadata:
      name: wal-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 100Gi
```

### Kubernetes Primitives Used

| Primitive | Why Neon Needs It | Critical? |
|-----------|-------------------|-----------|
| **StatefulSet** | Stable pod names (safekeeper-0, safekeeper-1, safekeeper-2) for Paxos identity | ✅ YES |
| **Headless Service** | DNS entries for each pod (safekeeper-0.safekeeper.default.svc.cluster.local) | ✅ YES |
| **PersistentVolumeClaim per pod** | Each replica gets its own volume that survives restarts | ✅ YES |
| **Stable network identity** | Same IP/hostname after pod restart for consensus | ✅ YES |
| **Ordered deployment** | Start safekeeper-0, then safekeeper-1, then safekeeper-2 | ⚠️ NICE |

### Railway Equivalent

| Capability | Railway Support | Status |
|------------|-----------------|--------|
| **Service with replicas** | ✅ Horizontal scaling (N replicas) | Available |
| **Persistent volumes per replica** | ❌ Single volume shared, NOT per-replica | **GAP** |
| **Stable network identities** | ❌ No stable hostnames per replica | **GAP** |
| **Private DNS per replica** | ❌ Single DNS name for load-balanced service | **GAP** |
| **Ordered deployment** | ❌ All replicas start simultaneously | Minor gap |

### The Problem

**Railway volumes mount to a service, not per-replica.** This means:
```
Neon needs:     Railway gives:
safekeeper-0    safekeeper-abc123 ┐
  └─ volume-0     └─ volume-XYZ    ├─ All share same volume
safekeeper-1                       │  (data corruption risk!)
  └─ volume-1                      ├─ All share same DNS name
safekeeper-2                       │  (no stable identity!)
  └─ volume-2                      ┘
```

### Workarounds & Trade-offs

#### Option 1: Separate Railway Services (Recommended)
```
Create 3 distinct Railway services:
├─ safekeeper-0.railway.internal (with volume-0)
├─ safekeeper-1.railway.internal (with volume-1)
└─ safekeeper-2.railway.internal (with volume-2)
```

**Trade-offs:**
- ✅ Each safekeeper gets persistent storage
- ✅ Each gets stable DNS name
- ✅ Prevents data corruption
- ❌ Manual service management (no unified scaling)
- ❌ Must manually configure peer addresses
- ❌ No automatic orchestration like StatefulSet
- ⚠️ Uses 3x service quota

**Configuration needed:**
```bash
# Safekeeper 0
SAFEKEEPER_ID=0
SAFEKEEPER_PEERS="safekeeper-1.railway.internal:5454,safekeeper-2.railway.internal:5454"

# Safekeeper 1
SAFEKEEPER_ID=1
SAFEKEEPER_PEERS="safekeeper-0.railway.internal:5454,safekeeper-2.railway.internal:5454"

# Safekeeper 2
SAFEKEEPER_ID=2
SAFEKEEPER_PEERS="safekeeper-0.railway.internal:5454,safekeeper-1.railway.internal:5454"
```

#### Option 2: External Consensus Service
Use managed etcd/Consul for coordination, Railway services for execution.

**Trade-offs:**
- ✅ Railway handles execution layer
- ✅ External service handles consensus
- ❌ Additional external dependency
- ❌ Increased latency (external calls)
- ❌ More complex architecture
- 💰 Additional cost

#### Option 3: Single Safekeeper (Development Only)
Run one safekeeper, sacrifice high availability.

**Trade-offs:**
- ✅ Works perfectly on Railway
- ✅ Simple configuration
- ❌ No fault tolerance
- ❌ NOT production-ready
- ⚠️ Only for testing

**Verdict:** Railway cannot replicate K8s StatefulSet behavior for distributed consensus workloads without workarounds.

---

## Component 2: Pageservers (Stateful Storage Backend)

### What Neon Needs

**Purpose:** Store committed WAL and reconstruct pages on-demand
- Each pageserver stores different data shards
- Persistent local disk for layer files and metadata
- Communicates with S3 for cold storage
- Uses storage broker for service discovery
- Can scale horizontally but each instance is stateful

**Current K8s Implementation:**
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: pageserver
spec:
  replicas: 5  # Can scale based on workload
  volumeClaimTemplates:
  - metadata:
      name: pageserver-data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: fast-nvme
      resources:
        requests:
          storage: 500Gi
```

### Kubernetes Primitives Used

| Primitive | Why Neon Needs It | Critical? |
|-----------|-------------------|-----------|
| **StatefulSet** | Each pageserver stores different data shards | ✅ YES |
| **PersistentVolume per pod** | Local caching of hot data, layer files | ✅ YES |
| **Dynamic scaling** | Add/remove pageservers based on load | ⚠️ NICE |
| **Fast local disk** | NVME for performance | ✅ YES |

### Railway Equivalent

Same fundamental gap as Safekeepers:
- ❌ No per-replica volumes
- ❌ No stable identities for sharding

### Workarounds

#### Option 1: Separate Railway Services per Pageserver
```
pageserver-0.railway.internal (shard: tenant-1, tenant-2)
pageserver-1.railway.internal (shard: tenant-3, tenant-4)
pageserver-2.railway.internal (shard: tenant-5, tenant-6)
```

**Trade-offs:**
- ✅ Works like StatefulSet
- ❌ Manual sharding management
- ❌ No auto-rebalancing

#### Option 2: Stateless Pageservers + External Storage
Use Railway services, store ALL data in S3 (no local caching).

**Trade-offs:**
- ✅ Railway can scale these easily
- ❌ Performance degradation (S3 latency)
- ❌ Higher S3 egress costs
- ⚠️ Defeats Neon's caching architecture

**Verdict:** Same StatefulSet limitation applies. Pageservers need stable storage per instance.

---

## Component 3: Compute Nodes (Stateless Postgres)

### What Neon Needs

**Purpose:** Stateless Postgres VMs that execute queries
- Autoscale based on load (scale to zero)
- Rapid provisioning and teardown
- Live migration for workload balancing
- NO persistent storage (all state in storage layer)
- Load balancing across instances

**Current K8s Implementation:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: compute
spec:
  replicas: 10  # Dynamic based on load
  template:
    spec:
      containers:
      - name: postgres
        # NeonVM custom resource actually, but acts like pod
```

### Kubernetes Primitives Used

| Primitive | Why Neon Needs It | Critical? |
|-----------|-------------------|-----------|
| **Deployment** | Stateless replicas, easy scaling | ✅ YES |
| **Horizontal Pod Autoscaler** | Scale based on CPU/memory | ✅ YES |
| **Custom Scheduler** | Resource-aware VM placement | ⚠️ NICE |
| **Live Migration (NeonVM)** | Move VMs without dropping connections | ⚠️ NICE |
| **Service (LoadBalancer)** | Distribute traffic across compute nodes | ✅ YES |

### Railway Equivalent

| Capability | Railway Support | Status |
|------------|-----------------|--------|
| **Service with replicas** | ✅ Horizontal scaling | ✅ PERFECT |
| **Autoscaling** | ✅ Vertical autoscaling, manual horizontal | ✅ GOOD |
| **Load balancing** | ✅ Automatic across replicas | ✅ PERFECT |
| **No persistent state** | ✅ Ephemeral by default | ✅ PERFECT |
| **Rapid provisioning** | ✅ Fast container starts | ✅ GOOD |
| **Live migration** | ❌ No live migration | Minor gap |

### Workarounds

**None needed!** This is Railway's sweet spot.

```yaml
# Railway can easily do:
Compute Service:
  replicas: 10
  healthcheck: /health
  autoscaling: vertical (CPU/RAM)
  volumes: none
```

**Trade-offs:**
- ✅ Railway excels at stateless workloads
- ✅ Automatic load balancing
- ✅ Simple horizontal scaling
- ❌ No live migration (brief connection drops during restarts)
- ❌ Manual autoscaling triggers (no HPA equivalent)

**Verdict:** Railway handles this BETTER than K8s in many ways (simpler, better DX).

---

## Component 4: Storage Broker (Pub/Sub Service Discovery)

### What Neon Needs

**Purpose:** Stateless pub/sub broker for storage node coordination
- Safekeepers publish timeline status
- Pageservers subscribe to find active safekeepers
- Stateless (fault tolerance via K8s restart)
- gRPC-based communication

**Current K8s Implementation:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: storage-broker
spec:
  replicas: 3  # For HA
  template:
    spec:
      containers:
      - name: storage-broker
        ports:
        - containerPort: 50051  # gRPC
```

### Kubernetes Primitives Used

| Primitive | Why Neon Needs It | Critical? |
|-----------|-------------------|-----------|
| **Deployment** | Stateless replicas for HA | ✅ YES |
| **Service (ClusterIP)** | Internal endpoint for pub/sub | ✅ YES |
| **Replicas** | Fault tolerance | ⚠️ NICE |

### Railway Equivalent

| Capability | Railway Support | Status |
|------------|-----------------|--------|
| **Stateless service** | ✅ Perfect fit | ✅ PERFECT |
| **Private networking** | ✅ Internal DNS + gRPC | ✅ GOOD |
| **Replicas** | ✅ Horizontal scaling | ✅ PERFECT |
| **Pub/sub pattern** | ⚠️ No native pub/sub, must implement | Gap |

### Workarounds

#### Option 1: Deploy Storage Broker as Railway Service
```
storage-broker.railway.internal
  replicas: 3
  protocol: gRPC
  private-only: true
```

**Trade-offs:**
- ✅ Railway handles the deployment
- ✅ Private networking for internal access
- ⚠️ Pub/sub logic must be in application code (not platform feature)
- ⚠️ No message queue guarantees (in-memory only)

#### Option 2: External Pub/Sub Service
Use Redis Pub/Sub or NATS instead of custom broker.

**Trade-offs:**
- ✅ Managed pub/sub semantics
- ✅ Railway can connect via private network
- ❌ External dependency
- ❌ Requires code changes to Neon

**Verdict:** Railway can run the broker, but you're implementing pub/sub yourself (no platform support).

---

## Component 5: Service Discovery & Networking

### What Neon Needs

**Purpose:** Nodes must find each other dynamically
- Safekeepers must advertise themselves
- Pageservers must discover safekeepers
- Compute nodes must find pageservers
- Storage broker must be reachable by all

**Current K8s Implementation:**
```bash
# Automatic DNS entries:
safekeeper-0.safekeeper.default.svc.cluster.local
safekeeper-1.safekeeper.default.svc.cluster.local
safekeeper-2.safekeeper.default.svc.cluster.local
storage-broker.default.svc.cluster.local
pageserver-0.pageserver.default.svc.cluster.local
```

### Kubernetes Primitives Used

| Primitive | Why Neon Needs It | Critical? |
|-----------|-------------------|-----------|
| **Headless Service** | DNS per StatefulSet pod | ✅ YES |
| **ClusterIP Service** | Stable endpoint for deployments | ✅ YES |
| **DNS-based discovery** | Automatic resolution | ✅ YES |
| **Cross-namespace networking** | Multi-tenant isolation | ⚠️ NICE |

### Railway Equivalent

| Capability | Railway Support | Status |
|------------|-----------------|--------|
| **Private DNS** | ✅ `service.railway.internal` | ✅ GOOD |
| **Service discovery** | ✅ DNS-based | ✅ GOOD |
| **Per-replica DNS** | ❌ Only service-level DNS | **GAP** |
| **IPv6 networking** | ✅ Mesh network | ✅ PERFECT |
| **Load balancing** | ✅ Automatic | ✅ PERFECT |

### The Problem

Railway gives you:
```
storage-broker.railway.internal → Load balances to any replica
compute.railway.internal        → Load balances to any replica
```

But NOT:
```
safekeeper-0.railway.internal  ❌
safekeeper-1.railway.internal  ❌
safekeeper-2.railway.internal  ❌
```

### Workarounds

#### Option 1: Separate Services (Again)
Each stateful component gets its own Railway service.

**Trade-offs:**
- ✅ Stable DNS per component
- ❌ No automatic pod-level DNS
- ⚠️ Must configure addresses manually

#### Option 2: Service Registry Pattern
Use external service registry (Consul, etcd).

**Trade-offs:**
- ✅ Dynamic registration
- ❌ External dependency
- ❌ Added complexity

**Verdict:** Railway has good service discovery for load-balanced services, but lacks per-replica DNS.

---

## Component 6: Persistent Storage

### What Neon Needs

**Purpose:** Durable storage for WAL and layer files
- Fast NVME disks for hot data
- Multiple independent volumes per service type
- Automatic provisioning
- Expandable storage
- Backup/restore capabilities

**Current K8s Implementation:**
```yaml
volumeClaimTemplates:
- metadata:
    name: wal-data
  spec:
    storageClassName: fast-nvme
    accessModes: ["ReadWriteOnce"]
    resources:
      requests:
        storage: 100Gi
```

### Kubernetes Primitives Used

| Primitive | Why Neon Needs It | Critical? |
|-----------|-------------------|-----------|
| **PersistentVolume** | Durable storage | ✅ YES |
| **StorageClass** | Provision NVME disks | ✅ YES |
| **Per-pod volumes** | Isolated storage per replica | ✅ YES |
| **Volume expansion** | Grow storage dynamically | ⚠️ NICE |

### Railway Equivalent

| Capability | Railway Support | Status |
|------------|-----------------|--------|
| **Persistent volumes** | ✅ Railway volumes | ✅ GOOD |
| **Fast NVME disks** | ✅ ZFS on NVME | ✅ PERFECT |
| **Volume expansion** | ✅ Supported (Pro+) | ✅ GOOD |
| **Per-replica volumes** | ❌ One volume per service | **GAP** |
| **Backup/restore** | ✅ Manual + automated | ✅ GOOD |

### The Problem

```
K8s StatefulSet:
├─ safekeeper-0 → volume-0 (100GB)
├─ safekeeper-1 → volume-1 (100GB)
└─ safekeeper-2 → volume-2 (100GB)

Railway Service:
└─ safekeeper (3 replicas) → volume-X (300GB) ← ALL SHARE!
```

### Workarounds

**Already covered above:** Use separate Railway services for each stateful replica.

**Verdict:** Railway volumes are excellent, but scoped to services, not replicas.

---

## Component 7: Health Checks & Restarts

### What Neon Needs

**Purpose:** Automatic failure detection and recovery
- Liveness probes (is service alive?)
- Readiness probes (is service ready for traffic?)
- Automatic restart on failure
- Graceful shutdown handling

**Current K8s Implementation:**
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  periodSeconds: 5
```

### Kubernetes Primitives Used

| Primitive | Why Neon Needs It | Critical? |
|-----------|-------------------|-----------|
| **Liveness probe** | Restart dead processes | ✅ YES |
| **Readiness probe** | Remove unhealthy pods from load balancer | ✅ YES |
| **Restart policy** | Automatic recovery | ✅ YES |

### Railway Equivalent

| Capability | Railway Support | Status |
|------------|-----------------|--------|
| **Health checks** | ✅ HTTP health check endpoint | ✅ PERFECT |
| **Automatic restart** | ✅ On failure | ✅ PERFECT |
| **Readiness gating** | ✅ Unhealthy replicas removed from LB | ✅ PERFECT |
| **Graceful shutdown** | ✅ SIGTERM handling | ✅ GOOD |

### Workarounds

**None needed!** Railway matches K8s here.

**Verdict:** Railway's health check system is on par with Kubernetes.

---

## Component 8: Configuration Management

### What Neon Needs

**Purpose:** Inject configuration into services
- Connection strings
- Feature flags
- Resource limits
- Peer addresses

**Current K8s Implementation:**
```yaml
envFrom:
- configMapRef:
    name: neon-config
- secretRef:
    name: neon-secrets
```

### Kubernetes Primitives Used

| Primitive | Why Neon Needs It | Critical? |
|-----------|-------------------|-----------|
| **ConfigMap** | Non-sensitive config | ✅ YES |
| **Secret** | Sensitive credentials | ✅ YES |
| **Environment variables** | Standard injection | ✅ YES |

### Railway Equivalent

| Capability | Railway Support | Status |
|------------|-----------------|--------|
| **Environment variables** | ✅ Per-service config | ✅ PERFECT |
| **Secrets** | ✅ Encrypted storage | ✅ PERFECT |
| **Shared config** | ⚠️ Must duplicate across services | Minor gap |
| **Dynamic updates** | ⚠️ Requires restart | Minor gap |

### Workarounds

#### Shared Configuration
Use Railway's environment groups or duplicate variables.

**Trade-offs:**
- ✅ Works fine for most use cases
- ❌ No single source of truth like ConfigMap
- ⚠️ Must update multiple services manually

**Verdict:** Railway's env vars work well, but lack K8s ConfigMap's centralization.

---

## Summary Matrix: Can Railway Replace K8s for Neon?

| Neon Component | K8s Primitive | Railway Equivalent | Gap Severity | Workaround Complexity |
|----------------|---------------|--------------------|--------------|-----------------------|
| **Safekeepers** | StatefulSet (3+ pods, quorum) | 3 separate services | 🔴 CRITICAL | 🟡 MEDIUM |
| **Pageservers** | StatefulSet (sharded data) | Separate services per shard | 🔴 CRITICAL | 🟡 MEDIUM |
| **Compute Nodes** | Deployment (stateless) | Service with replicas | 🟢 NONE | 🟢 NONE |
| **Storage Broker** | Deployment (pub/sub) | Service + app-level pub/sub | 🟡 MINOR | 🟢 LOW |
| **Service Discovery** | Headless Service + DNS | Private DNS (service-level) | 🟠 MODERATE | 🟡 MEDIUM |
| **Volumes** | PVC per pod | Volume per service | 🔴 CRITICAL | 🟡 MEDIUM |
| **Health Checks** | Liveness/Readiness probes | Health check endpoint | 🟢 NONE | 🟢 NONE |
| **Config** | ConfigMap + Secret | Environment variables | 🟡 MINOR | 🟢 LOW |
| **Autoscaling** | HPA (horizontal pod autoscaler) | Manual horizontal, auto vertical | 🟡 MINOR | 🟢 LOW |
| **Networking** | ClusterIP, Headless, Ingress | Private + public domains | 🟡 MINOR | 🟢 LOW |

---

## Critical Gaps: Why Railway Struggles with Neon

### 1. No Per-Replica Persistent Volumes ⛔
**Problem:** Railway mounts volumes to services, not individual replicas.

**Impact:** Cannot run distributed stateful systems like Neon's Safekeepers (Paxos quorum) or sharded Pageservers.

**Workaround:** Create separate Railway services for each stateful replica (lose unified orchestration).

### 2. No Stable Network Identities per Replica ⛔
**Problem:** Railway DNS resolves to service, not individual replicas.

**Impact:** Distributed consensus protocols like Paxos require stable peer addresses.

**Workaround:** Use separate services with stable DNS names, or external service registry.

### 3. No StatefulSet Equivalent ⛔
**Problem:** Railway doesn't have ordered, stable-identity deployment for stateful workloads.

**Impact:** Manual management of replicas, no automatic orchestration.

**Workaround:** Implement orchestration logic in application code.

---

## Where Railway BEATS Kubernetes

### 1. Developer Experience 🚀
- **Railway:** Click → Deploy → URL in 30 seconds
- **K8s:** Write YAML → Apply → Debug networking → Wait for LB → Setup ingress

### 2. Operational Overhead 🎯
- **Railway:** Managed platform, zero cluster management
- **K8s:** Upgrade nodes, manage etcd, monitor control plane, configure CNI

### 3. Cost Transparency 💰
- **Railway:** Pay for what you use, no cluster overhead
- **K8s:** Always paying for master nodes + worker nodes (even idle)

### 4. Networking Simplicity 🌐
- **Railway:** Private DNS works out of the box
- **K8s:** Configure CNI plugin, setup network policies, debug DNS

### 5. Stateless Workload Scaling 📈
- **Railway:** Slider to scale replicas, automatic load balancing
- **K8s:** Edit deployment YAML, apply, wait for rollout

---

## Recommendations

### ✅ Use Railway for:
- **Stateless services** (compute nodes, APIs, web apps)
- **Single-instance stateful services** (one primary database)
- **Prototyping and MVPs**
- **Teams without Kubernetes expertise**

### ❌ Don't use Railway for:
- **Distributed consensus systems** (Paxos, Raft, quorum-based)
- **Sharded stateful workloads** (multiple pageservers with different data)
- **Services requiring per-replica volumes**
- **Complex multi-tenant isolation** (K8s namespaces)

### 🤔 Hybrid Approach for Neon:
```
Railway: Compute nodes (stateless Postgres VMs)
         ├─ Excellent fit
         ├─ Autoscaling
         └─ Simple deployment

External: Safekeepers + Pageservers
         ├─ Managed K8s (GKE, EKS, AKS)
         ├─ Or dedicated VMs with manual orchestration
         └─ Or managed consensus service (etcd, etc.)
```

---

## Cost-Benefit Analysis

### Neon on Kubernetes
**Pros:**
- ✅ StatefulSets for safekeepers (quorum)
- ✅ Per-pod volumes (isolated data)
- ✅ Stable network identities (consensus)
- ✅ Advanced orchestration (operators, CRDs)

**Cons:**
- ❌ Complex to operate
- ❌ Cluster overhead costs
- ❌ Steep learning curve
- ❌ More failure points (control plane, etcd, nodes)

### Neon on Railway (with workarounds)
**Pros:**
- ✅ Simple deployment (stateless components)
- ✅ Lower operational overhead
- ✅ Faster iteration
- ✅ Pay-for-what-you-use

**Cons:**
- ❌ Cannot run true StatefulSets
- ❌ Manual orchestration for stateful components
- ❌ Separate services = more management
- ❌ No automatic failover for consensus

---

## Final Verdict

**Can Railway replace Kubernetes for Neon?**

**Short answer:** No, not fully.

**Long answer:** Railway can handle 70% of Neon's architecture (compute nodes, storage broker, networking) beautifully. But the 30% it can't handle (Safekeepers, Pageservers) is **critical** to Neon's design.

**The fundamental issue:** Neon's architecture assumes Kubernetes' StatefulSet primitive. Railway doesn't have an equivalent, and workarounds lose the orchestration benefits that make K8s valuable for stateful systems.

**Best path forward:**
1. Use Railway for stateless components (compute nodes, APIs)
2. Run stateful components on managed Kubernetes or dedicated infrastructure
3. Or redesign stateful components to not require per-replica state (massive architectural change)

**Railway is amazing for 90% of applications, but Neon is in the 10% that genuinely needs Kubernetes.**
