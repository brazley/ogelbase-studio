import type { NextApiRequest, NextApiResponse } from 'next'
import type { JwtPayload } from '@supabase/supabase-js'

/**
 * Extended Next.js API Request with additional v2 properties
 */
export interface ApiV2Request extends NextApiRequest {
  apiVersion?: string
  user?: JwtPayload
  startTime?: number
}

/**
 * RFC 9457 Problem Details for HTTP APIs
 * @see https://www.rfc-editor.org/rfc/rfc9457.html
 */
export interface ProblemDetails {
  /** A URI reference that identifies the problem type */
  type: string
  /** A short, human-readable summary of the problem type */
  title: string
  /** The HTTP status code */
  status: number
  /** A human-readable explanation specific to this occurrence */
  detail?: string
  /** A URI reference that identifies the specific occurrence */
  instance?: string
  /** Application-specific error code */
  errorCode?: string
  /** Validation errors (for 400 Bad Request) */
  validationErrors?: ValidationError[]
  /** Additional extension members */
  [key: string]: unknown
}

export interface ValidationError {
  field: string
  message: string
  code?: string
}

/**
 * Paginated response structure with cursor-based pagination
 */
export interface PaginatedResponse<T> {
  data: T[]
  cursor?: string
  hasMore: boolean
  total?: number
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  limit: number
  remaining: number
  reset: number
  retryAfter?: number
}

/**
 * User tier for rate limiting
 */
export type UserTier = 'free' | 'pro' | 'enterprise'

/**
 * Rate limit configuration per tier
 */
export interface RateLimitConfig {
  requests: number
  window: number // in seconds
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  timestamp: string
  userId?: string
  orgId?: string
  method: string
  path: string
  statusCode: number
  duration: number
  userAgent?: string
  ip?: string
  errorCode?: string
}

/**
 * API Handler type for v2
 */
export type ApiV2Handler = (req: ApiV2Request, res: NextApiResponse) => Promise<void> | void

/**
 * API Wrapper options
 */
export interface ApiV2WrapperOptions {
  withAuth?: boolean
  withRateLimit?: boolean
  withAuditLog?: boolean
  rateLimit?: {
    tier?: UserTier
    customLimit?: RateLimitConfig
  }
}
