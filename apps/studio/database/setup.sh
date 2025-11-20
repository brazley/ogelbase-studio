#!/bin/bash

# ============================================
# Platform Database Setup Script
# ============================================
# This script helps you set up the platform database for Supabase Studio.
# It will:
#   1. Validate your DATABASE_URL
#   2. Run the migration to create schema
#   3. Run the seed script to populate initial data
#
# Prerequisites:
#   - PostgreSQL client (psql) installed
#   - DATABASE_URL environment variable set
#
# Usage:
#   ./setup.sh
#
# Or with explicit DATABASE_URL:
#   DATABASE_URL="postgresql://..." ./setup.sh
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Supabase Studio Platform Database Setup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}⚠️  DATABASE_URL not found in environment${NC}"
    echo ""
    echo "Please enter your platform database URL:"
    echo -e "${BLUE}Format: postgresql://user:password@host:port/database${NC}"
    echo ""
    echo "Railway example:"
    echo "  postgresql://postgres:pass@postgres.railway.internal:5432/railway"
    echo ""
    read -p "DATABASE_URL: " DATABASE_URL
    export DATABASE_URL
fi

# Validate DATABASE_URL format
if [[ ! "$DATABASE_URL" =~ ^postgresql:// ]]; then
    echo -e "${RED}❌ ERROR: Invalid DATABASE_URL format${NC}"
    echo "Expected format: postgresql://user:password@host:port/database"
    exit 1
fi

echo -e "${GREEN}✓${NC} DATABASE_URL configured"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ ERROR: psql not found${NC}"
    echo "Please install PostgreSQL client:"
    echo "  macOS: brew install postgresql"
    echo "  Ubuntu: sudo apt-get install postgresql-client"
    echo "  Other: https://www.postgresql.org/download/"
    exit 1
fi

echo -e "${GREEN}✓${NC} PostgreSQL client (psql) found"
echo ""

# Test database connection
echo -e "${BLUE}🔌 Testing database connection...${NC}"
if ! psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${RED}❌ ERROR: Could not connect to database${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check your credentials are correct"
    echo "  2. Verify the host and port are accessible"
    echo "  3. If using Railway, ensure you're using the correct URL:"
    echo "     - Internal: postgres.railway.internal (from Railway)"
    echo "     - Public: roundhouse.proxy.rlwy.net (from elsewhere)"
    echo "  4. Try adding ?sslmode=require to the URL"
    exit 1
fi

echo -e "${GREEN}✓${NC} Database connection successful"
echo ""

# Check if schema already exists
echo -e "${BLUE}🔍 Checking if platform schema exists...${NC}"
if psql "$DATABASE_URL" -tAc "SELECT 1 FROM information_schema.schemata WHERE schema_name='platform'" | grep -q 1; then
    echo -e "${YELLOW}⚠️  Platform schema already exists${NC}"
    echo ""
    read -p "Do you want to continue? This will update existing tables. (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
else
    echo -e "${GREEN}✓${NC} Schema does not exist (will create)"
fi

echo ""

# Run migration
echo -e "${BLUE}📝 Running migration: Creating platform schema...${NC}"
if psql "$DATABASE_URL" -f "$SCRIPT_DIR/migrations/001_create_platform_schema.sql" > /dev/null; then
    echo -e "${GREEN}✓${NC} Migration completed successfully"
else
    echo -e "${RED}❌ ERROR: Migration failed${NC}"
    exit 1
fi

echo ""

# Verify migration
echo -e "${BLUE}✓ Verifying migration...${NC}"
TABLE_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='platform'")
if [ "$TABLE_COUNT" -ge 3 ]; then
    echo -e "${GREEN}✓${NC} Found $TABLE_COUNT tables in platform schema"
else
    echo -e "${RED}❌ ERROR: Expected at least 3 tables, found $TABLE_COUNT${NC}"
    exit 1
fi

echo ""

# Ask about seeding
echo -e "${BLUE}🌱 Database schema created successfully!${NC}"
echo ""
read -p "Do you want to seed initial data? (Y/n): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo ""
    echo -e "${BLUE}📦 Seeding database...${NC}"
    echo ""
    echo "Choose seeding method:"
    echo "  1) Node.js script (reads from .env.production)"
    echo "  2) SQL script (requires manual configuration)"
    read -p "Choice (1-2): " -n 1 -r SEED_CHOICE
    echo ""

    if [ "$SEED_CHOICE" = "1" ]; then
        # Check if Node.js is installed
        if ! command -v node &> /dev/null; then
            echo -e "${RED}❌ ERROR: Node.js not found${NC}"
            echo "Please install Node.js or use SQL seed script option"
            exit 1
        fi

        # Check if pg package is installed
        if ! npm list pg > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠️  Installing pg package...${NC}"
            npm install pg
        fi

        # Run Node.js seed script
        node "$SCRIPT_DIR/seeds/seed.js"
    elif [ "$SEED_CHOICE" = "2" ]; then
        echo ""
        echo -e "${YELLOW}⚠️  Please edit seeds/001_seed_default_data.sql first${NC}"
        echo "Update the configuration variables at the top of the file."
        echo ""
        read -p "Have you edited the file? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            psql "$DATABASE_URL" -f "$SCRIPT_DIR/seeds/001_seed_default_data.sql"
        else
            echo "Skipping seed step. You can run it later with:"
            echo "  psql \"\$DATABASE_URL\" -f seeds/001_seed_default_data.sql"
        fi
    else
        echo "Invalid choice. Skipping seed step."
    fi
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ Platform Database Setup Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Add DATABASE_URL to your .env.production file"
echo "2. Deploy to Vercel with environment variable:"
echo "   vercel env add DATABASE_URL"
echo ""
echo "3. Verify the setup:"
echo "   psql \"\$DATABASE_URL\" -c 'SELECT * FROM platform.organizations;'"
echo ""
echo "4. Test API endpoint:"
echo "   curl https://your-studio-url/api/platform/profile"
echo ""
echo "For detailed documentation, see:"
echo "  ${SCRIPT_DIR}/README.md"
echo ""
