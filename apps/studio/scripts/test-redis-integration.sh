#!/bin/bash

# Redis Integration Test Runner
# Runs all Redis tests and generates a comprehensive report

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Output directory
REPORT_DIR="./test-reports"
mkdir -p "$REPORT_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$REPORT_DIR/redis-test-report-$TIMESTAMP.txt"

echo "=================================================================================================" | tee "$REPORT_FILE"
echo "REDIS INTEGRATION TEST SUITE" | tee -a "$REPORT_FILE"
echo "=================================================================================================" | tee -a "$REPORT_FILE"
echo "Timestamp: $(date)" | tee -a "$REPORT_FILE"
echo "Report: $REPORT_FILE" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# Check environment
echo -e "${BLUE}[1/5] Checking Environment Configuration...${NC}" | tee -a "$REPORT_FILE"
echo "------------------------------------------------------------" | tee -a "$REPORT_FILE"

if [ -z "$REDIS_URL" ]; then
    echo -e "${YELLOW}Warning: REDIS_URL not set${NC}" | tee -a "$REPORT_FILE"
    echo "Session caching will be disabled" | tee -a "$REPORT_FILE"
    echo "Set REDIS_URL to test caching functionality" | tee -a "$REPORT_FILE"
    REDIS_ENABLED=false
else
    echo -e "${GREEN}✓ REDIS_URL configured${NC}" | tee -a "$REPORT_FILE"
    # Mask password in URL
    MASKED_URL=$(echo "$REDIS_URL" | sed -E 's/:([^:@]+)@/:****@/')
    echo "  URL: $MASKED_URL" | tee -a "$REPORT_FILE"
    REDIS_ENABLED=true
fi

echo "" | tee -a "$REPORT_FILE"

# Test 1: Connection Tests
echo -e "${BLUE}[2/5] Running Connection Tests...${NC}" | tee -a "$REPORT_FILE"
echo "------------------------------------------------------------" | tee -a "$REPORT_FILE"

if [ "$REDIS_ENABLED" = true ]; then
    if tsx tests/redis-connection-test.ts 2>&1 | tee -a "$REPORT_FILE"; then
        echo -e "${GREEN}✓ Connection tests PASSED${NC}" | tee -a "$REPORT_FILE"
        CONNECTION_TESTS="PASS"
    else
        echo -e "${RED}✗ Connection tests FAILED${NC}" | tee -a "$REPORT_FILE"
        CONNECTION_TESTS="FAIL"
    fi
else
    echo -e "${YELLOW}⊘ Skipped (REDIS_URL not set)${NC}" | tee -a "$REPORT_FILE"
    CONNECTION_TESTS="SKIP"
fi

echo "" | tee -a "$REPORT_FILE"

# Test 2: Performance Benchmarks
echo -e "${BLUE}[3/5] Running Performance Benchmarks...${NC}" | tee -a "$REPORT_FILE"
echo "------------------------------------------------------------" | tee -a "$REPORT_FILE"

if [ "$REDIS_ENABLED" = true ]; then
    if tsx tests/session-performance-benchmark.ts 2>&1 | tee -a "$REPORT_FILE"; then
        echo -e "${GREEN}✓ Performance benchmarks PASSED${NC}" | tee -a "$REPORT_FILE"
        PERFORMANCE_TESTS="PASS"
    else
        echo -e "${RED}✗ Performance benchmarks FAILED${NC}" | tee -a "$REPORT_FILE"
        PERFORMANCE_TESTS="FAIL"
    fi
else
    echo -e "${YELLOW}⊘ Skipped (REDIS_URL not set)${NC}" | tee -a "$REPORT_FILE"
    PERFORMANCE_TESTS="SKIP"
fi

echo "" | tee -a "$REPORT_FILE"

# Test 3: Health Check Endpoint
echo -e "${BLUE}[4/5] Testing Health Check Endpoint...${NC}" | tee -a "$REPORT_FILE"
echo "------------------------------------------------------------" | tee -a "$REPORT_FILE"

# Check if server is running
if curl -s http://localhost:3000/api/health/redis > /dev/null 2>&1; then
    HEALTH_RESPONSE=$(curl -s http://localhost:3000/api/health/redis)
    echo "$HEALTH_RESPONSE" | jq . | tee -a "$REPORT_FILE"

    STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.status')

    if [ "$STATUS" = "healthy" ]; then
        echo -e "${GREEN}✓ Health check endpoint HEALTHY${NC}" | tee -a "$REPORT_FILE"
        HEALTH_CHECK="PASS"
    elif [ "$STATUS" = "degraded" ]; then
        echo -e "${YELLOW}⚠ Health check endpoint DEGRADED${NC}" | tee -a "$REPORT_FILE"
        HEALTH_CHECK="WARN"
    else
        echo -e "${RED}✗ Health check endpoint UNHEALTHY${NC}" | tee -a "$REPORT_FILE"
        HEALTH_CHECK="FAIL"
    fi
else
    echo -e "${YELLOW}⊘ Server not running on localhost:3000${NC}" | tee -a "$REPORT_FILE"
    echo "Start the development server to test health endpoint" | tee -a "$REPORT_FILE"
    HEALTH_CHECK="SKIP"
fi

echo "" | tee -a "$REPORT_FILE"

# Test 4: Code Quality Checks
echo -e "${BLUE}[5/5] Running Code Quality Checks...${NC}" | tee -a "$REPORT_FILE"
echo "------------------------------------------------------------" | tee -a "$REPORT_FILE"

echo "Checking TypeScript compilation..." | tee -a "$REPORT_FILE"
if npx tsc --noEmit --skipLibCheck lib/api/auth/session-cache.ts 2>&1 | tee -a "$REPORT_FILE"; then
    echo -e "${GREEN}✓ TypeScript compilation successful${NC}" | tee -a "$REPORT_FILE"
    TS_CHECK="PASS"
else
    echo -e "${RED}✗ TypeScript compilation failed${NC}" | tee -a "$REPORT_FILE"
    TS_CHECK="FAIL"
fi

echo "" | tee -a "$REPORT_FILE"

# Summary Report
echo "=================================================================================================" | tee -a "$REPORT_FILE"
echo "TEST SUMMARY" | tee -a "$REPORT_FILE"
echo "=================================================================================================" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

print_result() {
    local name=$1
    local result=$2

    if [ "$result" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $name: PASS" | tee -a "$REPORT_FILE"
    elif [ "$result" = "FAIL" ]; then
        echo -e "${RED}✗${NC} $name: FAIL" | tee -a "$REPORT_FILE"
    elif [ "$result" = "WARN" ]; then
        echo -e "${YELLOW}⚠${NC} $name: WARNING" | tee -a "$REPORT_FILE"
    elif [ "$result" = "SKIP" ]; then
        echo -e "${YELLOW}⊘${NC} $name: SKIPPED" | tee -a "$REPORT_FILE"
    fi
}

print_result "Connection Tests     " "$CONNECTION_TESTS"
print_result "Performance Benchmarks" "$PERFORMANCE_TESTS"
print_result "Health Check Endpoint" "$HEALTH_CHECK"
print_result "TypeScript Compilation" "$TS_CHECK"

echo "" | tee -a "$REPORT_FILE"

# Overall Status
FAILED=0
[ "$CONNECTION_TESTS" = "FAIL" ] && FAILED=1
[ "$PERFORMANCE_TESTS" = "FAIL" ] && FAILED=1
[ "$HEALTH_CHECK" = "FAIL" ] && FAILED=1
[ "$TS_CHECK" = "FAIL" ] && FAILED=1

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}=================================================================================================${NC}" | tee -a "$REPORT_FILE"
    echo -e "${GREEN}OVERALL STATUS: ✓ ALL TESTS PASSED${NC}" | tee -a "$REPORT_FILE"
    echo -e "${GREEN}=================================================================================================${NC}" | tee -a "$REPORT_FILE"
    EXIT_CODE=0
else
    echo -e "${RED}=================================================================================================${NC}" | tee -a "$REPORT_FILE"
    echo -e "${RED}OVERALL STATUS: ✗ SOME TESTS FAILED${NC}" | tee -a "$REPORT_FILE"
    echo -e "${RED}=================================================================================================${NC}" | tee -a "$REPORT_FILE"
    EXIT_CODE=1
fi

echo "" | tee -a "$REPORT_FILE"
echo "Full report saved to: $REPORT_FILE" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# Instructions
if [ "$REDIS_ENABLED" = false ]; then
    echo -e "${YELLOW}To enable Redis caching tests:${NC}"
    echo "1. Set REDIS_URL environment variable"
    echo "2. Example: export REDIS_URL=redis://localhost:6379"
    echo "3. Re-run this script"
    echo ""
fi

if [ "$HEALTH_CHECK" = "SKIP" ]; then
    echo -e "${YELLOW}To test health check endpoint:${NC}"
    echo "1. Start development server: npm run dev"
    echo "2. Re-run this script in another terminal"
    echo ""
fi

exit $EXIT_CODE
