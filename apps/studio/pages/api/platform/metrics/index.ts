import { NextApiRequest, NextApiResponse } from 'next'
import { register } from 'lib/observability/metrics'

/**
 * Prometheus metrics endpoint
 * Exposes metrics in Prometheus format for scraping
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({
      error: 'Method not allowed',
    })
  }

  try {
    // Set content type for Prometheus
    res.setHeader('Content-Type', register.contentType)

    // Get metrics in Prometheus format
    const metrics = await register.metrics()

    return res.status(200).send(metrics)
  } catch (error) {
    console.error('[Metrics] Error generating metrics:', error)
    return res.status(500).json({
      error: 'Failed to generate metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
