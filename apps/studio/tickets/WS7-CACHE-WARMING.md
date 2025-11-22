# WS7: Cache Warming

**Owner**: Tarun Menon | **Agent**: `TarunMenon` | **Days**: 2 | **Status**: 🟡 READY

## Objective
Pre-populate Redis cache on startup with critical sessions to achieve 90% hit rate within 5 minutes.

## Scope
1. Create `lib/api/cache/warming.ts` - Cache warming logic
2. Create `scripts/warm-redis-cache.ts` - Manual warming script  
3. Update app startup - Auto-warm on deploy
4. Monitor warming progress

## Strategy
- Query most active sessions from Postgres (last 24h)
- Load top 1000 sessions into cache
- Background process, non-blocking
- Progress logging every 100 sessions

## Deliverables
- `lib/api/cache/warming.ts`
- `scripts/warm-redis-cache.ts`
- Updated startup sequence
- `REDIS-CACHE-WARMING-GUIDE.md`

## Acceptance Criteria
- [ ] 90% hit rate after 5-min warm-up
- [ ] Warming doesn't block startup
- [ ] Progress visible in logs
- [ ] Smart warming (recent sessions first)

**Dependencies**: WS2 (logging) | **Ready**: ✅
