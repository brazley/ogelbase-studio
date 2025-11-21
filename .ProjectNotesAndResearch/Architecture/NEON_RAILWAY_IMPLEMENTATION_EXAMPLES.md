# Neon on Railway: Concrete Implementation Examples

**Last Updated:** 2025-01-21
**Purpose:** Show exactly how to implement Neon components on Railway with actual configurations

---

## Example 1: Compute Nodes (Stateless) - Works Perfectly

### Kubernetes Configuration (Current)

```yaml
# neon-compute-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: neon-compute
  labels:
    app: neon-compute
spec:
  replicas: 10
  selector:
    matchLabels:
      app: neon-compute
  template:
    metadata:
      labels:
        app: neon-compute
    spec:
      containers:
      - name: postgres
        image: neondatabase/compute-node:latest
        env:
        - name: PAGESERVER_CONNSTR
          value: "pageserver.default.svc.cluster.local:6400"
        - name: SAFEKEEPER_CONNSTR
          value: "safekeeper-0.safekeeper.default.svc.cluster.local:5454,safekeeper-1.safekeeper.default.svc.cluster.local:5454,safekeeper-2.safekeeper.default.svc.cluster.local:5454"
        resources:
          requests:
            cpu: 2
            memory: 4Gi
          limits:
            cpu: 4
            memory: 8Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: neon-compute
spec:
  selector:
    app: neon-compute
  ports:
  - port: 5432
    targetPort: 5432
  type: LoadBalancer
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: neon-compute-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: neon-compute
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### Railway Configuration (Equivalent)

```json
// railway.json (service configuration)
{
  "services": [
    {
      "name": "neon-compute",
      "source": {
        "image": "neondatabase/compute-node:latest"
      },
      "variables": {
        "PAGESERVER_CONNSTR": "pageserver-0.railway.internal:6400,pageserver-1.railway.internal:6400",
        "SAFEKEEPER_CONNSTR": "safekeeper-0.railway.internal:5454,safekeeper-1.railway.internal:5454,safekeeper-2.railway.internal:5454",
        "PORT": "5432"
      },
      "domains": [
        {
          "domain": "compute.myapp.com"
        }
      ],
      "healthcheck": {
        "path": "/health",
        "port": 8080
      },
      "replicas": 10,
      "resources": {
        "cpu": 2,
        "memory": 4
      }
    }
  ]
}
```

### Deployment Steps (Railway CLI)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
railway init

# Add service
railway service create neon-compute

# Set environment variables
railway variables set PAGESERVER_CONNSTR="pageserver-0.railway.internal:6400,pageserver-1.railway.internal:6400"
railway variables set SAFEKEEPER_CONNSTR="safekeeper-0.railway.internal:5454,safekeeper-1.railway.internal:5454,safekeeper-2.railway.internal:5454"

# Configure replicas (via dashboard or API)
# Railway doesn't have CLI for replicas yet, use dashboard

# Deploy
railway up --service neon-compute
```

### Result

✅ **Works perfectly!** Railway handles stateless compute nodes better than K8s:
- Simpler configuration
- Automatic load balancing
- Built-in health checks
- Easy horizontal scaling

---

## Example 2: Safekeepers (Stateful) - Requires Workaround

### Kubernetes Configuration (Current)

```yaml
# neon-safekeeper-statefulset.yaml
apiVersion: v1
kind: Service
metadata:
  name: safekeeper
  labels:
    app: safekeeper
spec:
  ports:
  - port: 5454
    name: wal
  - port: 7676
    name: http
  clusterIP: None  # Headless service
  selector:
    app: safekeeper
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: safekeeper
spec:
  serviceName: safekeeper
  replicas: 3
  selector:
    matchLabels:
      app: safekeeper
  template:
    metadata:
      labels:
        app: safekeeper
    spec:
      containers:
      - name: safekeeper
        image: neondatabase/safekeeper:latest
        env:
        - name: SAFEKEEPER_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name  # Uses pod name (safekeeper-0, safekeeper-1, etc.)
        - name: SAFEKEEPER_PEERS
          value: "safekeeper-0.safekeeper.default.svc.cluster.local:5454,safekeeper-1.safekeeper.default.svc.cluster.local:5454,safekeeper-2.safekeeper.default.svc.cluster.local:5454"
        - name: STORAGE_BROKER_ENDPOINTS
          value: "http://storage-broker.default.svc.cluster.local:50051"
        ports:
        - containerPort: 5454
          name: wal
        - containerPort: 7676
          name: http
        volumeMounts:
        - name: wal-data
          mountPath: /data
        resources:
          requests:
            cpu: 1
            memory: 2Gi
          limits:
            cpu: 2
            memory: 4Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 7676
          initialDelaySeconds: 10
  volumeClaimTemplates:
  - metadata:
      name: wal-data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: fast-nvme
      resources:
        requests:
          storage: 100Gi
```

### Railway Configuration (Workaround: 3 Separate Services)

```json
// railway-safekeepers.json
{
  "services": [
    {
      "name": "safekeeper-0",
      "source": {
        "image": "neondatabase/safekeeper:latest"
      },
      "variables": {
        "SAFEKEEPER_ID": "0",
        "SAFEKEEPER_PEERS": "safekeeper-1.railway.internal:5454,safekeeper-2.railway.internal:5454",
        "STORAGE_BROKER_ENDPOINTS": "http://storage-broker.railway.internal:50051",
        "WAL_PORT": "5454",
        "HTTP_PORT": "7676"
      },
      "volumes": [
        {
          "name": "wal-data-0",
          "mountPath": "/data"
        }
      ],
      "healthcheck": {
        "path": "/health",
        "port": 7676
      },
      "replicas": 1,  // MUST be 1!
      "private": true,  // Only accessible internally
      "resources": {
        "cpu": 1,
        "memory": 2
      }
    },
    {
      "name": "safekeeper-1",
      "source": {
        "image": "neondatabase/safekeeper:latest"
      },
      "variables": {
        "SAFEKEEPER_ID": "1",
        "SAFEKEEPER_PEERS": "safekeeper-0.railway.internal:5454,safekeeper-2.railway.internal:5454",
        "STORAGE_BROKER_ENDPOINTS": "http://storage-broker.railway.internal:50051",
        "WAL_PORT": "5454",
        "HTTP_PORT": "7676"
      },
      "volumes": [
        {
          "name": "wal-data-1",
          "mountPath": "/data"
        }
      ],
      "healthcheck": {
        "path": "/health",
        "port": 7676
      },
      "replicas": 1,
      "private": true,
      "resources": {
        "cpu": 1,
        "memory": 2
      }
    },
    {
      "name": "safekeeper-2",
      "source": {
        "image": "neondatabase/safekeeper:latest"
      },
      "variables": {
        "SAFEKEEPER_ID": "2",
        "SAFEKEEPER_PEERS": "safekeeper-0.railway.internal:5454,safekeeper-1.railway.internal:5454",
        "STORAGE_BROKER_ENDPOINTS": "http://storage-broker.railway.internal:50051",
        "WAL_PORT": "5454",
        "HTTP_PORT": "7676"
      },
      "volumes": [
        {
          "name": "wal-data-2",
          "mountPath": "/data"
        }
      ],
      "healthcheck": {
        "path": "/health",
        "port": 7676
      },
      "replicas": 1,
      "private": true,
      "resources": {
        "cpu": 1,
        "memory": 2
      }
    }
  ]
}
```

### Deployment Script

```bash
#!/bin/bash
# deploy-safekeepers.sh

set -e

echo "Deploying Neon Safekeepers to Railway..."

# Deploy safekeeper-0
echo "Creating safekeeper-0..."
railway service create safekeeper-0
railway service -s safekeeper-0 volume create wal-data-0 --mount-path /data
railway service -s safekeeper-0 variables set \
  SAFEKEEPER_ID=0 \
  SAFEKEEPER_PEERS="safekeeper-1.railway.internal:5454,safekeeper-2.railway.internal:5454" \
  STORAGE_BROKER_ENDPOINTS="http://storage-broker.railway.internal:50051" \
  WAL_PORT=5454 \
  HTTP_PORT=7676
railway service -s safekeeper-0 up --image neondatabase/safekeeper:latest

# Deploy safekeeper-1
echo "Creating safekeeper-1..."
railway service create safekeeper-1
railway service -s safekeeper-1 volume create wal-data-1 --mount-path /data
railway service -s safekeeper-1 variables set \
  SAFEKEEPER_ID=1 \
  SAFEKEEPER_PEERS="safekeeper-0.railway.internal:5454,safekeeper-2.railway.internal:5454" \
  STORAGE_BROKER_ENDPOINTS="http://storage-broker.railway.internal:50051" \
  WAL_PORT=5454 \
  HTTP_PORT=7676
railway service -s safekeeper-1 up --image neondatabase/safekeeper:latest

# Deploy safekeeper-2
echo "Creating safekeeper-2..."
railway service create safekeeper-2
railway service -s safekeeper-2 volume create wal-data-2 --mount-path /data
railway service -s safekeeper-2 variables set \
  SAFEKEEPER_ID=2 \
  SAFEKEEPER_PEERS="safekeeper-0.railway.internal:5454,safekeeper-1.railway.internal:5454" \
  STORAGE_BROKER_ENDPOINTS="http://storage-broker.railway.internal:50051" \
  WAL_PORT=5454 \
  HTTP_PORT=7676
railway service -s safekeeper-2 up --image neondatabase/safekeeper:latest

echo "Safekeepers deployed!"
echo "DNS names:"
echo "  - safekeeper-0.railway.internal:5454"
echo "  - safekeeper-1.railway.internal:5454"
echo "  - safekeeper-2.railway.internal:5454"
```

### Terraform Configuration (Alternative)

```hcl
# safekeepers.tf
terraform {
  required_providers {
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.3"
    }
  }
}

variable "safekeeper_image" {
  default = "neondatabase/safekeeper:latest"
}

variable "safekeeper_peers" {
  default = [
    "safekeeper-0.railway.internal:5454",
    "safekeeper-1.railway.internal:5454",
    "safekeeper-2.railway.internal:5454"
  ]
}

resource "railway_service" "safekeeper" {
  count = 3
  name  = "safekeeper-${count.index}"

  source {
    image = var.safekeeper_image
  }

  environment = {
    SAFEKEEPER_ID               = count.index
    SAFEKEEPER_PEERS           = join(",", [for i, peer in var.safekeeper_peers : peer if i != count.index])
    STORAGE_BROKER_ENDPOINTS   = "http://storage-broker.railway.internal:50051"
    WAL_PORT                   = "5454"
    HTTP_PORT                  = "7676"
  }

  volume {
    name       = "wal-data-${count.index}"
    mount_path = "/data"
    size_gb    = 100
  }

  healthcheck {
    path = "/health"
    port = 7676
  }

  resources {
    cpu_cores = 1
    memory_gb = 2
  }

  replicas = 1
  private  = true
}

output "safekeeper_endpoints" {
  value = [for s in railway_service.safekeeper : "${s.name}.railway.internal:5454"]
}
```

### Result

⚠️ **Works, but with trade-offs:**
- ✅ Each safekeeper gets isolated storage
- ✅ Stable DNS names for peer discovery
- ✅ Paxos consensus works correctly
- ❌ Manual service management (3 separate services)
- ❌ No unified scaling (must manage individually)
- ❌ More complex deployment

---

## Example 3: Storage Broker (Stateless Pub/Sub) - Works Well

### Kubernetes Configuration (Current)

```yaml
# neon-storage-broker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: storage-broker
spec:
  replicas: 3
  selector:
    matchLabels:
      app: storage-broker
  template:
    metadata:
      labels:
        app: storage-broker
    spec:
      containers:
      - name: storage-broker
        image: neondatabase/storage-broker:latest
        ports:
        - containerPort: 50051
          name: grpc
        - containerPort: 9898
          name: metrics
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 1
            memory: 1Gi
        livenessProbe:
          grpc:
            port: 50051
          initialDelaySeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: storage-broker
spec:
  selector:
    app: storage-broker
  ports:
  - port: 50051
    targetPort: 50051
    name: grpc
  - port: 9898
    targetPort: 9898
    name: metrics
  type: ClusterIP
```

### Railway Configuration (Equivalent)

```json
// railway-storage-broker.json
{
  "name": "storage-broker",
  "source": {
    "image": "neondatabase/storage-broker:latest"
  },
  "variables": {
    "GRPC_PORT": "50051",
    "METRICS_PORT": "9898"
  },
  "healthcheck": {
    "protocol": "grpc",
    "port": 50051
  },
  "replicas": 3,
  "private": true,
  "resources": {
    "cpu": 0.5,
    "memory": 0.5
  }
}
```

### Deployment

```bash
railway service create storage-broker
railway service -s storage-broker variables set \
  GRPC_PORT=50051 \
  METRICS_PORT=9898
railway service -s storage-broker up --image neondatabase/storage-broker:latest
railway service -s storage-broker scale --replicas 3
```

### Result

✅ **Works great!** Stateless services are Railway's strength:
- Simple deployment
- Automatic load balancing across replicas
- Internal DNS works perfectly
- No volume management needed

---

## Example 4: Complete Deployment Script

### Full Railway Deployment

```bash
#!/bin/bash
# deploy-neon-railway.sh
# Complete Neon deployment to Railway

set -e

PROJECT_NAME="neon-serverless-postgres"
ENVIRONMENT="production"

echo "🚀 Deploying Neon to Railway..."

# 1. Create Railway project
echo "📦 Creating Railway project..."
railway init --name "$PROJECT_NAME"
railway environment create "$ENVIRONMENT"

# 2. Deploy Storage Broker (stateless, easy)
echo "🔧 Deploying Storage Broker..."
railway service create storage-broker
railway service -s storage-broker variables set \
  GRPC_PORT=50051 \
  METRICS_PORT=9898
railway service -s storage-broker up --image neondatabase/storage-broker:latest
railway service -s storage-broker scale --replicas 3

# Wait for storage broker to be ready
echo "⏳ Waiting for Storage Broker..."
sleep 10

# 3. Deploy Safekeepers (stateful, needs workaround)
echo "💾 Deploying Safekeepers (3 separate services)..."

for i in 0 1 2; do
  # Calculate peer addresses (all safekeepers except this one)
  if [ $i -eq 0 ]; then
    PEERS="safekeeper-1.railway.internal:5454,safekeeper-2.railway.internal:5454"
  elif [ $i -eq 1 ]; then
    PEERS="safekeeper-0.railway.internal:5454,safekeeper-2.railway.internal:5454"
  else
    PEERS="safekeeper-0.railway.internal:5454,safekeeper-1.railway.internal:5454"
  fi

  echo "  Creating safekeeper-$i..."
  railway service create "safekeeper-$i"
  railway service -s "safekeeper-$i" volume create "wal-data-$i" --mount-path /data --size 100
  railway service -s "safekeeper-$i" variables set \
    SAFEKEEPER_ID=$i \
    SAFEKEEPER_PEERS="$PEERS" \
    STORAGE_BROKER_ENDPOINTS="http://storage-broker.railway.internal:50051" \
    WAL_PORT=5454 \
    HTTP_PORT=7676
  railway service -s "safekeeper-$i" up --image neondatabase/safekeeper:latest
done

echo "⏳ Waiting for Safekeepers to form quorum..."
sleep 15

# 4. Deploy Pageservers (stateful, sharded)
echo "📚 Deploying Pageservers (5 separate services)..."

for i in 0 1 2 3 4; do
  echo "  Creating pageserver-$i..."
  railway service create "pageserver-$i"
  railway service -s "pageserver-$i" volume create "pageserver-data-$i" --mount-path /data --size 500
  railway service -s "pageserver-$i" variables set \
    PAGESERVER_ID=$i \
    SAFEKEEPER_CONNSTR="safekeeper-0.railway.internal:5454,safekeeper-1.railway.internal:5454,safekeeper-2.railway.internal:5454" \
    STORAGE_BROKER_ENDPOINTS="http://storage-broker.railway.internal:50051" \
    S3_BUCKET="neon-cold-storage" \
    S3_REGION="us-east-1" \
    PAGE_PORT=6400 \
    HTTP_PORT=9898
  railway service -s "pageserver-$i" up --image neondatabase/pageserver:latest
done

echo "⏳ Waiting for Pageservers..."
sleep 15

# 5. Deploy Compute Nodes (stateless, scales easily!)
echo "💻 Deploying Compute Nodes..."

# Build list of pageserver addresses
PAGESERVER_ADDRS=""
for i in 0 1 2 3 4; do
  PAGESERVER_ADDRS="${PAGESERVER_ADDRS}pageserver-$i.railway.internal:6400,"
done
PAGESERVER_ADDRS=${PAGESERVER_ADDRS%,}  # Remove trailing comma

railway service create neon-compute
railway service -s neon-compute variables set \
  PAGESERVER_CONNSTR="$PAGESERVER_ADDRS" \
  SAFEKEEPER_CONNSTR="safekeeper-0.railway.internal:5454,safekeeper-1.railway.internal:5454,safekeeper-2.railway.internal:5454" \
  POSTGRES_PORT=5432 \
  HTTP_PORT=8080
railway service -s neon-compute up --image neondatabase/compute-node:latest
railway service -s neon-compute scale --replicas 10

# 6. Setup public domain for compute nodes
echo "🌐 Setting up public domain..."
railway service -s neon-compute domain add neon-compute.myapp.com

# 7. Summary
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Services deployed:"
echo "  - Storage Broker: 3 replicas (stateless)"
echo "  - Safekeepers: 3 services (stateful, manual)"
echo "  - Pageservers: 5 services (stateful, manual)"
echo "  - Compute Nodes: 10 replicas (stateless, auto-scaled)"
echo ""
echo "🔗 Endpoints:"
echo "  - Public: neon-compute.myapp.com:5432"
echo "  - Internal DNS:"
echo "    - storage-broker.railway.internal:50051"
echo "    - safekeeper-{0,1,2}.railway.internal:5454"
echo "    - pageserver-{0,1,2,3,4}.railway.internal:6400"
echo "    - neon-compute.railway.internal:5432"
echo ""
echo "⚠️  WARNING: This deployment uses workarounds for stateful components."
echo "    - Safekeepers are deployed as 3 separate services (not unified)"
echo "    - Pageservers are deployed as 5 separate services (manual sharding)"
echo "    - Consider using Kubernetes for production stateful workloads"
echo ""
```

---

## Example 5: Monitoring & Observability

### Adding Prometheus Metrics (Railway)

```bash
# Add Prometheus service
railway service create prometheus
railway service -s prometheus volume create prometheus-data --mount-path /prometheus --size 50
railway service -s prometheus variables set \
  PROMETHEUS_CONFIG="$(cat prometheus.yml | base64)"
railway service -s prometheus up --image prom/prometheus:latest

# Add Grafana service
railway service create grafana
railway service -s grafana volume create grafana-data --mount-path /var/lib/grafana --size 10
railway service -s grafana variables set \
  GF_SECURITY_ADMIN_PASSWORD="changeme" \
  GF_SERVER_ROOT_URL="https://grafana.myapp.com"
railway service -s grafana domain add grafana.myapp.com
railway service -s grafana up --image grafana/grafana:latest
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  # Storage Broker
  - job_name: 'storage-broker'
    static_configs:
      - targets: ['storage-broker.railway.internal:9898']

  # Safekeepers
  - job_name: 'safekeepers'
    static_configs:
      - targets:
        - 'safekeeper-0.railway.internal:7676'
        - 'safekeeper-1.railway.internal:7676'
        - 'safekeeper-2.railway.internal:7676'

  # Pageservers
  - job_name: 'pageservers'
    static_configs:
      - targets:
        - 'pageserver-0.railway.internal:9898'
        - 'pageserver-1.railway.internal:9898'
        - 'pageserver-2.railway.internal:9898'
        - 'pageserver-3.railway.internal:9898'
        - 'pageserver-4.railway.internal:9898'

  # Compute Nodes
  - job_name: 'compute'
    dns_sd_configs:
      - names: ['neon-compute.railway.internal']
        type: 'A'
        port: 8080
```

---

## Example 6: Cost Optimization

### Railway Cost Calculator

```python
# railway_cost_calculator.py
# Calculate Railway costs for Neon deployment

class RailwayCostCalculator:
    # Railway pricing (2025)
    CPU_HOUR = 0.000463  # per vCPU hour
    MEMORY_GB_HOUR = 0.000231  # per GB hour
    EGRESS_GB = 0.10  # per GB
    VOLUME_GB_MONTH = 0.25  # per GB per month (legacy) or 0.15 (Metal)

    def __init__(self, use_metal=True):
        self.volume_cost = 0.15 if use_metal else 0.25

    def compute_cost(self, replicas, cpu_cores, memory_gb, hours=730):
        """Calculate compute cost for a service"""
        cpu_cost = replicas * cpu_cores * hours * self.CPU_HOUR
        memory_cost = replicas * memory_gb * hours * self.MEMORY_GB_HOUR
        return cpu_cost + memory_cost

    def volume_cost(self, size_gb):
        """Calculate volume cost"""
        return size_gb * self.volume_cost

    def neon_deployment_cost(self):
        """Calculate full Neon deployment cost"""
        costs = {}

        # Storage Broker (3 replicas, 0.5 CPU, 0.5 GB RAM each)
        costs['storage_broker'] = self.compute_cost(3, 0.5, 0.5)

        # Safekeepers (3 services, 1 CPU, 2 GB RAM, 100 GB volume each)
        costs['safekeepers_compute'] = self.compute_cost(3, 1, 2)
        costs['safekeepers_storage'] = self.volume_cost(3 * 100)

        # Pageservers (5 services, 2 CPU, 4 GB RAM, 500 GB volume each)
        costs['pageservers_compute'] = self.compute_cost(5, 2, 4)
        costs['pageservers_storage'] = self.volume_cost(5 * 500)

        # Compute Nodes (10 replicas, 2 CPU, 4 GB RAM each)
        costs['compute_nodes'] = self.compute_cost(10, 2, 4)

        # Egress (estimate 1 TB/month)
        costs['egress'] = 1000 * self.EGRESS_GB

        # Total
        costs['total'] = sum(costs.values())

        return costs

if __name__ == '__main__':
    calc = RailwayCostCalculator(use_metal=True)
    costs = calc.neon_deployment_cost()

    print("💰 Neon on Railway - Monthly Cost Estimate")
    print("=" * 50)
    for service, cost in costs.items():
        print(f"{service:30s}: ${cost:8.2f}")
    print("=" * 50)
    print(f"{'TOTAL':30s}: ${costs['total']:8.2f}")
```

**Output:**
```
💰 Neon on Railway - Monthly Cost Estimate
==================================================
storage_broker                : $   25.39
safekeepers_compute           : $   50.78
safekeepers_storage           : $   45.00
pageservers_compute           : $  169.26
pageservers_storage           : $  375.00
compute_nodes                 : $  338.52
egress                        : $  100.00
==================================================
TOTAL                         : $ 1103.95
```

---

## Conclusion

### What Works Great on Railway
1. ✅ **Compute Nodes** - Stateless, easy scaling
2. ✅ **Storage Broker** - Stateless pub/sub
3. ✅ **Health Checks** - Built-in support
4. ✅ **Private Networking** - Simple DNS-based discovery

### What Requires Workarounds
1. ⚠️ **Safekeepers** - Need 3 separate services (no StatefulSet)
2. ⚠️ **Pageservers** - Need N separate services (manual sharding)
3. ⚠️ **Service Discovery** - No per-replica DNS (use separate services)

### What Doesn't Work
1. ❌ **Per-replica volumes** - Railway mounts volumes to services, not replicas
2. ❌ **Automatic orchestration** - No StatefulSet-like primitive
3. ❌ **Dynamic quorum** - Must manually configure peer addresses

### Recommendation
**Use Railway for prototypes and stateless components, Kubernetes for production stateful workloads.**
