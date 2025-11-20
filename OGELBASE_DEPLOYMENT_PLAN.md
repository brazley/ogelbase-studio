# OgelBase Studio → Railway Deployment Plan

**The Journey:**
```
Local Studio → Railway Discovery → Vercel Setup → Wire Connection → Deploy → Celebrate
```

## Phase 1: Discovery (Railway CLI)
**Goal:** Get all the service URLs, credentials, and JWT keys from your Railway deployment

- Use Railway CLI to connect to project `e0b212f2-b913-4ea6-8b0d-6f54a081db5f`
- Extract service endpoints (Kong, Postgres, Auth, etc.)
- Get JWT keys (anon key, service role key)
- Get Postgres password
- Document all the pieces we need

## Phase 2: Preparation (Local)
**Goal:** Set up the deployment tooling

- Install Vercel CLI
- Authenticate with Vercel account
- Verify Railway CLI is connected to OgelBase project

## Phase 3: Environment Configuration (Vercel)
**Goal:** Create the bridge between Vercel and Railway

- Create new Vercel project pointing to `/apps/studio`
- Map Railway endpoints to Vercel environment variables
- Set up all the connection strings Studio needs
- Configure CORS origins (Vercel → Railway)

## Phase 4: Deployment (Vercel)
**Goal:** Get Studio live

- Push Studio to Vercel
- Let Vercel build and deploy
- Get the production URL

## Phase 5: Validation (Both)
**Goal:** Prove it works end-to-end

- Open Studio at Vercel URL
- Verify connection to Railway services
- Test database access through Studio UI
- Confirm Auth, Storage, Functions all visible

## Phase 6: CORS & Security (Railway)
**Goal:** Lock down the connection

- Update Railway Kong config to allow Vercel domain
- Verify secure communication
- Test authenticated requests

---

## The Flow

1. **Railway:** "Here's where my services live and here's how to talk to them"
2. **Vercel:** "Here's where Studio lives and here's what it needs to connect"
3. **Wire them together:** Environment variables bridge the gap
4. **Deploy:** Studio goes live pointing at Railway backend
5. **Verify:** Click around Studio, see your Railway data
6. **Secure:** Lock down CORS and auth

---

**Simple as Lego blocks snapping together.**

## Project Details

- **Railway Project:** OgelBase
- **Railway Project ID:** `e0b212f2-b913-4ea6-8b0d-6f54a081db5f`
- **Studio Location:** `/apps/studio`
- **Target:** Vercel deployment connected to Railway backend
