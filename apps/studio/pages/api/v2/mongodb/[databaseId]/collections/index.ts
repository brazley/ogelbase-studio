import type { NextApiResponse } from 'next'
import { authenticatedApiV2, methodRouter, type ApiV2Request } from 'lib/api/v2'
import { createMongoDBClientForDatabase, getDatabaseConfig } from 'lib/api/platform/mongodb-helpers'
import { validateCollectionName, validateDatabaseName } from 'lib/api/platform/mongodb-validation'
import { Tier } from 'lib/api/platform/connection-manager'
import { ValidationFailedError } from 'lib/api/v2/errorHandler'
import { MongoClient } from 'mongodb'

/**
 * MongoDB Collections API
 *
 * GET  /api/v2/mongodb/[databaseId]/collections?database=mydb - List collections in database
 * POST /api/v2/mongodb/[databaseId]/collections - Create a new collection
 */
export default authenticatedApiV2(
  methodRouter({
    GET: handleListCollections,
    POST: handleCreateCollection,
  })
)

/**
 * List all collections in a database
 */
async function handleListCollections(req: ApiV2Request, res: NextApiResponse) {
  const { databaseId, database } = req.query as { databaseId: string; database?: string }
  const tier = (req.user?.tier as Tier) || Tier.FREE

  if (!database) {
    throw new ValidationFailedError('database parameter is required')
  }

  validateDatabaseName(database as string)

  // Get database config
  const dbConfig = await getDatabaseConfig(databaseId, req.user?.id)

  // Create direct MongoDB client to access specific database
  const client = new MongoClient(dbConfig.connection_string)

  try {
    await client.connect()
    const db = client.db(database as string)

    // List all collections
    const collections = await db.listCollections().toArray()

    res.status(200).json({
      database: database,
      collections: collections.map((col) => ({
        name: col.name,
        type: col.type,
        options: 'options' in col ? col.options : undefined,
        info: 'info' in col ? col.info : undefined,
      })),
      count: collections.length,
    })
  } finally {
    await client.close()
  }
}

/**
 * Create a new collection
 */
async function handleCreateCollection(req: ApiV2Request, res: NextApiResponse) {
  const { databaseId } = req.query as { databaseId: string }
  const { database, collection, options } = req.body
  const tier = (req.user?.tier as Tier) || Tier.FREE

  if (!database) {
    throw new ValidationFailedError('database is required')
  }

  if (!collection) {
    throw new ValidationFailedError('collection name is required')
  }

  // Validate names
  validateDatabaseName(database)
  validateCollectionName(collection)

  // Get database config
  const dbConfig = await getDatabaseConfig(databaseId, req.user?.id)

  // Create direct MongoDB client to access specific database
  const client = new MongoClient(dbConfig.connection_string)

  try {
    await client.connect()
    const db = client.db(database)

    // Create collection with optional configuration
    const collectionOptions: any = {}

    if (options?.capped) {
      collectionOptions.capped = true
      if (options.size) collectionOptions.size = options.size
      if (options.max) collectionOptions.max = options.max
    }

    await db.createCollection(collection, collectionOptions)

    res.status(201).json({
      success: true,
      message: `Collection "${collection}" created successfully`,
      database,
      collection,
      options: collectionOptions,
    })
  } finally {
    await client.close()
  }
}
