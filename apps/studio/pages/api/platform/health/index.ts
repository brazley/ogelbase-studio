import { NextApiRequest, NextApiResponse } from 'next'
import { Pool } from 'pg'

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  version: string
  services: {
    postgres?: {
      status: 'healthy' | 'unhealthy'
      responseTime?: number
      error?: string
    }
    platform?: {
      status: 'healthy' | 'unhealthy'
      error?: string
    }
  }
  metrics: {
    memory: {
      used: number
      total: number
      percentage: number
    }
    process: {
      uptime: number
      pid: number
    }
  }
}

/**
 * Check PostgreSQL connection health
 */
async function checkPostgres(): Promise<{
  status: 'healthy' | 'unhealthy'
  responseTime?: number
  error?: string
}> {
  const connectionString = process.env.PLATFORM_DATABASE_URL

  if (!connectionString) {
    return {
      status: 'unhealthy',
      error: 'PLATFORM_DATABASE_URL not configured',
    }
  }

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
    max: 1,
  })

  try {
    const start = Date.now()
    const result = await pool.query('SELECT 1 as health_check')
    const responseTime = Date.now() - start

    await pool.end()

    if (result.rows[0]?.health_check === 1) {
      return { status: 'healthy', responseTime }
    }

    return { status: 'unhealthy', error: 'Unexpected query result' }
  } catch (error) {
    await pool.end()
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check platform services
 */
async function checkPlatformServices(): Promise<{
  status: 'healthy' | 'unhealthy'
  error?: string
}> {
  const isPlatform = process.env.NEXT_PUBLIC_PLATFORM === 'true'

  if (!isPlatform) {
    return { status: 'unhealthy', error: 'Platform mode not enabled' }
  }

  // Check if required platform environment variables are set
  const requiredEnvVars = ['PLATFORM_DATABASE_URL', 'PLATFORM_JWT_SECRET']

  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar])

  if (missingEnvVars.length > 0) {
    return {
      status: 'unhealthy',
      error: `Missing environment variables: ${missingEnvVars.join(', ')}`,
    }
  }

  return { status: 'healthy' }
}

/**
 * Health check endpoint handler
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthCheckResult>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '0.0.9',
      services: {},
      metrics: {
        memory: {
          used: 0,
          total: 0,
          percentage: 0,
        },
        process: {
          uptime: process.uptime(),
          pid: process.pid,
        },
      },
    })
  }

  try {
    // Run health checks in parallel
    const [postgresHealth, platformHealth] = await Promise.all([
      checkPostgres(),
      checkPlatformServices(),
    ])

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

    if (postgresHealth.status === 'unhealthy' || platformHealth.status === 'unhealthy') {
      // If any critical service is unhealthy, overall status is unhealthy
      overallStatus = 'unhealthy'
    }

    // Get memory metrics
    const memoryUsage = process.memoryUsage()
    const totalMemory = memoryUsage.heapTotal
    const usedMemory = memoryUsage.heapUsed
    const memoryPercentage = (usedMemory / totalMemory) * 100

    const healthCheck: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '0.0.9',
      services: {
        postgres: postgresHealth,
        platform: platformHealth,
      },
      metrics: {
        memory: {
          used: Math.round(usedMemory / 1024 / 1024), // MB
          total: Math.round(totalMemory / 1024 / 1024), // MB
          percentage: Math.round(memoryPercentage * 100) / 100,
        },
        process: {
          uptime: Math.round(process.uptime()),
          pid: process.pid,
        },
      },
    }

    // Return appropriate status code
    const statusCode = overallStatus === 'unhealthy' ? 503 : 200

    return res.status(statusCode).json(healthCheck)
  } catch (error) {
    const healthCheck: HealthCheckResult = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '0.0.9',
      services: {
        platform: {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      metrics: {
        memory: {
          used: 0,
          total: 0,
          percentage: 0,
        },
        process: {
          uptime: process.uptime(),
          pid: process.pid,
        },
      },
    }

    return res.status(503).json(healthCheck)
  }
}
