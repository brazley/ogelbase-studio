import type { NextApiResponse } from 'next'
import { publicApiV2, methodRouter, type ApiV2Request } from 'lib/api/v2'

/**
 * Test endpoint for API v2
 * Demonstrates basic v2 wrapper usage
 *
 * GET /api/v2/test
 */
export default publicApiV2(
  methodRouter({
    GET: handleGet,
  })
)

async function handleGet(req: ApiV2Request, res: NextApiResponse) {
  res.status(200).json({
    message: 'API v2 is working!',
    version: req.apiVersion,
    timestamp: new Date().toISOString(),
    headers: {
      version: req.headers['api-version'] || req.headers['x-api-version'],
      userAgent: req.headers['user-agent'],
    },
  })
}
