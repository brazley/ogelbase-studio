import type { NextApiResponse } from 'next'
import { authenticatedApiV2, methodRouter, type ApiV2Request } from 'lib/api/v2'
import { getDatabaseConfig } from 'lib/api/platform/mongodb-helpers'
import { validateCollectionName, validateDatabaseName } from 'lib/api/platform/mongodb-validation'
import { Tier } from 'lib/api/platform/connection-manager'
import { ValidationFailedError } from 'lib/api/v2/errorHandler'
import { MongoClient } from 'mongodb'

/**
 * MongoDB Collection Stats API
 *
 * GET /api/v2/mongodb/[databaseId]/collections/[name]/stats?database=mydb
 */
export default authenticatedApiV2(
  methodRouter({
    GET: handleGetCollectionStats,
  })
)

/**
 * Get collection statistics
 */
async function handleGetCollectionStats(req: ApiV2Request, res: NextApiResponse) {
  const { databaseId, name, database } = req.query as {
    databaseId: string
    name: string
    database?: string
  }

  if (!database) {
    throw new ValidationFailedError('database parameter is required')
  }

  // Validate names
  validateDatabaseName(database as string)
  validateCollectionName(name)

  // Get database config
  const dbConfig = await getDatabaseConfig(databaseId, req.user?.id)

  // Create direct MongoDB client
  const client = new MongoClient(dbConfig.connection_string)

  try {
    await client.connect()
    const db = client.db(database as string)

    // Get collection stats using collStats command
    const stats = await db.command({ collStats: name })

    // Format stats for response
    res.status(200).json({
      collection: name,
      database: database,
      namespace: stats.ns,
      count: stats.count || 0,
      size: stats.size || 0,
      avgObjSize: stats.avgObjSize || 0,
      storageSize: stats.storageSize || 0,
      nindexes: stats.nindexes || 0,
      totalIndexSize: stats.totalIndexSize || 0,
      indexSizes: stats.indexSizes || {},
      capped: stats.capped || false,
      ...(stats.max && { maxDocuments: stats.max }),
      ...(stats.maxSize && { maxSize: stats.maxSize }),
    })
  } finally {
    await client.close()
  }
}
