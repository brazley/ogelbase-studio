#!/bin/bash

echo "===================================="
echo "Railway Connection Details"
echo "===================================="
echo ""

# Redis
echo "📦 REDIS"
railway variables --service Redis --environment production 2>&1 | head -20
echo ""

# MongoDB  
echo "📦 MONGODB"
railway variables --service MongoDB --environment production 2>&1 | head -20
echo ""

# Bun Server
echo "📦 BUN SERVER"
railway variables --service server --environment production 2>&1 | head -20

