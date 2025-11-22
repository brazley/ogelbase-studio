# WS4: Advanced Alerting

**Owner**: Yuki Nakamura | **Agent**: `YukiNakamura` | **Days**: 2 | **Status**: 🟡 READY

## Objective
Integrate Redis alerts with PagerDuty/Slack for production incident response.

## Scope
1. Create `lib/api/observability/alerting.ts` - Alert manager
2. Configure alert routing (critical→PagerDuty, warning→Slack)
3. Add runbook links to alerts
4. Implement alert deduplication

## Alert Rules
**Critical** (PagerDuty):
- Redis disconnected
- Cache hit rate <70%
- p99 latency >50ms
- Memory usage >95%

**Warning** (Slack):
- Cache hit rate 70-90%
- p99 latency 10-50ms
- Memory usage 80-95%

## Deliverables
- `lib/api/observability/alerting.ts`
- `infrastructure/alerting/rules.yml`
- `infrastructure/alerting/integrations.json`
- `REDIS-ALERTING-RUNBOOK.md`

## Acceptance Criteria
- [ ] Critical alerts → PagerDuty
- [ ] Warnings → Slack
- [ ] Runbooks linked
- [ ] <30s alert latency
- [ ] Deduplication working

**Dependencies**: WS3 (Grafana for alerts) | **Ready**: ✅
