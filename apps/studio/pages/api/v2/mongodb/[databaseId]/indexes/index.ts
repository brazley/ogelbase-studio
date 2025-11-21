import type { NextApiResponse } from 'next'
import { authenticatedApiV2, methodRouter, type ApiV2Request } from 'lib/api/v2'
import { getDatabaseConfig } from 'lib/api/platform/mongodb-helpers'
import { validateCollectionName, validateDatabaseName } from 'lib/api/platform/mongodb-validation'
import { ValidationFailedError, BadRequestError } from 'lib/api/v2/errorHandler'
import { MongoClient } from 'mongodb'

/**
 * MongoDB Indexes API
 *
 * GET  /api/v2/mongodb/[databaseId]/indexes?database=mydb&collection=users
 * POST /api/v2/mongodb/[databaseId]/indexes - Create an index
 */
export default authenticatedApiV2(
  methodRouter({
    GET: handleListIndexes,
    POST: handleCreateIndex,
  })
)

/**
 * List all indexes on a collection
 */
async function handleListIndexes(req: ApiV2Request, res: NextApiResponse) {
  const { databaseId, database, collection } = req.query as {
    databaseId: string
    database?: string
    collection?: string
  }

  if (!database) {
    throw new ValidationFailedError('database parameter is required')
  }

  if (!collection) {
    throw new ValidationFailedError('collection parameter is required')
  }

  // Validate names
  validateDatabaseName(database as string)
  validateCollectionName(collection as string)

  // Get database config
  const dbConfig = await getDatabaseConfig(databaseId, req.user?.id)

  // Create direct MongoDB client
  const client = new MongoClient(dbConfig.connection_string)

  try {
    await client.connect()
    const db = client.db(database as string)
    const col = db.collection(collection as string)

    // List all indexes
    const indexes = await col.listIndexes().toArray()

    res.status(200).json({
      database,
      collection,
      indexes: indexes.map((idx) => ({
        name: idx.name,
        key: idx.key,
        unique: idx.unique || false,
        sparse: idx.sparse || false,
        background: idx.background || false,
        v: idx.v,
        ...(idx.expireAfterSeconds !== undefined && {
          expireAfterSeconds: idx.expireAfterSeconds,
        }),
        ...(idx.partialFilterExpression && {
          partialFilterExpression: idx.partialFilterExpression,
        }),
      })),
      count: indexes.length,
    })
  } finally {
    await client.close()
  }
}

/**
 * Create a new index
 */
async function handleCreateIndex(req: ApiV2Request, res: NextApiResponse) {
  const { databaseId } = req.query as { databaseId: string }
  const { database, collection, key, options = {} } = req.body

  if (!database) {
    throw new ValidationFailedError('database is required')
  }

  if (!collection) {
    throw new ValidationFailedError('collection is required')
  }

  if (!key) {
    throw new ValidationFailedError('key (index specification) is required')
  }

  // Validate names
  validateDatabaseName(database)
  validateCollectionName(collection)

  // Validate key specification
  if (typeof key !== 'object' || Array.isArray(key)) {
    throw new ValidationFailedError('key must be an object')
  }

  if (Object.keys(key).length === 0) {
    throw new ValidationFailedError('key cannot be empty')
  }

  // Validate index values are 1, -1, or 'text'
  for (const [field, value] of Object.entries(key)) {
    if (value !== 1 && value !== -1 && value !== 'text' && value !== '2d' && value !== '2dsphere') {
      throw new BadRequestError(
        `Invalid index type for field "${field}". Must be 1, -1, 'text', '2d', or '2dsphere'`
      )
    }
  }

  // Get database config
  const dbConfig = await getDatabaseConfig(databaseId, req.user?.id)

  // Create direct MongoDB client
  const client = new MongoClient(dbConfig.connection_string)

  try {
    await client.connect()
    const db = client.db(database)
    const col = db.collection(collection)

    // Build index options
    const indexOptions: any = {}

    // Common options
    if (options.unique === true) indexOptions.unique = true
    if (options.sparse === true) indexOptions.sparse = true
    if (options.background === true) indexOptions.background = true
    if (options.name) indexOptions.name = options.name

    // TTL index
    if (options.expireAfterSeconds !== undefined) {
      indexOptions.expireAfterSeconds = parseInt(options.expireAfterSeconds, 10)
    }

    // Partial filter
    if (options.partialFilterExpression) {
      indexOptions.partialFilterExpression = options.partialFilterExpression
    }

    // Create index
    const indexName = await col.createIndex(key, indexOptions)

    res.status(201).json({
      success: true,
      indexName,
      database,
      collection,
      key,
      options: indexOptions,
    })
  } finally {
    await client.close()
  }
}
