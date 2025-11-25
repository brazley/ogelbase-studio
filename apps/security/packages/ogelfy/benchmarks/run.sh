#!/bin/bash
set -e

echo "=== Ogelfy Performance Benchmarks ==="
echo ""

# Simple route
echo "1. Simple Route (GET /hello)"
~/.bun/bin/bun run benchmarks/simple-route.ts &
PID1=$!
sleep 2
npx autocannon -c 100 -d 10 http://localhost:3000/hello
kill $PID1
wait $PID1 2>/dev/null || true

echo ""
echo "---"
echo ""

# Validated route
echo "2. Validated Route (POST /user)"
~/.bun/bin/bun run benchmarks/validated-route.ts &
PID2=$!
sleep 2
npx autocannon -c 100 -d 10 -m POST \
  -H "content-type: application/json" \
  -b '{"name":"John","age":30}' \
  http://localhost:3001/user
kill $PID2
wait $PID2 2>/dev/null || true

echo ""
echo "=== Benchmarks Complete ==="
