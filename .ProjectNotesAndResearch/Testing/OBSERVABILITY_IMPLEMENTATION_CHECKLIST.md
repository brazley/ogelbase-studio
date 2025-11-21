# Production Observability Implementation Checklist
**8-Week Implementation Tracker** | **Target: Grade C → A**

---

## Week 1-2: Foundation ✅ (20 hours)

### Infrastructure Setup
- [ ] Create Grafana Cloud account (free tier)
- [ ] Generate Grafana API key
- [ ] Deploy OpenTelemetry Collector on Railway
- [ ] Configure Collector to export to Grafana Cloud (Tempo, Mimir, Loki)
- [ ] Verify Collector is receiving data

### OpenTelemetry Instrumentation
- [ ] Install OpenTelemetry SDK packages
- [ ] Create `lib/observability/instrumentation.ts`
- [ ] Import instrumentation in app entry point (BEFORE other imports)
- [ ] Deploy instrumented application
- [ ] Verify traces appearing in Grafana Tempo

### Database Exporters
- [ ] Deploy postgres_exporter on Railway
- [ ] Deploy redis_exporter on Railway
- [ ] Deploy mongodb_exporter on Railway
- [ ] Verify exporters are exposing metrics
- [ ] Configure OTel Collector to scrape exporters

### Data Source Configuration
- [ ] Add Tempo datasource in Grafana Cloud
- [ ] Add Mimir (Prometheus) datasource in Grafana Cloud
- [ ] Add Loki datasource in Grafana Cloud
- [ ] Configure trace-to-logs correlation
- [ ] Test all data sources

### Verification
- [ ] Traces flowing: Run test request, find trace in Tempo
- [ ] Metrics flowing: Query `up` metric in Grafana
- [ ] Logs flowing: Search for logs in Loki
- [ ] Database metrics available: Query `pg_up`, `redis_up`, `mongodb_up`

---

## Week 3-4: Advanced Instrumentation ✅ (16 hours)

### Custom Spans
- [ ] Create `lib/observability/tracing.ts`
- [ ] Implement `traceDatabaseProvisioning()` function
- [ ] Implement `traceDatabaseQuery()` function
- [ ] Implement `traceBackupOperation()` function
- [ ] Add custom spans to business logic
- [ ] Verify custom spans in Grafana Tempo

### Tenant Context Propagation
- [ ] Create `lib/observability/tenant-context-middleware.ts`
- [ ] Implement tenant context extraction from headers
- [ ] Add tenant attributes to spans
- [ ] Propagate tenant context via OpenTelemetry Baggage
- [ ] Verify tenant context in traces

### Prometheus Metrics
- [ ] Create `lib/observability/metrics.ts`
- [ ] Define HTTP request metrics (duration, count)
- [ ] Define database query metrics
- [ ] Define connection pool metrics
- [ ] Define business operation metrics
- [ ] Create `/api/metrics` endpoint
- [ ] Verify metrics endpoint returns Prometheus format

### Metrics Middleware
- [ ] Create `lib/observability/metrics-middleware.ts`
- [ ] Implement HTTP request duration recording
- [ ] Implement request count recording
- [ ] Add middleware to app
- [ ] Verify metrics are being recorded

### Database Metrics Instrumentation
- [ ] Create `lib/observability/database-metrics.ts`
- [ ] Implement `recordDatabaseQuery()` function
- [ ] Implement `updateConnectionPoolMetrics()` function
- [ ] Add metrics to existing database code
- [ ] Set up 30-second interval for pool metrics
- [ ] Verify database metrics in Grafana

### Structured Logging
- [ ] Install Winston and ECS formatter
- [ ] Create `lib/observability/logger.ts`
- [ ] Implement trace correlation in logs (traceId, spanId)
- [ ] Implement tenant context in logs
- [ ] Create `lib/observability/pii-redaction.ts`
- [ ] Replace console.log with structured logger
- [ ] Verify logs have trace correlation fields

### Sampling Configuration
- [ ] Configure tail-based sampling in OTel Collector
- [ ] Set up error sampling policy (100% errors)
- [ ] Set up latency sampling policy (100% slow requests)
- [ ] Set up critical operation sampling policy
- [ ] Set up probabilistic sampling (10% normal traffic)
- [ ] Verify sampling is working (check Tempo query counts)

---

## Week 5-6: SLOs & Alerting ✅ (16 hours)

### SLO Definition
- [ ] Define API Availability SLI (target: 99.9%)
- [ ] Define API Latency SLI (p95 < 200ms)
- [ ] Define Provisioning Success Rate SLI (99.5%)
- [ ] Define Database Query Latency SLI (varies by type)
- [ ] Define Backup Success Rate SLI (99.9%)
- [ ] Define Data Durability SLI (99.99%)
- [ ] Document SLOs in wiki

### Recording Rules
- [ ] Create `infrastructure/prometheus/recording-rules.yaml`
- [ ] Add SLI calculation recording rules
- [ ] Add error budget calculation rules
- [ ] Add connection pool utilization rules
- [ ] Deploy recording rules to Grafana Cloud
- [ ] Verify recording rules are executing

### Dashboards
- [ ] Create System Overview dashboard
- [ ] Create Database Performance dashboard
- [ ] Create SLO Tracking dashboard
- [ ] Create Error Budget dashboard
- [ ] Create Connection Pool dashboard
- [ ] Save dashboards as JSON in `/infrastructure/grafana/dashboards/`
- [ ] Import dashboards to Grafana Cloud

### Alert Rules
- [ ] Create `infrastructure/prometheus/alert-rules.yaml`
- [ ] Define multi-burn-rate alerts (fast, moderate, slow)
- [ ] Define API health alerts (error rate, latency)
- [ ] Define database health alerts (down, slow, pool saturation)
- [ ] Define business operation alerts (provisioning, backup)
- [ ] Define infrastructure alerts (CPU, memory, disk)
- [ ] Deploy alert rules to Grafana Cloud

### PagerDuty Integration
- [ ] Create PagerDuty service integration
- [ ] Get PagerDuty routing keys (critical, high)
- [ ] Configure Grafana contact points for PagerDuty
- [ ] Configure Slack webhook for alerts
- [ ] Create notification policy (route by severity)
- [ ] Set up inhibition rules (suppress lower-severity alerts)
- [ ] Test PagerDuty integration with test alert

### Runbooks
- [ ] Create `docs/runbooks/` directory
- [ ] Write "API High Error Rate" runbook
- [ ] Write "Connection Pool Saturation" runbook
- [ ] Write "Database Down" runbook
- [ ] Write "Slow Queries" runbook
- [ ] Write "Replication Lag" runbook
- [ ] Link runbooks in alert annotations
- [ ] Review runbooks with on-call team

---

## Week 7-8: Optimization & Hardening ✅ (16 hours)

### Infrastructure as Code
- [ ] Create `infrastructure/terraform/grafana-cloud.tf`
- [ ] Define Terraform provider for Grafana
- [ ] Define data sources as Terraform resources
- [ ] Define dashboards as Terraform resources
- [ ] Define alert rules as Terraform resources
- [ ] Create `terraform.tfvars.example`
- [ ] Test Terraform apply in staging
- [ ] Deploy Terraform to production

### Cost Optimization
- [ ] Implement recording rules for metric pre-aggregation
- [ ] Reduce label cardinality (remove tenant_id where appropriate)
- [ ] Increase scrape interval for non-critical metrics (60s → 120s)
- [ ] Configure metric relabeling to drop unused metrics
- [ ] Set up tiered retention (7d hot, 30d cold, 90d archive)
- [ ] Verify cost reduction (target: <$2,500/month)

### Load Testing
- [ ] Create `tests/load/observability-load-test.js` (k6)
- [ ] Run baseline load test WITHOUT observability
- [ ] Run load test WITH observability enabled
- [ ] Measure overhead (target: <5% CPU/memory)
- [ ] Verify traces/metrics/logs during load test
- [ ] Document load test results

### Chaos Engineering
- [ ] Create `tests/chaos/database-failure.sh`
- [ ] Run chaos test: Stop PostgreSQL, verify alert fires
- [ ] Run chaos test: Stop Redis, verify alert fires
- [ ] Run chaos test: Inject 50% error rate, verify burn-rate alerts
- [ ] Run chaos test: Simulate connection pool saturation
- [ ] Measure MTTD (target: <5 minutes)
- [ ] Measure MTTR (target: <15 minutes)
- [ ] Document chaos test results

### Team Training
- [ ] Schedule observability training session (2 hours)
- [ ] Create training materials (slides, demos)
- [ ] Train team on:
  - How to search traces in Tempo
  - How to write PromQL queries
  - How to search logs in Loki
  - How to interpret SLO dashboards
  - How to respond to alerts (runbooks)
- [ ] Record training session for future reference

### Documentation
- [ ] Update README with observability section
- [ ] Create wiki pages for:
  - OpenTelemetry architecture
  - Dashboard usage guide
  - Alert response procedures
  - Cost optimization strategies
- [ ] Document troubleshooting common issues
- [ ] Create onboarding guide for new team members

### Production Readiness Review
- [ ] Verify all 6 SLIs are being tracked
- [ ] Verify error budget dashboard is accurate
- [ ] Verify all critical alerts have runbooks
- [ ] Verify PagerDuty routing is correct
- [ ] Verify cost is within budget (<$2,500/month)
- [ ] Run final end-to-end test
- [ ] Get sign-off from engineering leadership

---

## Success Metrics (Final Verification)

### Performance Metrics ✅
- [ ] Mean Time to Detection (MTTD): <5 minutes
- [ ] Mean Time to Resolution (MTTR): <15 minutes (for common issues)
- [ ] Observability overhead: <5% CPU/memory
- [ ] Trace latency: <500ms from event to queryable

### Coverage Metrics ✅
- [ ] 100% of API endpoints have traces
- [ ] 100% of database queries have traces
- [ ] 100% of errors are captured in traces
- [ ] All 3 database types have metrics (PostgreSQL, Redis, MongoDB)
- [ ] All business operations have custom spans

### Cost Metrics ✅
- [ ] Total observability cost: <$2,500/month
- [ ] Cost per trace: <$0.0001
- [ ] Cost per metric: <$0.15/series/month
- [ ] Cost per GB logs: <$0.50/GB

### SLO Compliance ✅
- [ ] API Availability: >99.9% (measured over 30 days)
- [ ] API Latency: p95 <200ms
- [ ] Provisioning Success Rate: >99.5%
- [ ] Backup Success Rate: >99.9%
- [ ] Error budget remaining: >50%

### Team Readiness ✅
- [ ] 100% of on-call engineers trained on observability stack
- [ ] All critical alerts have documented runbooks
- [ ] Incident response time reduced by 50%
- [ ] Zero "mystery outages" (all incidents have traces)

---

## Rollback Plan

If observability causes production issues:

### Immediate Rollback (< 5 minutes)
```bash
# Disable OpenTelemetry SDK
railway variables set OTEL_SDK_DISABLED=true --service studio
railway restart --service studio
```

### Partial Rollback
```bash
# Disable only tracing (keep metrics/logs)
railway variables set OTEL_TRACES_EXPORTER=none --service studio

# Disable only metrics
railway variables set OTEL_METRICS_EXPORTER=none --service studio

# Reduce sampling (if overhead is high)
railway variables set OTEL_TRACES_SAMPLER_ARG=0.01 --service studio  # 1% instead of 10%
```

### Recovery Verification
- [ ] Application is healthy (no errors)
- [ ] API latency is normal
- [ ] Database connection pools are stable
- [ ] No alerts firing

---

## Post-Implementation

### Week 9: Monitoring & Iteration
- [ ] Monitor observability costs daily (first week)
- [ ] Review alert noise (reduce false positives)
- [ ] Gather feedback from on-call team
- [ ] Identify gaps in coverage
- [ ] Create backlog for improvements

### Ongoing (Monthly)
- [ ] Review SLO compliance
- [ ] Review error budget consumption
- [ ] Optimize alert thresholds based on false positives
- [ ] Update dashboards based on team feedback
- [ ] Review and update runbooks

### Quarterly Reviews
- [ ] Comprehensive cost analysis
- [ ] SLO target review (are targets still appropriate?)
- [ ] Technology evaluation (new observability tools)
- [ ] Team survey on observability effectiveness
- [ ] Documentation updates

---

## Key Contacts

- **Observability Lead**: Nikolai Volkov (devops@ogelbase.com)
- **On-Call Engineers**: #oncall-engineers (Slack)
- **Engineering Manager**: #engineering-leadership (Slack)
- **Grafana Support**: support@grafana.com
- **PagerDuty Support**: support@pagerduty.com

---

## Resources

- **Full Implementation Guide**: [`PRODUCTION_OBSERVABILITY_STACK_V2.md`](./PRODUCTION_OBSERVABILITY_STACK_V2.md)
- **Quick Start Guide**: [`OBSERVABILITY_QUICK_START.md`](./OBSERVABILITY_QUICK_START.md)
- **Research**: [`OBSERVABILITY_RESEARCH_2025.md`](./OBSERVABILITY_RESEARCH_2025.md)
- **OpenTelemetry Docs**: https://opentelemetry.io/docs/
- **Grafana Cloud Docs**: https://grafana.com/docs/grafana-cloud/

---

**Last Updated**: November 20, 2025
**Version**: 1.0
**Status**: Ready for Implementation
