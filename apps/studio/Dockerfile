# To be run in the root of the turbo monorepo
# NOTE: It's highly recommended to use the new builder, Buildkit. https://docs.docker.com/build/buildkit/
## USAGE:
# Build:        docker build . -f apps/studio/Dockerfile --target production -t studio:latest
# Run:          docker run -p 3000:3000 supabase/studio
# Deploy:       docker push supabase/studio:latest
# Clean build:
#    docker builder prune
#    docker build . -f apps/studio/Dockerfile --target production -t studio:latest --no-cache

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Fixes issues with Sentry CLI and SSL certificates during build
# TODO: Git is added because it's needed to build libpg, remove it once they publish a binary on the S3 bucket
# Install necessary packages for Alpine Linux
# bash is required for docker-entrypoint.sh
RUN apk add --no-cache \
  git \
  python3 \
  ca-certificates \
  build-base \
  bash \
  tini && \
  update-ca-certificates

RUN npm install -g pnpm@10.16.1

WORKDIR /app

# Declare build arguments for NEXT_PUBLIC_* variables
# These must be declared here to be available in all subsequent stages
ARG NEXT_PUBLIC_IS_PLATFORM
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_GOTRUE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL

# Prune unneeded dependencies with turbo (from apps/ for example)
FROM base AS turbo
COPY . .

RUN pnpm dlx turbo@2.3.3 prune studio --docker

# Install dev dependencies (only if needed)
FROM base AS deps
COPY --from=turbo /app/out/json ./
COPY --from=turbo /app/out/pnpm-lock.yaml ./

# No need to clean cache because production uses standalone build
RUN pnpm install --frozen-lockfile

# dev contains dependencies and source code not compiled
FROM deps AS dev
# Copy the entrypoint script for dev stage
COPY apps/studio/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
COPY --from=turbo /app/out/full ./
ENTRYPOINT ["docker-entrypoint.sh"]
EXPOSE 8082
CMD ["pnpm", "dev:studio"]

# Compile Next.js
FROM dev AS builder
ENV NODE_OPTIONS="--max-old-space-size=8192"

# Re-declare build arguments (they don't persist across stages)
ARG NEXT_PUBLIC_IS_PLATFORM
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_GOTRUE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL

# Pass build args as environment variables for Next.js build
# These will be embedded into the JavaScript bundle at build time
ENV NEXT_PUBLIC_IS_PLATFORM=$NEXT_PUBLIC_IS_PLATFORM
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_GOTRUE_URL=$NEXT_PUBLIC_GOTRUE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

RUN pnpm --filter studio exec next build

# Copy only compiled code and dependencies
FROM base AS production
# Copy the entrypoint script
COPY apps/studio/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
COPY --from=builder /app/apps/studio/public ./apps/studio/public
COPY --from=builder /app/apps/studio/.next/standalone ./
COPY --from=builder /app/apps/studio/.next/static ./apps/studio/.next/static
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
HEALTHCHECK --interval=5s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:3000/api/platform/profile').then((r) => {if (r.status !== 200) throw new Error(r.status)})"
CMD ["node", "apps/studio/server.js"]
