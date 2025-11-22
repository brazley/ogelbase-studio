# Redis Primary Node for Sentinel HA Cluster
# Purpose: Accepts all write operations, replicates to replicas
# Role: Master node with async replication

FROM redis:7.2-alpine

# Install tools for health checks and debugging
RUN apk add --no-cache bash curl

# Create redis user directories
RUN mkdir -p /data && \
    chown redis:redis /data

# Copy primary configuration
COPY redis-primary.conf /usr/local/etc/redis/redis.conf

# Health check
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
  CMD redis-cli ping || exit 1

# Expose Redis port
EXPOSE 6379

# Run as redis user
USER redis

# Start Redis with custom config
CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]
