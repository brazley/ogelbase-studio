# Neon K8s → Railway Quick Reference

**TL;DR:** Railway can handle 70% of Neon's architecture beautifully, but the critical 30% (StatefulSets for consensus) requires workarounds or Kubernetes.

---

## Primitive Mapping Table

| Kubernetes Primitive | Neon Uses It For | Railway Equivalent | Gap Level | Workaround |
|---------------------|------------------|-------------------|-----------|------------|
| **StatefulSet** | Safekeepers (Paxos quorum) | ❌ None | 🔴 CRITICAL | 3 separate services |
| **StatefulSet** | Pageservers (sharded data) | ❌ None | 🔴 CRITICAL | N separate services |
| **Deployment** | Compute nodes (stateless) | ✅ Service + replicas | 🟢 NONE | None needed |
| **Deployment** | Storage broker (pub/sub) | ✅ Service + replicas | 🟡 MINOR | App-level pub/sub |
| **Headless Service** | Per-pod DNS (safekeepers) | ❌ Service-level only | 🟠 MODERATE | Separate services |
| **ClusterIP Service** | Internal endpoints | ✅ Private networking | 🟢 NONE | None needed |
| **PersistentVolumeClaim** | Per-pod volumes | ❌ Per-service only | 🔴 CRITICAL | Separate services |
| **HorizontalPodAutoscaler** | Auto-scale compute | ⚠️ Manual horizontal | 🟡 MINOR | Manual scaling |
| **Liveness Probe** | Health checks | ✅ Health check | 🟢 NONE | None needed |
| **Readiness Probe** | Traffic gating | ✅ Health check | 🟢 NONE | None needed |
| **ConfigMap** | Shared config | ⚠️ Env vars only | 🟡 MINOR | Duplicate vars |
| **Secret** | Credentials | ✅ Encrypted vars | 🟢 NONE | None needed |
| **Ingress** | Public domains | ✅ Public domains | 🟢 NONE | None needed |

---

## Component Support Matrix

| Component | K8s Fit | Railway Fit | Winner |
|-----------|---------|-------------|--------|
| **Compute Nodes** | ✅ Good | ✅ **EXCELLENT** | 🏆 Railway (simpler) |
| **Storage Broker** | ✅ Good | ✅ Good | 🤝 Tie |
| **Safekeepers** | ✅ **PERFECT** | ⚠️ Workaround | 🏆 Kubernetes |
| **Pageservers** | ✅ **PERFECT** | ⚠️ Workaround | 🏆 Kubernetes |
| **Networking** | ✅ Good | ✅ Good | 🤝 Tie |
| **Monitoring** | ✅ Good | ✅ Good | 🤝 Tie |
| **Ops Overhead** | ❌ High | ✅ **LOW** | 🏆 Railway |

---

## The Two Critical Gaps

### 1. No Per-Replica Volumes ⛔

**Problem:**
```
K8s: Each replica gets its own volume
Railway: All replicas share one volume
```

**Impact:** Cannot run distributed stateful systems (Paxos, Raft, sharded databases)

**Workaround:** Create separate Railway services for each replica (lose unified orchestration)

---

### 2. No Stable Per-Replica Identity ⛔

**Problem:**
```
K8s: safekeeper-0, safekeeper-1, safekeeper-2 (stable DNS)
Railway: safekeeper.railway.internal (load-balanced)
```

**Impact:** Consensus protocols need stable peer addresses

**Workaround:** Use separate services with stable DNS names

---

## When to Use Each Platform

### ✅ Use Railway If:
- Stateless services (APIs, web apps, **Neon compute nodes**)
- Single-instance databases
- Small team without K8s expertise
- Rapid prototyping
- Simple deployment needs

### ✅ Use Kubernetes If:
- Distributed consensus (Paxos, Raft)
- StatefulSets required (**Neon safekeepers, pageservers**)
- Per-replica volumes needed
- Complex orchestration
- Multi-tenant isolation
- Team has K8s expertise

---

## Hybrid Approach (Recommended)

```
Railway:
├─ Compute Nodes (10 replicas, auto-scale)
└─ Storage Broker (3 replicas)

Managed K8s (GKE/EKS/AKS):
├─ Safekeepers (StatefulSet, 3 replicas, Paxos)
└─ Pageservers (StatefulSet, 5 replicas, sharded)

External:
├─ S3 (cold storage)
└─ Monitoring (Datadog/New Relic)
```

**Benefits:**
- Railway handles easy stuff (stateless, great DX)
- K8s handles hard stuff (stateful, consensus)
- Each platform used for its strengths

---

## Cost Comparison (Monthly)

| Deployment Type | Cost | Pros | Cons |
|----------------|------|------|------|
| **Full K8s** | $540-950 | StatefulSets, full control | High ops overhead, cluster costs |
| **Full Railway** | $530-910 | Simple ops, pay-per-use | Manual stateful orchestration |
| **Hybrid** | $520-940 | Best of both worlds | Two platforms to manage |

---

## Quick Decision Tree

```
Do you need StatefulSets?
├─ NO → Use Railway (easier, simpler)
│
└─ YES → Do you need more than 5 replicas?
    ├─ NO → Use Railway with separate services
    │       (Manual but manageable)
    │
    └─ YES → Use Kubernetes
             (Only platform that scales stateful workloads)
```

---

## Real Talk

**Can Railway replace Kubernetes for Neon?**

**No.** Railway is fantastic for 90% of applications, but Neon's architecture fundamentally relies on Kubernetes StatefulSets for its distributed consensus layer.

**The gap isn't philosophical - it's technical:**
- Neon's Safekeepers need per-replica volumes for Paxos
- Railway only supports per-service volumes
- Workarounds exist but lose orchestration benefits

**Best path:**
1. Prototype on Railway (fast iteration)
2. Move stateful components to K8s for production
3. Or redesign to not need StatefulSets (massive change)

---

## Key Takeaways

1. 🎯 **Railway excels at stateless workloads** - Compute nodes are easier on Railway than K8s
2. ⚠️ **Railway struggles with StatefulSets** - No per-replica volumes or stable identities
3. 🔧 **Workarounds exist but lose value** - Separate services work but negate orchestration benefits
4. 💰 **Costs are similar** - Railway's simplicity offsets K8s cluster overhead
5. 🏆 **Hybrid is optimal** - Use each platform for its strengths

---

## Further Reading

- **Detailed Mapping:** `NEON_K8S_TO_RAILWAY_MAPPING.md`
- **Visual Diagrams:** `NEON_K8S_RAILWAY_COMPARISON_DIAGRAM.md`
- **Implementation Examples:** `NEON_RAILWAY_IMPLEMENTATION_EXAMPLES.md`

---

**Last Updated:** 2025-01-21
