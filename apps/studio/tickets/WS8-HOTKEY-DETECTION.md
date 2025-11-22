# WS8: Hotkey Detection

**Owner**: Yasmin Al-Rashid | **Agent**: `YasminAlRashid` | **Days**: 2 | **Status**: 🟡 READY

## Objective
Detect frequently accessed Redis keys (hotkeys) to prevent bottlenecks and enable auto-optimization.

## Scope
1. Create `lib/api/cache/hotkey-detection.ts` - Tracking logic
2. Update `lib/api/platform/redis.ts` - Track key access frequency
3. Add hotkey metrics to health endpoint
4. Create hotkey dashboard panel

## Strategy
- Track key access count in sliding window (1 minute)
- Alert on >1000 accesses/min per key
- Auto-optimization: replicate hot data
- Dashboard shows top 10 hotkeys

## Deliverables
- `lib/api/cache/hotkey-detection.ts`
- Updated redis.ts with tracking
- Updated health endpoint
- `REDIS-HOTKEY-GUIDE.md`

## Acceptance Criteria
- [ ] Detects hotkeys in real-time
- [ ] Alerts when threshold exceeded
- [ ] Dashboard shows top hotkeys
- [ ] <2ms overhead per operation

**Dependencies**: WS3 (Grafana dashboard) | **Ready**: ✅
