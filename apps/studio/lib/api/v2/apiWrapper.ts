import type { NextApiResponse } from 'next'
import type { ApiV2Request, ApiV2Handler, ApiV2WrapperOptions } from './types'
import { apiVersionMiddleware } from './versionMiddleware'
import { rateLimitMiddleware } from './rateLimiter'
import { auditLogMiddleware } from './auditLogger'
import { errorHandler, asyncHandler } from './errorHandler'
import { apiAuthenticate } from '../apiAuthenticate'
import { isResponseOk } from '../apiWrapper'
import { UnauthorizedError } from './errorHandler'

/**
 * API v2 wrapper that combines all middleware layers
 *
 * This wrapper provides:
 * - API versioning (required)
 * - Authentication (optional)
 * - Rate limiting (optional)
 * - Audit logging (optional)
 * - Error handling (automatic)
 *
 * @example
 * export default apiWrapperV2(handler, { withAuth: true, withRateLimit: true })
 *
 * async function handler(req: ApiV2Request, res: NextApiResponse) {
 *   const { id } = req.query
 *   const project = await getProject(id)
 *   res.json(project)
 * }
 */
export function apiWrapperV2(
  handler: ApiV2Handler,
  options: ApiV2WrapperOptions = {}
): (req: ApiV2Request, res: NextApiResponse) => Promise<void> {
  const { withAuth = false, withRateLimit = false, withAuditLog = true } = options

  return async (req: ApiV2Request, res: NextApiResponse) => {
    try {
      // Create middleware chain
      const middlewares: Array<(next: () => void | Promise<void>) => void | Promise<void>> = []

      // 1. API Version Middleware (always enabled)
      middlewares.push((next) => apiVersionMiddleware(req, res, next))

      // 2. Authentication Middleware (if enabled)
      if (withAuth) {
        middlewares.push(async (next) => {
          const response = await apiAuthenticate(req, res)
          if (!isResponseOk(response)) {
            throw new UnauthorizedError(response.error?.message || 'Authentication failed')
          }
          req.user = response as any
          next()
        })
      }

      // 3. Rate Limiting Middleware (if enabled)
      if (withRateLimit) {
        middlewares.push((next) =>
          rateLimitMiddleware(req, res, next, options.rateLimit?.customLimit)
        )
      }

      // 4. Audit Logging Middleware (if enabled)
      if (withAuditLog) {
        middlewares.push((next) => auditLogMiddleware(req, res, next))
      }

      // Execute middleware chain
      await executeMiddlewareChain(middlewares)

      // Execute the main handler
      await handler(req, res)
    } catch (error) {
      // Global error handler
      errorHandler(error as Error, req, res)
    }
  }
}

/**
 * Execute a chain of middleware functions in sequence
 */
async function executeMiddlewareChain(
  middlewares: Array<(next: () => void | Promise<void>) => void | Promise<void>>
): Promise<void> {
  let index = 0

  async function next(): Promise<void> {
    if (index >= middlewares.length) {
      return
    }

    const middleware = middlewares[index++]
    await middleware(next)
  }

  await next()
}

/**
 * Specialized wrapper for public endpoints (no auth required)
 */
export function publicApiV2(handler: ApiV2Handler) {
  return apiWrapperV2(handler, {
    withAuth: false,
    withRateLimit: true,
    withAuditLog: true,
  })
}

/**
 * Specialized wrapper for authenticated endpoints
 */
export function authenticatedApiV2(handler: ApiV2Handler) {
  return apiWrapperV2(handler, {
    withAuth: true,
    withRateLimit: true,
    withAuditLog: true,
  })
}

/**
 * Specialized wrapper for internal endpoints (no rate limiting)
 */
export function internalApiV2(handler: ApiV2Handler) {
  return apiWrapperV2(handler, {
    withAuth: true,
    withRateLimit: false,
    withAuditLog: true,
  })
}

/**
 * Specialized wrapper for webhook endpoints
 */
export function webhookApiV2(handler: ApiV2Handler) {
  return apiWrapperV2(handler, {
    withAuth: false,
    withRateLimit: true,
    withAuditLog: true,
  })
}

/**
 * Export async handler wrapper for convenience
 */
export { asyncHandler }

/**
 * Helper to create a method router
 */
export function methodRouter(handlers: {
  GET?: ApiV2Handler
  POST?: ApiV2Handler
  PUT?: ApiV2Handler
  PATCH?: ApiV2Handler
  DELETE?: ApiV2Handler
  OPTIONS?: ApiV2Handler
}): ApiV2Handler {
  return async (req: ApiV2Request, res: NextApiResponse) => {
    const method = req.method?.toUpperCase()
    const handler = handlers[method as keyof typeof handlers]

    if (!handler) {
      const allowedMethods = Object.keys(handlers).join(', ')
      res.setHeader('Allow', allowedMethods)
      res.status(405).json({
        type: 'https://api.supabase.com/errors/method-not-allowed',
        title: 'Method Not Allowed',
        status: 405,
        detail: `Method ${method} is not allowed for this endpoint. Allowed methods: ${allowedMethods}`,
        errorCode: 'METHOD_NOT_ALLOWED',
      })
      return
    }

    await handler(req, res)
  }
}
