# Neon Architecture: Kubernetes vs Railway Comparison Diagram

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NEON ARCHITECTURE                                    │
└─────────────────────────────────────────────────────────────────────────────┘

                                CLIENT REQUESTS
                                      │
                                      ▼
                            ┌──────────────────┐
                            │  Load Balancer   │
                            └────────┬─────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │     COMPUTE LAYER               │
                    │  (Stateless Postgres VMs)       │
                    │                                 │
                    │  ┌──────┐  ┌──────┐  ┌──────┐ │
                    │  │VM #1 │  │VM #2 │  │VM #3 │ │ ← RAILWAY ✅ EXCELLENT
                    │  └──┬───┘  └──┬───┘  └──┬───┘ │
                    └─────┼─────────┼─────────┼─────┘
                          │         │         │
                          │    READ PAGES     │
                          │         │         │
                          ▼         ▼         ▼
                    ┌─────────────────────────────┐
                    │   STORAGE LAYER             │
                    │                             │
    ┌───────────────┼─────────────────────────────┼───────────────┐
    │               │                             │               │
    │  SAFEKEEPERS  │      PAGESERVERS           │  STORAGE      │
    │  (WAL Quorum) │      (Page Cache)          │  BROKER       │
    │               │                             │  (Pub/Sub)    │
    │  ┌─────────┐  │     ┌──────────┐           │  ┌────────┐   │
    │  │  SK-0   │  │     │   PS-0   │           │  │Broker  │   │
    │  │ [VOL-0] │◄─┼─────┤ [VOL-0]  │◄──────────┼─►│        │   │ ← RAILWAY ⚠️ WORKAROUND
    │  └────┬────┘  │     └──────────┘           │  └────────┘   │
    │       │       │                             │               │
    │  ┌────▼───┐   │     ┌──────────┐           │               │
    │  │  SK-1  │   │     │   PS-1   │           │               │
    │  │ [VOL-1]│◄──┼─────┤ [VOL-1]  │           │               │ ← RAILWAY ❌ CANNOT DO
    │  └────┬───┘   │     └──────────┘           │               │   (No per-replica volumes)
    │       │       │                             │               │
    │  ┌───▼────┐   │     ┌──────────┐           │               │
    │  │  SK-2  │   │     │   PS-2   │           │               │
    │  │ [VOL-2]│◄──┼─────┤ [VOL-2]  │           │               │
    │  └────────┘   │     └──────────┘           │               │
    │               │                             │               │
    │  Paxos Quorum │     Sharded Data           │  Service      │
    │  3+ nodes     │     Per-shard volumes      │  Discovery    │
    └───────┬───────┴─────────────┬───────────────┴───────────────┘
            │                     │
            │                     │
            ▼                     ▼
      ┌──────────────────────────────────┐
      │      S3 Object Storage            │  ← RAILWAY ✅ WORKS (External)
      │      (Cold Data)                  │
      └──────────────────────────────────┘
```

---

## Component Comparison Matrix

```
┌─────────────────────┬──────────────────────────┬──────────────────────────┐
│   COMPONENT         │   KUBERNETES             │   RAILWAY                │
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│                     │                          │                          │
│ COMPUTE NODES       │  ✅ Deployment           │  ✅ Service              │
│ (Stateless)         │     - Replicas: N        │     - Replicas: N        │
│                     │     - Autoscale (HPA)    │     - Manual scale       │
│                     │     - Load balancing     │     - Load balancing     │
│                     │                          │                          │
│  STATUS: ✅ MATCH   │  K8s: Good               │  Railway: EXCELLENT      │
│                     │                          │  (Simpler DX)            │
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│                     │                          │                          │
│ SAFEKEEPERS         │  ✅ StatefulSet          │  ❌ No StatefulSet       │
│ (Consensus Quorum)  │     - Stable names       │     - Must use separate  │
│                     │     - Per-pod volumes    │       services           │
│                     │     - Headless service   │     - No per-replica     │
│                     │     - Ordered deploy     │       volumes            │
│                     │                          │     - No stable identity │
│  STATUS: ❌ GAP     │  K8s: Perfect            │  Railway: WORKAROUND     │
│                     │                          │  (3 manual services)     │
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│                     │                          │                          │
│ PAGESERVERS         │  ✅ StatefulSet          │  ❌ No StatefulSet       │
│ (Sharded Storage)   │     - Per-pod volumes    │     - Must use separate  │
│                     │     - Dynamic scaling    │       services           │
│                     │     - Stable identity    │     - Manual sharding    │
│                     │                          │                          │
│  STATUS: ❌ GAP     │  K8s: Perfect            │  Railway: WORKAROUND     │
│                     │                          │  (Separate services)     │
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│                     │                          │                          │
│ STORAGE BROKER      │  ✅ Deployment           │  ✅ Service              │
│ (Pub/Sub)           │     - Stateless          │     - Stateless          │
│                     │     - Replicas for HA    │     - Replicas for HA    │
│                     │                          │     - No native pub/sub  │
│                     │                          │       (app-level)        │
│  STATUS: ⚠️ MINOR   │  K8s: Good               │  Railway: Good           │
│                     │                          │  (App handles pub/sub)   │
├─────────────────────┼──────────────────────────┼──────────────────────────┤
│                     │                          │                          │
│ SERVICE DISCOVERY   │  ✅ Headless Service     │  ✅ Private DNS          │
│                     │     - Pod-level DNS      │     - Service-level DNS  │
│                     │     - sk-0.sk.svc.local  │     - sk.railway.internal│
│                     │     - sk-1.sk.svc.local  │     - No per-replica DNS │
│                     │     - sk-2.sk.svc.local  │                          │
│                     │                          │                          │
│  STATUS: ⚠️ GAP     │  K8s: Excellent          │  Railway: Good           │
│                     │  (Per-pod DNS)           │  (Service DNS only)      │
└─────────────────────┴──────────────────────────┴──────────────────────────┘
```

---

## Kubernetes StatefulSet vs Railway Workaround

### What Neon Needs (3 Safekeepers with Paxos Quorum)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KUBERNETES STATEFULSET                                    │
└─────────────────────────────────────────────────────────────────────────────┘

    StatefulSet: safekeeper (replicas: 3)
           │
           ├─► Pod: safekeeper-0
           │      ├─ DNS: safekeeper-0.safekeeper.default.svc.cluster.local
           │      ├─ Volume: pvc-safekeeper-0 (100GB)
           │      └─ Paxos ID: 0
           │
           ├─► Pod: safekeeper-1
           │      ├─ DNS: safekeeper-1.safekeeper.default.svc.cluster.local
           │      ├─ Volume: pvc-safekeeper-1 (100GB)
           │      └─ Paxos ID: 1
           │
           └─► Pod: safekeeper-2
                  ├─ DNS: safekeeper-2.safekeeper.default.svc.cluster.local
                  ├─ Volume: pvc-safekeeper-2 (100GB)
                  └─ Paxos ID: 2

    Headless Service: safekeeper
           └─► Returns ALL pod IPs (no load balancing)

✅ BENEFITS:
   - Automatic pod naming (safekeeper-0, safekeeper-1, safekeeper-2)
   - Stable DNS per pod
   - Persistent volume per pod
   - Ordered startup/shutdown
   - Automatic pod replacement (safekeeper-1 dies → new safekeeper-1 created)


┌─────────────────────────────────────────────────────────────────────────────┐
│                    RAILWAY WORKAROUND                                        │
└─────────────────────────────────────────────────────────────────────────────┘

    Manual Setup: 3 Separate Services

    Service: safekeeper-0
           ├─ DNS: safekeeper-0.railway.internal
           ├─ Volume: volume-XYZ (100GB)
           ├─ Replicas: 1 (no scaling!)
           └─ ENV: SAFEKEEPER_ID=0
                   PEERS=safekeeper-1.railway.internal,safekeeper-2.railway.internal

    Service: safekeeper-1
           ├─ DNS: safekeeper-1.railway.internal
           ├─ Volume: volume-ABC (100GB)
           ├─ Replicas: 1 (no scaling!)
           └─ ENV: SAFEKEEPER_ID=1
                   PEERS=safekeeper-0.railway.internal,safekeeper-2.railway.internal

    Service: safekeeper-2
           ├─ DNS: safekeeper-2.railway.internal
           ├─ Volume: volume-DEF (100GB)
           ├─ Replicas: 1 (no scaling!)
           └─ ENV: SAFEKEEPER_ID=2
                   PEERS=safekeeper-0.railway.internal,safekeeper-1.railway.internal

⚠️ TRADE-OFFS:
   - ✅ Stable DNS per service
   - ✅ Persistent volume per service
   - ❌ Manual configuration (no automatic orchestration)
   - ❌ Must manually manage peer addresses
   - ❌ No automatic failover (must manually recreate)
   - ❌ 3x service quota usage
   - ❌ Cannot scale replicas (breaks consensus)
```

---

## The Critical Volume Problem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│         KUBERNETES: Per-Pod Volumes (StatefulSet)                            │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
    │ safekeeper-0 │          │ safekeeper-1 │          │ safekeeper-2 │
    │    POD       │          │    POD       │          │    POD       │
    └──────┬───────┘          └──────┬───────┘          └──────┬───────┘
           │                         │                         │
           │ mounts                  │ mounts                  │ mounts
           │                         │                         │
           ▼                         ▼                         ▼
    ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
    │  VOLUME-0    │          │  VOLUME-1    │          │  VOLUME-2    │
    │  (100GB)     │          │  (100GB)     │          │  (100GB)     │
    │              │          │              │          │              │
    │  WAL Data    │          │  WAL Data    │          │  WAL Data    │
    │  for SK-0    │          │  for SK-1    │          │  for SK-2    │
    └──────────────┘          └──────────────┘          └──────────────┘

    ✅ ISOLATED STORAGE: Each replica has its own persistent disk
    ✅ NO DATA CORRUPTION: Replicas cannot overwrite each other's data
    ✅ CONSENSUS WORKS: Each node maintains independent state


┌─────────────────────────────────────────────────────────────────────────────┐
│         RAILWAY: Single Volume per Service (Problem!)                        │
└─────────────────────────────────────────────────────────────────────────────┘

    IF we try to scale replicas:

    Service: safekeeper (replicas: 3)
           │
           ├─► Replica-1 ─┐
           │              │
           ├─► Replica-2 ─┼── ALL mount to ────► ┌──────────────┐
           │              │                       │  VOLUME-X    │
           └─► Replica-3 ─┘                       │  (100GB)     │
                                                  │              │
                                                  │  ⚠️ SHARED   │
                                                  │  STORAGE!    │
                                                  └──────────────┘

    ❌ PROBLEM: All replicas share the same volume!
    ❌ DATA CORRUPTION: Replicas overwrite each other's WAL data
    ❌ CONSENSUS BREAKS: Paxos assumes independent storage
    ❌ DISASTER: System is fundamentally broken

    This is why Railway CANNOT run StatefulSets without workarounds!
```

---

## Networking Comparison

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  KUBERNETES SERVICE DISCOVERY                                │
└─────────────────────────────────────────────────────────────────────────────┘

    Headless Service (StatefulSet):
        Name: safekeeper
        ClusterIP: None (headless)

    DNS Resolution:
        safekeeper-0.safekeeper.default.svc.cluster.local → 10.0.1.5
        safekeeper-1.safekeeper.default.svc.cluster.local → 10.0.1.6
        safekeeper-2.safekeeper.default.svc.cluster.local → 10.0.1.7

        safekeeper.default.svc.cluster.local → [10.0.1.5, 10.0.1.6, 10.0.1.7]
                                                (ALL pod IPs)

    ✅ Per-pod DNS names (stable identity)
    ✅ Service DNS returns all pod IPs
    ✅ Pods can address each other directly


┌─────────────────────────────────────────────────────────────────────────────┐
│                  RAILWAY SERVICE DISCOVERY                                   │
└─────────────────────────────────────────────────────────────────────────────┘

    Service with Replicas:
        Name: safekeeper
        Replicas: 3

    DNS Resolution:
        safekeeper.railway.internal → Load balances to ANY replica
                                      (Round-robin: replica-1, replica-2, replica-3)

    ❌ NO per-replica DNS names
    ❌ Cannot address specific replicas
    ❌ Load balancing is automatic (cannot be disabled)

    WORKAROUND: Use separate services
        safekeeper-0.railway.internal → replica-0
        safekeeper-1.railway.internal → replica-1
        safekeeper-2.railway.internal → replica-2

    ✅ Now each replica has stable DNS
    ❌ But loses unified service management
```

---

## Decision Matrix: When to Use Each Platform

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USE KUBERNETES IF:                                   │
└─────────────────────────────────────────────────────────────────────────────┘

    ✅ You need StatefulSets
       └─► Distributed databases (Cassandra, MongoDB, CockroachDB)
       └─► Consensus systems (etcd, Consul, ZooKeeper)
       └─► Sharded workloads (Elasticsearch, Redis Cluster)
       └─► Quorum-based replication (Neon Safekeepers)

    ✅ You need per-replica volumes
       └─► Each replica stores different data
       └─► Cannot share storage between replicas
       └─► Need stable identity for data ownership

    ✅ You need advanced orchestration
       └─► Custom operators (CRDs)
       └─► Complex scheduling constraints
       └─► Cross-namespace networking
       └─► Fine-grained resource management

    ✅ You have K8s expertise
       └─► Team knows YAML, kubectl, Helm
       └─► Can debug networking issues
       └─► Comfortable managing clusters


┌─────────────────────────────────────────────────────────────────────────────┐
│                         USE RAILWAY IF:                                      │
└─────────────────────────────────────────────────────────────────────────────┘

    ✅ You have stateless services
       └─► Web APIs, microservices
       └─► Frontend applications
       └─► Compute-only workloads (Neon compute nodes)
       └─► Background job workers

    ✅ You have single-instance stateful services
       └─► Primary database (no replicas)
       └─► Redis instance (no cluster mode)
       └─► File storage service

    ✅ You want simple deployment
       └─► No YAML configuration
       └─► Automatic SSL certificates
       └─► Built-in CI/CD
       └─► Zero cluster management

    ✅ You're a small team
       └─► No dedicated DevOps
       └─► Want to focus on product
       └─► Don't want to manage infrastructure


┌─────────────────────────────────────────────────────────────────────────────┐
│                    HYBRID APPROACH (Recommended for Neon)                    │
└─────────────────────────────────────────────────────────────────────────────┘

    Railway:
        ├─► Compute Nodes (stateless Postgres VMs)
        │      └─► Autoscale, load balance, simple deployment
        │
        └─► Storage Broker (stateless pub/sub)
               └─► Service discovery, no complex setup

    Managed K8s (GKE, EKS, AKS):
        ├─► Safekeepers (StatefulSet with Paxos)
        │      └─► Per-pod volumes, stable identity
        │
        └─► Pageservers (StatefulSet with sharding)
               └─► Per-pod volumes, dynamic scaling

    External Services:
        ├─► S3 (cold storage)
        └─► Monitoring/Logging (Datadog, etc.)

    ✅ BENEFITS:
       - Railway handles easy stuff (stateless)
       - K8s handles hard stuff (stateful)
       - Each platform used for its strengths
```

---

## Cost Comparison (Monthly, Estimated)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FULL KUBERNETES DEPLOYMENT                                │
└─────────────────────────────────────────────────────────────────────────────┘

    Managed K8s Control Plane:         $70-150/month
    Worker Nodes (3x c5.2xlarge):      $300-400/month
    Load Balancers:                    $18-50/month
    Persistent Volumes (1TB total):    $100-200/month
    Monitoring/Logging:                $50-150/month
    ───────────────────────────────────────────────
    TOTAL:                             $538-950/month

    ⚠️ Plus operational overhead (engineer time)


┌─────────────────────────────────────────────────────────────────────────────┐
│                    FULL RAILWAY DEPLOYMENT (with workarounds)                │
└─────────────────────────────────────────────────────────────────────────────┘

    Compute Nodes (10 instances):      $200-400/month (usage-based)
    Safekeepers (3 services):          $60-120/month
    Pageservers (5 services):          $100-200/month
    Storage Broker (1 service):        $20-40/month
    Volumes (1TB total):               $150/month
    ───────────────────────────────────────────────
    TOTAL:                             $530-910/month

    ✅ No operational overhead
    ✅ Pay only for what you use (compute)
    ❌ Manual orchestration for stateful components


┌─────────────────────────────────────────────────────────────────────────────┐
│                    HYBRID DEPLOYMENT (Recommended)                           │
└─────────────────────────────────────────────────────────────────────────────┘

    Railway (Compute + Broker):        $220-440/month
    Managed K8s (Stateful only):       $300-500/month
    ───────────────────────────────────────────────
    TOTAL:                             $520-940/month

    ✅ Best of both worlds
    ✅ Railway handles easy stuff
    ✅ K8s handles stateful workloads
    ⚠️ Increased complexity (two platforms)
```

---

## Conclusion Diagram

```
                        NEON ON KUBERNETES vs RAILWAY

    ┌─────────────────────────────────────────────────────────────────┐
    │                                                                  │
    │   ✅ KUBERNETES IS BEST FOR:                                    │
    │                                                                  │
    │   • Stateful workloads with per-replica volumes                 │
    │   • Distributed consensus systems (Paxos, Raft)                 │
    │   • Complex orchestration requirements                          │
    │   • Teams with K8s expertise                                    │
    │                                                                  │
    │   ⚠️ BUT:                                                        │
    │   • High operational overhead                                   │
    │   • Steep learning curve                                        │
    │   • More complex deployments                                    │
    │                                                                  │
    └─────────────────────────────────────────────────────────────────┘

                                    VS

    ┌─────────────────────────────────────────────────────────────────┐
    │                                                                  │
    │   ✅ RAILWAY IS BEST FOR:                                       │
    │                                                                  │
    │   • Stateless services and compute workloads                    │
    │   • Simple deployment and operations                            │
    │   • Teams without DevOps expertise                              │
    │   • Rapid prototyping and iteration                             │
    │                                                                  │
    │   ⚠️ BUT:                                                        │
    │   • No StatefulSet equivalent                                   │
    │   • No per-replica volumes                                      │
    │   • Manual orchestration for stateful workloads                 │
    │                                                                  │
    └─────────────────────────────────────────────────────────────────┘

    ═══════════════════════════════════════════════════════════════════

    VERDICT FOR NEON:

        Railway can handle 70% of the architecture beautifully
        (compute nodes, storage broker, networking)

        But the 30% it can't handle (safekeepers, pageservers)
        is CRITICAL to Neon's design

        Recommendation: Hybrid approach or full K8s

    ═══════════════════════════════════════════════════════════════════
```
