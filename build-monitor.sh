#!/bin/bash

# Live Docker Build Monitor
BUILD_ID="02ed16"

clear
echo "🐳 Docker Build Monitor - Live Progress"
echo "========================================"
echo ""

while true; do
  # Move cursor to top
  tput cup 3 0

  # Check build status
  STATUS=$(docker buildx ls 2>/dev/null | grep -q "running" && echo "running" || echo "completed")

  # Get latest build output
  OUTPUT=$(docker logs buildx_buildkit_desktop-linux0 2>&1 | tail -100)

  # Parse stages
  if echo "$OUTPUT" | grep -q "#15.*RUN pnpm.*next build"; then
    if echo "$OUTPUT" | grep -q "#15.*DONE"; then
      STAGE="Stage 5: Packaging & Pushing"
      PROGRESS=85
      BAR="█████████████████░░░"
    else
      STAGE="Stage 4: Building Next.js 🔥"
      PROGRESS=75
      BAR="███████████████░░░░░"
    fi
  elif echo "$OUTPUT" | grep -q "#13.*DONE"; then
    STAGE="Stage 4: Building Next.js 🔥"
    PROGRESS=75
    BAR="███████████████░░░░░"
  elif echo "$OUTPUT" | grep -q "#13.*RUN pnpm install"; then
    STAGE="Stage 3: Installing Dependencies"
    PROGRESS=50
    BAR="██████████░░░░░░░░░░"
  elif echo "$OUTPUT" | grep -q "#6.*DONE"; then
    STAGE="Stage 3: Installing Dependencies"
    PROGRESS=40
    BAR="████████░░░░░░░░░░░░"
  elif echo "$OUTPUT" | grep -q "#6.*RUN apt-get"; then
    STAGE="Stage 2: System Dependencies"
    PROGRESS=30
    BAR="██████░░░░░░░░░░░░░░"
  else
    STAGE="Stage 1: Loading & Setup"
    PROGRESS=15
    BAR="███░░░░░░░░░░░░░░░░░"
  fi

  # Check if pushing
  if echo "$OUTPUT" | grep -q "pushing layer"; then
    STAGE="Stage 5: Pushing to ghcr.io 🚀"
    PROGRESS=90
    BAR="██████████████████░░"
  fi

  # Check if done
  if echo "$OUTPUT" | grep -q "exporting to image"; then
    STAGE="Stage 5: Finalizing Image ✅"
    PROGRESS=95
    BAR="███████████████████░"
  fi

  # Display progress
  echo "Current Stage: $STAGE"
  echo ""
  echo "Progress: [$BAR] $PROGRESS%"
  echo ""
  echo "Latest Build Output:"
  echo "-------------------"
  docker logs buildx_buildkit_desktop-linux0 2>&1 | tail -5
  echo ""
  echo "Press Ctrl+C to stop monitoring"

  sleep 3
done
