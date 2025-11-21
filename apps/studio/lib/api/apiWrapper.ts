import type { NextApiRequest, NextApiResponse } from 'next'

import { ResponseError, ResponseFailure } from 'types'
import { IS_PLATFORM } from '../constants'
import { apiAuthenticate, UserContext } from './apiAuthenticate'

// Extend NextApiRequest to include user context
export interface AuthenticatedRequest extends NextApiRequest {
  user?: UserContext
}

export function isResponseOk<T>(response: T | ResponseFailure | undefined): response is T {
  if (response === undefined || response === null) {
    return false
  }

  if (response instanceof ResponseError) {
    return false
  }

  if (typeof response === 'object' && 'error' in response && Boolean(response.error)) {
    return false
  }

  return true
}

// Purpose of this apiWrapper is to function like a global catchall for ANY errors
// It's a safety net as the API service should never drop, nor fail

export default async function apiWrapper(
  req: NextApiRequest,
  res: NextApiResponse,
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<Response | void>,
  options?: { withAuth?: boolean }
): Promise<Response | void> {
  try {
    const { withAuth = false } = options || {}

    if (IS_PLATFORM && withAuth) {
      const response = await apiAuthenticate(req, res)

      if (!isResponseOk(response)) {
        // Determine appropriate status code
        const errorMessage = response.error?.message || 'Unauthorized'
        const statusCode = errorMessage.includes('expired') ? 401
          : errorMessage.includes('banned') ? 403
          : 401

        return res.status(statusCode).json({
          error: {
            message: errorMessage,
          },
        })
      }

      // Attach user context to request
      const authenticatedReq = req as AuthenticatedRequest
      authenticatedReq.user = response
    }

    return handler(req as AuthenticatedRequest, res)
  } catch (error) {
    console.error('[apiWrapper] Unexpected error:', error)
    return res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : 'Internal server error'
      }
    })
  }
}
