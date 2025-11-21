import type { NextApiResponse } from 'next'
import type { ApiV2Request, UserTier, RateLimitConfig, RateLimitInfo } from './types'
import { TooManyRequestsError } from './errorHandler'

/**
 * Rate limit configurations per tier
 */
export const RATE_LIMITS: Record<UserTier, RateLimitConfig> = {
  free: {
    requests: 100,
    window: 60, // 60 seconds = 1 minute
  },
  pro: {
    requests: 1000,
    window: 60,
  },
  enterprise: {
    requests: 10000,
    window: 60,
  },
}

/**
 * In-memory rate limit store (for development/testing)
 * In production, this should be replaced with Redis
 */
class InMemoryRateLimitStore {
  private store: Map<
    string,
    {
      tokens: number
      lastRefill: number
      resetAt: number
    }
  > = new Map()

  /**
   * Token bucket algorithm implementation
   */
  async checkLimit(
    key: string,
    limit: number,
    window: number
  ): Promise<{ allowed: boolean; info: RateLimitInfo }> {
    const now = Date.now()
    const windowMs = window * 1000

    let bucket = this.store.get(key)

    if (!bucket) {
      // Initialize new bucket
      bucket = {
        tokens: limit - 1, // Consume one token immediately
        lastRefill: now,
        resetAt: now + windowMs,
      }
      this.store.set(key, bucket)

      return {
        allowed: true,
        info: {
          limit,
          remaining: bucket.tokens,
          reset: Math.floor(bucket.resetAt / 1000),
        },
      }
    }

    // Check if window has expired
    if (now >= bucket.resetAt) {
      // Refill the bucket
      bucket.tokens = limit - 1
      bucket.lastRefill = now
      bucket.resetAt = now + windowMs

      return {
        allowed: true,
        info: {
          limit,
          remaining: bucket.tokens,
          reset: Math.floor(bucket.resetAt / 1000),
        },
      }
    }

    // Check if tokens are available
    if (bucket.tokens > 0) {
      bucket.tokens -= 1

      return {
        allowed: true,
        info: {
          limit,
          remaining: bucket.tokens,
          reset: Math.floor(bucket.resetAt / 1000),
        },
      }
    }

    // Rate limit exceeded
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)

    return {
      allowed: false,
      info: {
        limit,
        remaining: 0,
        reset: Math.floor(bucket.resetAt / 1000),
        retryAfter,
      },
    }
  }

  /**
   * Clear all rate limit data (for testing)
   */
  clear(): void {
    this.store.clear()
  }

  /**
   * Get current state for a key (for debugging)
   */
  get(key: string) {
    return this.store.get(key)
  }
}

/**
 * Global in-memory store instance
 */
const rateLimitStore = new InMemoryRateLimitStore()

/**
 * Rate limiting middleware using token bucket algorithm
 *
 * Limits requests based on user tier or custom configuration.
 * Sets standard rate limit headers in responses.
 *
 * Headers set:
 * - RateLimit-Limit: Maximum requests allowed
 * - RateLimit-Remaining: Requests remaining in current window
 * - RateLimit-Reset: Unix timestamp when limit resets
 * - Retry-After: Seconds to wait before retrying (on 429)
 *
 * @example
 * // Use default tier-based limiting
 * await rateLimitMiddleware(req, res, next)
 *
 * // Use custom limit
 * await rateLimitMiddleware(req, res, next, { requests: 50, window: 60 })
 */
export async function rateLimitMiddleware(
  req: ApiV2Request,
  res: NextApiResponse,
  next: () => void,
  customLimit?: RateLimitConfig
): Promise<void> {
  try {
    // Determine the rate limit key
    const key = getRateLimitKey(req)

    // Get rate limit configuration
    const config = customLimit || getRateLimitConfig(req)

    // Check rate limit
    const { allowed, info } = await checkRateLimit(key, config)

    // Set rate limit headers
    setRateLimitHeaders(res, info)

    if (!allowed) {
      throw new TooManyRequestsError(
        `Rate limit exceeded. You can make ${info.limit} requests per ${config.window} seconds.`,
        info.retryAfter
      )
    }

    next()
  } catch (error) {
    throw error
  }
}

/**
 * Generate a unique rate limit key for the request
 */
function getRateLimitKey(req: ApiV2Request): string {
  const userId = req.user?.sub || req.user?.id
  const ip = getClientIp(req)

  // Use user ID if authenticated, otherwise use IP
  if (userId) {
    return `ratelimit:user:${userId}`
  }

  return `ratelimit:ip:${ip}`
}

/**
 * Get rate limit configuration based on user tier
 */
function getRateLimitConfig(req: ApiV2Request): RateLimitConfig {
  // Extract tier from user metadata or default to 'free'
  const tier = (req.user?.user_metadata?.tier as UserTier) || 'free'

  return RATE_LIMITS[tier] || RATE_LIMITS.free
}

/**
 * Check rate limit using the store
 */
async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; info: RateLimitInfo }> {
  return rateLimitStore.checkLimit(key, config.requests, config.window)
}

/**
 * Set rate limit headers on the response
 */
function setRateLimitHeaders(res: NextApiResponse, info: RateLimitInfo): void {
  res.setHeader('RateLimit-Limit', String(info.limit))
  res.setHeader('RateLimit-Remaining', String(info.remaining))
  res.setHeader('RateLimit-Reset', String(info.reset))

  // Set standard X- prefixed headers for backwards compatibility
  res.setHeader('X-RateLimit-Limit', String(info.limit))
  res.setHeader('X-RateLimit-Remaining', String(info.remaining))
  res.setHeader('X-RateLimit-Reset', String(info.reset))

  if (info.retryAfter) {
    res.setHeader('Retry-After', String(info.retryAfter))
  }
}

/**
 * Extract client IP address from request
 */
function getClientIp(req: ApiV2Request): string {
  // Check various headers for real IP
  const forwarded = req.headers['x-forwarded-for']
  const realIp = req.headers['x-real-ip']

  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded
    return ips.split(',')[0].trim()
  }

  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp
  }

  // Fallback to socket address
  return req.socket?.remoteAddress || 'unknown'
}

/**
 * Clear all rate limit data (for testing)
 */
export function clearRateLimits(): void {
  rateLimitStore.clear()
}

/**
 * Get rate limit store (for testing/debugging)
 */
export function getRateLimitStore() {
  return rateLimitStore
}

/**
 * Create a rate limiter with custom configuration
 */
export function createRateLimiter(config: RateLimitConfig) {
  return (req: ApiV2Request, res: NextApiResponse, next: () => void) => {
    return rateLimitMiddleware(req, res, next, config)
  }
}

/**
 * Rate limiter for specific endpoints with custom limits
 */
export const strictRateLimiter = createRateLimiter({
  requests: 10,
  window: 60,
})

export const generousRateLimiter = createRateLimiter({
  requests: 10000,
  window: 60,
})
