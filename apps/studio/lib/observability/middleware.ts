import { NextApiRequest, NextApiResponse } from 'next'
import { trackHttpRequest } from './metrics'
import { logHttpRequest } from './logger'
import { addTenantContext } from './tracing'

/**
 * Extract tenant context from request
 */
function extractTenantContext(req: NextApiRequest): {
  orgId?: string
  projectId?: string
} {
  // Try to extract from various sources
  const orgId =
    (req.query.org_id as string) ||
    (req.body?.org_id as string) ||
    (req.headers['x-org-id'] as string)

  const projectId =
    (req.query.ref as string) ||
    (req.query.project_id as string) ||
    (req.body?.project_id as string) ||
    (req.headers['x-project-id'] as string)

  return { orgId, projectId }
}

/**
 * Observability middleware for API routes
 * Tracks metrics, logs, and traces for HTTP requests
 */
export function withObservability(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const start = Date.now()
    const { orgId, projectId } = extractTenantContext(req)

    // Add tenant context to tracing
    addTenantContext(orgId, projectId)

    // Capture original res.status and res.json to intercept status code
    let statusCode = 200
    const originalStatus = res.status.bind(res)
    const originalJson = res.json.bind(res)
    const originalSend = res.send.bind(res)

    res.status = (code: number) => {
      statusCode = code
      return originalStatus(code)
    }

    res.json = (body: any) => {
      const duration = (Date.now() - start) / 1000 // Convert to seconds
      const route = req.url?.split('?')[0] || 'unknown'

      // Track metrics
      trackHttpRequest(req.method || 'GET', route, statusCode, duration, orgId, projectId)

      // Log request
      logHttpRequest(req.method || 'GET', req.url || 'unknown', statusCode, duration, {
        orgId,
        projectId,
        query: req.query,
      })

      return originalJson(body)
    }

    res.send = (body: any) => {
      const duration = (Date.now() - start) / 1000
      const route = req.url?.split('?')[0] || 'unknown'

      // Track metrics
      trackHttpRequest(req.method || 'GET', route, statusCode, duration, orgId, projectId)

      // Log request
      logHttpRequest(req.method || 'GET', req.url || 'unknown', statusCode, duration, {
        orgId,
        projectId,
        query: req.query,
      })

      return originalSend(body)
    }

    try {
      await handler(req, res)
    } catch (error) {
      // Log error
      console.error('[Observability] Request handler error:', error)

      const duration = (Date.now() - start) / 1000
      const route = req.url?.split('?')[0] || 'unknown'
      const errorStatusCode = 500

      // Track error metrics
      trackHttpRequest(req.method || 'GET', route, errorStatusCode, duration, orgId, projectId)

      // Log error
      logHttpRequest(req.method || 'GET', req.url || 'unknown', errorStatusCode, duration, {
        orgId,
        projectId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }
  }
}
