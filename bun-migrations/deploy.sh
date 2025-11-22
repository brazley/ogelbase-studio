#!/bin/bash
# Deploy Bun Migrations to Railway
# Run this from bun-migrations directory

echo "🚀 Deploying Bun Migrations Server to Railway..."
echo ""
echo "This will:"
echo "  1. Create 'bun-migrations' service in Railway"
echo "  2. Deploy and auto-run Migration 008"
echo "  3. Verify column creation"
echo ""

# Note: Railway CLI 'add' command requires TTY for interactive prompts
# You have two options:

echo "OPTION 1: Via Railway Dashboard (Recommended)"
echo "  1. Open https://railway.app/project/OgelBase"
echo "  2. Click 'New Service' → 'GitHub Repo'"
echo "  3. Select this repo, set root: 'bun-migrations'"
echo "  4. Auto-deploys and runs migration"
echo ""

echo "OPTION 2: Via Railway CLI (Manual)"
echo "  railway link  # If not linked"
echo "  railway up    # Uploads and deploys (may hit size limits)"
echo ""

echo "OPTION 3: Run Migration Directly via Railway Shell"
echo "  railway shell"
echo "  cd bun-migrations"
echo "  bun run migrate-008"
echo ""

echo "Migration will:"
echo "  ✅ Add active_org_id column to platform.users"
echo "  ✅ Create helper functions"
echo "  ✅ Backfill existing users"
echo "  ✅ Verify success"
