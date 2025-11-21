import { queryPlatformDatabase } from './database'
import { NotFoundError } from '../v2/errorHandler'
import { Tier } from './connection-manager'

/**
 * Database row type from platform.databases table
 */
export type DatabaseRow = {
  id: string
  project_id: string
  name: string
  type: 'redis' | 'postgresql' | 'mongodb'
  connection_string: string
  host: string
  port: number
  database?: string
  username?: string
  password?: string
  ssl_enabled: boolean
  created_at: string
  updated_at: string
  status: 'active' | 'inactive' | 'error'
  metadata?: Record<string, unknown>
}

/**
 * Get a single database configuration by ID
 */
export async function getDatabaseConfig(databaseId: string): Promise<DatabaseRow> {
  const result = await queryPlatformDatabase<DatabaseRow>({
    query: `SELECT * FROM platform.databases WHERE id = $1`,
    parameters: [databaseId],
  })

  if (result.error) {
    throw result.error
  }

  if (!result.data || result.data.length === 0) {
    throw new NotFoundError(`Database with id ${databaseId} not found`)
  }

  return result.data[0]
}

/**
 * Get all databases for a project
 */
export async function getDatabasesByProject(projectId: string): Promise<DatabaseRow[]> {
  const result = await queryPlatformDatabase<DatabaseRow>({
    query: `SELECT * FROM platform.databases WHERE project_id = $1 ORDER BY created_at DESC`,
    parameters: [projectId],
  })

  if (result.error) {
    throw result.error
  }

  return result.data || []
}

/**
 * Create a new database connection
 */
export async function createDatabase(
  projectId: string,
  data: {
    name: string
    type: 'redis' | 'postgresql' | 'mongodb'
    connection_string: string
    host: string
    port: number
    database?: string
    username?: string
    password?: string
    ssl_enabled?: boolean
    metadata?: Record<string, unknown>
  }
): Promise<DatabaseRow> {
  const result = await queryPlatformDatabase<DatabaseRow>({
    query: `
      INSERT INTO platform.databases (
        project_id, name, type, connection_string, host, port,
        database, username, password, ssl_enabled, metadata, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
      RETURNING *
    `,
    parameters: [
      projectId,
      data.name,
      data.type,
      data.connection_string,
      data.host,
      data.port,
      data.database || null,
      data.username || null,
      data.password || null,
      data.ssl_enabled ?? false,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ],
  })

  if (result.error) {
    throw result.error
  }

  if (!result.data || result.data.length === 0) {
    throw new Error('Failed to create database connection')
  }

  return result.data[0]
}

/**
 * Update a database connection
 */
export async function updateDatabase(
  databaseId: string,
  data: Partial<{
    name: string
    connection_string: string
    host: string
    port: number
    database: string
    username: string
    password: string
    ssl_enabled: boolean
    status: 'active' | 'inactive' | 'error'
    metadata: Record<string, unknown>
  }>
): Promise<DatabaseRow> {
  // Build dynamic update query
  const updates: string[] = []
  const parameters: unknown[] = []
  let paramIndex = 1

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`)
    parameters.push(data.name)
  }
  if (data.connection_string !== undefined) {
    updates.push(`connection_string = $${paramIndex++}`)
    parameters.push(data.connection_string)
  }
  if (data.host !== undefined) {
    updates.push(`host = $${paramIndex++}`)
    parameters.push(data.host)
  }
  if (data.port !== undefined) {
    updates.push(`port = $${paramIndex++}`)
    parameters.push(data.port)
  }
  if (data.database !== undefined) {
    updates.push(`database = $${paramIndex++}`)
    parameters.push(data.database)
  }
  if (data.username !== undefined) {
    updates.push(`username = $${paramIndex++}`)
    parameters.push(data.username)
  }
  if (data.password !== undefined) {
    updates.push(`password = $${paramIndex++}`)
    parameters.push(data.password)
  }
  if (data.ssl_enabled !== undefined) {
    updates.push(`ssl_enabled = $${paramIndex++}`)
    parameters.push(data.ssl_enabled)
  }
  if (data.status !== undefined) {
    updates.push(`status = $${paramIndex++}`)
    parameters.push(data.status)
  }
  if (data.metadata !== undefined) {
    updates.push(`metadata = $${paramIndex++}`)
    parameters.push(JSON.stringify(data.metadata))
  }

  if (updates.length === 0) {
    throw new Error('No fields to update')
  }

  updates.push(`updated_at = NOW()`)
  parameters.push(databaseId)

  const result = await queryPlatformDatabase<DatabaseRow>({
    query: `
      UPDATE platform.databases
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `,
    parameters,
  })

  if (result.error) {
    throw result.error
  }

  if (!result.data || result.data.length === 0) {
    throw new NotFoundError(`Database with id ${databaseId} not found`)
  }

  return result.data[0]
}

/**
 * Delete a database connection
 */
export async function deleteDatabase(databaseId: string): Promise<void> {
  const result = await queryPlatformDatabase({
    query: `DELETE FROM platform.databases WHERE id = $1 RETURNING id`,
    parameters: [databaseId],
  })

  if (result.error) {
    throw result.error
  }

  if (!result.data || result.data.length === 0) {
    throw new NotFoundError(`Database with id ${databaseId} not found`)
  }
}

/**
 * Test a database connection
 */
export async function testDatabaseConnection(
  connectionString: string,
  type: 'redis' | 'postgresql' | 'mongodb'
): Promise<{ success: boolean; message: string; latency?: number }> {
  const startTime = Date.now()

  try {
    if (type === 'redis') {
      // Dynamically import Redis client
      const { createRedisClient } = await import('./redis')
      const client = createRedisClient('test', {
        connectionString,
        tier: Tier.FREE,
      })

      await client.ping()
      await client.close()

      const latency = Date.now() - startTime
      return {
        success: true,
        message: 'Redis connection successful',
        latency,
      }
    }

    // Add PostgreSQL and MongoDB support later
    return {
      success: false,
      message: `Connection testing for ${type} not yet implemented`,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
    }
  }
}
