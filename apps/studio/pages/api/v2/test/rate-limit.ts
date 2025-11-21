import type { NextApiResponse } from 'next'
import { apiWrapperV2, methodRouter, type ApiV2Request, createRateLimiter } from 'lib/api/v2'

/**
 * Test endpoint for rate limiting
 * Limited to 5 requests per 60 seconds for testing
 *
 * GET /api/v2/test/rate-limit
 */
export default apiWrapperV2(
  methodRouter({
    GET: handleGet,
  }),
  {
    withAuth: false,
    withRateLimit: true,
    rateLimit: {
      customLimit: {
        requests: 5,
        window: 60,
      },
    },
  }
)

async function handleGet(req: ApiV2Request, res: NextApiResponse) {
  res.status(200).json({
    message: 'Rate limit test successful',
    timestamp: new Date().toISOString(),
    rateLimitInfo: {
      limit: res.getHeader('RateLimit-Limit'),
      remaining: res.getHeader('RateLimit-Remaining'),
      reset: res.getHeader('RateLimit-Reset'),
    },
    instructions: 'Make more than 5 requests within 60 seconds to trigger rate limiting',
  })
}
