import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

interface InfraMonitoringData {
  timestamp: number
  cpu_usage: number
  memory_usage: number
  disk_io_budget: number
}

const handleGetAll = async (req: NextApiRequest, res: NextApiResponse) => {
  const { ref } = req.query

  if (!ref || typeof ref !== 'string') {
    return res.status(400).json({ error: { message: 'Project ref is required' } })
  }

  // Generate mock monitoring data for visualization
  const now = Date.now()
  const mockData: InfraMonitoringData[] = []

  // Generate data points for the last 24 hours (hourly)
  for (let i = 23; i >= 0; i--) {
    mockData.push({
      timestamp: now - i * 3600000,
      cpu_usage: Math.random() * 40 + 10, // 10-50% CPU usage
      memory_usage: Math.random() * 30 + 20, // 20-50% memory usage
      disk_io_budget: Math.random() * 1000 + 500, // 500-1500 IOPS
    })
  }

  const defaultResponse = {
    data: mockData,
    yAxisLimit: 100,
    format: '%',
    total: mockData.length,
  }

  // If no DATABASE_URL is configured, return mock data
  if (!process.env.DATABASE_URL) {
    return res.status(200).json(defaultResponse)
  }

  // Import queryPlatformDatabase at runtime to avoid circular dependencies
  const { queryPlatformDatabase } = await import('lib/api/platform/database')

  // Try to query platform database for real monitoring data
  const { data, error } = await queryPlatformDatabase<InfraMonitoringData>({
    query: `
      SELECT
        EXTRACT(EPOCH FROM timestamp)::bigint * 1000 as timestamp,
        cpu_usage,
        memory_usage,
        disk_io_budget
      FROM platform.project_metrics
      WHERE project_id = (SELECT id FROM platform.projects WHERE ref = $1)
        AND timestamp > NOW() - INTERVAL '24 hours'
      ORDER BY timestamp DESC
    `,
    parameters: [ref],
  })

  if (error || !data || data.length === 0) {
    // Fall back to mock data if query fails
    return res.status(200).json(defaultResponse)
  }

  const response = {
    data: data,
    yAxisLimit: 100,
    format: '%',
    total: data.length,
  }

  return res.status(200).json(response)
}
