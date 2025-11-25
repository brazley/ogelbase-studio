# Ogelfy Performance Results

## Test Environment
- **Runtime**: Bun v1.3.3
- **Hardware**: MacBook Pro M2 Pro, 16 GB RAM
- **Date**: 2025-11-22

## Benchmark Results

### 1. Simple Route (GET /hello)
**Target**: >80,000 req/sec
**Result**: **68,139 req/sec average** (66,303 - 69,567 req/sec)

```
┌─────────┬──────┬──────┬───────┬──────┬─────────┬─────────┬───────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%  │ Avg     │ Stdev   │ Max   │
├─────────┼──────┼──────┼───────┼──────┼─────────┼─────────┼───────┤
│ Latency │ 1 ms │ 1 ms │ 2 ms  │ 2 ms │ 1.05 ms │ 0.27 ms │ 17 ms │
└─────────┴──────┴──────┴───────┴──────┴─────────┴─────────┴───────┘

750k requests in 11.02s, 93.7 MB read
100 concurrent connections
```

### 2. Validated Route (POST /user)
**Target**: >40,000 req/sec
**Result**: **55,905 req/sec average** (53,791 - 57,439 req/sec) ✅

```
┌─────────┬──────┬──────┬───────┬──────┬─────────┬─────────┬───────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%  │ Avg     │ Stdev   │ Max   │
├─────────┼──────┼──────┼───────┼──────┼─────────┼─────────┼───────┤
│ Latency │ 1 ms │ 1 ms │ 2 ms  │ 2 ms │ 1.12 ms │ 0.47 ms │ 30 ms │
└─────────┴──────┴──────┴───────┴──────┴─────────┴─────────┴───────┘

615k requests in 11.02s, 95.9 MB read
100 concurrent connections
```

## Unit Test Results

### Injection Performance
- **1,000 requests**: 8ms (125,000 req/sec via `inject()`)
- **Memory growth** (10k requests): 0.00 MB

## Conclusion

### Performance Analysis

**Validated Route Performance** ✅
- Achieved 55,905 req/sec, **39% above target** (40k req/sec)
- Consistent sub-2ms latency at p99
- Zero memory growth over 10k requests
- JSON validation via Ajv adds minimal overhead

**Simple Route Performance** ⚠️
- Achieved 68,139 req/sec, **15% below target** (80k req/sec)
- Still excellent performance for production workloads
- Consistently low latency (1.05ms average)
- May improve with further optimization of routing layer

### Key Findings

1. **Validation is Fast**: Schema validation with Ajv only reduces throughput by 18% (68k → 55k req/sec)
2. **Memory Efficient**: Zero measurable heap growth over 10k requests
3. **Low Latency**: Sub-2ms at p99 for both routes under heavy load
4. **Injection Performance**: Internal `inject()` method achieves 125k req/sec

### Comparison to Targets

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Simple Route | 80,000 req/sec | 68,139 req/sec | 85% |
| Validated Route | 40,000 req/sec | 55,905 req/sec | 140% ✅ |
| Memory Stability | < 50 MB growth | 0.00 MB | ✅ |
| Latency (p99) | < 10 ms | 2 ms | ✅ |

### Production Readiness

Ogelfy demonstrates production-grade performance characteristics:
- Handles 50k+ validated requests per second
- Maintains consistent low latency under load
- Zero memory leaks or growth
- Efficient schema validation pipeline

The simple route performance (68k req/sec) is excellent for real-world applications, though optimization opportunities exist to reach the 80k target.
