import type { NextApiResponse } from 'next'
import { authenticatedApiV2, methodRouter, type ApiV2Request } from 'lib/api/v2'
import { createMongoDBClientForDatabase } from 'lib/api/platform/mongodb-helpers'
import { validateDatabaseName } from 'lib/api/platform/mongodb-validation'
import { Tier } from 'lib/api/platform/connection-manager'
import { ValidationFailedError } from 'lib/api/v2/errorHandler'

/**
 * MongoDB Databases API
 *
 * GET  /api/v2/mongodb/[databaseId]/databases - List all databases
 * POST /api/v2/mongodb/[databaseId]/databases - Create a new database
 */
export default authenticatedApiV2(
  methodRouter({
    GET: handleListDatabases,
    POST: handleCreateDatabase,
  })
)

/**
 * List all databases in MongoDB instance
 */
async function handleListDatabases(req: ApiV2Request, res: NextApiResponse) {
  const { databaseId } = req.query as { databaseId: string }
  const tier = (req.user?.tier as Tier) || Tier.FREE

  // Create MongoDB client
  const mongo = await createMongoDBClientForDatabase(databaseId, tier, req.user?.id)

  try {
    // List all databases
    const result = await mongo.runCommand({ listDatabases: 1 })

    res.status(200).json({
      databases: result.databases.map((db: any) => ({
        name: db.name,
        sizeOnDisk: db.sizeOnDisk,
        empty: db.empty,
      })),
      totalSize: result.totalSize,
      totalSizeMb: result.totalSizeMb,
    })
  } finally {
    await mongo.close()
  }
}

/**
 * Create a new database
 *
 * Note: MongoDB creates databases implicitly when you insert data
 * This endpoint creates a database by creating an empty collection
 */
async function handleCreateDatabase(req: ApiV2Request, res: NextApiResponse) {
  const { databaseId } = req.query as { databaseId: string }
  const { name } = req.body
  const tier = (req.user?.tier as Tier) || Tier.FREE

  if (!name) {
    throw new ValidationFailedError('Database name is required')
  }

  // Validate database name
  validateDatabaseName(name)

  // Create MongoDB client
  const mongo = await createMongoDBClientForDatabase(databaseId, tier, req.user?.id)

  try {
    // MongoDB doesn't have explicit "CREATE DATABASE" - databases are created when you insert data
    // We'll create a temporary collection to force database creation
    const tempCollection = '__init__'

    // Switch to new database and create a collection
    await mongo.runCommand({
      create: tempCollection,
      // @ts-ignore - MongoDB client doesn't have proper types for this
      $db: name,
    })

    res.status(201).json({
      success: true,
      message: `Database "${name}" created successfully`,
      name,
    })
  } finally {
    await mongo.close()
  }
}
