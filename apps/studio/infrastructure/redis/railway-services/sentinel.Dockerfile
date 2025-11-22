# Redis Sentinel Node for HA Cluster Monitoring
# Purpose: Monitor Redis nodes, coordinate automatic failover
# Role: Sentinel quorum member (3 total, 2 required for failover)

FROM redis:7.2-alpine

# Install tools
RUN apk add --no-cache bash curl

# Create directories
RUN mkdir -p /data && \
    chown redis:redis /data

# Copy sentinel configuration
COPY sentinel.conf /usr/local/etc/redis/sentinel.conf

# Fix permissions
RUN chown redis:redis /usr/local/etc/redis/sentinel.conf && \
    chmod 640 /usr/local/etc/redis/sentinel.conf

# Health check (Sentinel runs on port 26379)
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=3 \
  CMD redis-cli -p 26379 ping || exit 1

# Expose Sentinel port
EXPOSE 26379

# Run as redis user
USER redis

# Start Sentinel
CMD ["redis-sentinel", "/usr/local/etc/redis/sentinel.conf"]
