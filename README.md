# OgelBase Studio

Self-hosted Supabase Studio with multi-tenant platform mode enabled.

## Overview

OgelBase Studio is a self-hosted deployment of Supabase Studio configured for multi-tenant platform mode. It provides a complete database management interface with organization and project management capabilities.

## Features

- Multi-tenant platform mode with organization management
- JWT-based authentication and authorization
- Self-hosted on Railway infrastructure
- Docker-based deployment
- Full Supabase Studio functionality

## Architecture

OgelBase Studio runs on Railway with the following services:

- **Studio**: Web-based database management UI
- **PostgreSQL**: Primary database (Railway Postgres)
- **GoTrue**: Authentication service via Kong gateway
- **Postgres Meta**: Database management API
- **Kong**: API gateway for routing requests

## Deployment

The application is deployed using Docker and GitHub Container Registry (GHCR).

### Docker Image

```bash
docker pull ghcr.io/brazley/ogelbase-studio:latest
```

### Running Locally

```bash
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_IS_PLATFORM=true \
  -e NEXT_PUBLIC_SUPABASE_URL=your-supabase-url \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
  ghcr.io/brazley/ogelbase-studio:latest
```

## Environment Variables

Key environment variables for platform mode:

- `NEXT_PUBLIC_IS_PLATFORM`: Enable platform mode (set to `true`)
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase backend URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: JWT anonymous key
- `SUPABASE_JWT_SECRET`: JWT secret for authentication
- `DATABASE_URL`: Connection string for platform database

## Development

Built from the Supabase monorepo with modifications for self-hosted platform mode.

### Building

```bash
docker build -f apps/studio/Dockerfile --target production -t ogelbase-studio .
```

### Local Development

```bash
cd apps/studio
npm run dev
```

## License

Based on Supabase, which is Apache 2.0 licensed.

## Version

Current version: v1.0.1
