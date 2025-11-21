import { queryPlatformDatabase } from './database'
import { NotFoundError, ForbiddenError } from '../v2/errorHandler'
import { createMongoDBClient, MongoDBClientWrapper } from './mongodb'
import { Tier } from './connection-manager'

/**
 * Database configuration from platform
 */
export type DatabaseConfig = {
  id: string
  project_id: string
  name: string
  type: string
  connection_string: string
  config: Record<string, any>
  status: string
}

/**
 * Get database configuration by ID
 *
 * @param databaseId - Database UUID
 * @param userId - User ID for authorization
 * @returns Database configuration
 */
export async function getDatabaseConfig(
  databaseId: string,
  userId?: string
): Promise<DatabaseConfig> {
  const result = await queryPlatformDatabase<DatabaseConfig>({
    query: `
      SELECT
        d.id,
        d.project_id,
        d.name,
        d.type,
        d.connection_string,
        d.config,
        d.status
      FROM platform.databases d
      WHERE d.id = $1
        AND d.type = 'mongodb'
        AND d.status = 'active'
    `,
    parameters: [databaseId],
  })

  if (result.error) {
    throw result.error
  }

  if (!result.data || result.data.length === 0) {
    throw new NotFoundError('database')
  }

  const database = result.data[0]

  // Optional: Check user has access to this project
  if (userId) {
    const accessResult = await queryPlatformDatabase<{ has_access: boolean }>({
      query: `
        SELECT EXISTS (
          SELECT 1
          FROM platform.projects p
          WHERE p.id = $1
        ) as has_access
      `,
      parameters: [database.project_id],
    })

    if (accessResult.error || !accessResult.data?.[0]?.has_access) {
      throw new ForbiddenError('You do not have access to this database')
    }
  }

  return database
}

/**
 * Create MongoDB client for a database
 *
 * @param databaseId - Database UUID
 * @param tier - User tier for connection limits
 * @returns MongoDB client wrapper
 */
export async function createMongoDBClientForDatabase(
  databaseId: string,
  tier: Tier = Tier.FREE,
  userId?: string
): Promise<MongoDBClientWrapper> {
  const dbConfig = await getDatabaseConfig(databaseId, userId)

  return createMongoDBClient(databaseId, {
    connectionString: dbConfig.connection_string,
    tier,
    config: {
      minPoolSize: dbConfig.config?.minPoolSize || 2,
      maxPoolSize: dbConfig.config?.maxPoolSize || 10,
    },
  })
}
