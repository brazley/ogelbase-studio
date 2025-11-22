# Redis Replica Node for Sentinel HA Cluster
# Purpose: Serves read operations, replicates from primary
# Role: Slave node with potential for promotion to master

FROM redis:7.2-alpine

# Install tools
RUN apk add --no-cache bash curl

# Create directories
RUN mkdir -p /data && \
    chown redis:redis /data

# Copy replica configuration
COPY redis-replica.conf /usr/local/etc/redis/redis.conf

# Health check
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
  CMD redis-cli ping || exit 1

# Expose Redis port
EXPOSE 6379

# Run as redis user
USER redis

# Start Redis with custom config
CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]
