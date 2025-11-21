import type { NextApiResponse } from 'next'
import { authenticatedApiV2, methodRouter, type ApiV2Request } from 'lib/api/v2'
import { getDatabaseConfig } from 'lib/api/platform/mongodb-helpers'
import { validateCollectionName, validateDatabaseName } from 'lib/api/platform/mongodb-validation'
import { ValidationFailedError, NotFoundError, BadRequestError } from 'lib/api/v2/errorHandler'
import { MongoClient, ObjectId } from 'mongodb'

/**
 * MongoDB Document Operations API
 *
 * GET    /api/v2/mongodb/[databaseId]/documents/[id]?database=mydb&collection=users
 * PATCH  /api/v2/mongodb/[databaseId]/documents/[id] - Update document
 * DELETE /api/v2/mongodb/[databaseId]/documents/[id] - Delete document
 */
export default authenticatedApiV2(
  methodRouter({
    GET: handleGetDocument,
    PATCH: handleUpdateDocument,
    DELETE: handleDeleteDocument,
  })
)

/**
 * Get a single document by ID
 */
async function handleGetDocument(req: ApiV2Request, res: NextApiResponse) {
  const { databaseId, id, database, collection } = req.query as {
    databaseId: string
    id: string
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

  // Validate ObjectId
  if (!ObjectId.isValid(id)) {
    throw new BadRequestError('Invalid document ID format')
  }

  // Get database config
  const dbConfig = await getDatabaseConfig(databaseId, req.user?.id)

  // Create direct MongoDB client
  const client = new MongoClient(dbConfig.connection_string)

  try {
    await client.connect()
    const db = client.db(database as string)
    const col = db.collection(collection as string)

    // Find document
    const document = await col.findOne({ _id: new ObjectId(id) })

    if (!document) {
      throw new NotFoundError('document')
    }

    res.status(200).json({
      database,
      collection,
      document,
    })
  } finally {
    await client.close()
  }
}

/**
 * Update a document
 */
async function handleUpdateDocument(req: ApiV2Request, res: NextApiResponse) {
  const { databaseId, id } = req.query as { databaseId: string; id: string }
  const { database, collection, update } = req.body

  if (!database) {
    throw new ValidationFailedError('database is required')
  }

  if (!collection) {
    throw new ValidationFailedError('collection is required')
  }

  if (!update) {
    throw new ValidationFailedError('update is required')
  }

  // Validate names
  validateDatabaseName(database)
  validateCollectionName(collection)

  // Validate ObjectId
  if (!ObjectId.isValid(id)) {
    throw new BadRequestError('Invalid document ID format')
  }

  // Validate update object
  if (typeof update !== 'object' || Array.isArray(update)) {
    throw new ValidationFailedError('update must be an object')
  }

  // Ensure update uses MongoDB update operators
  const hasUpdateOperator = Object.keys(update).some((key) => key.startsWith('$'))
  if (!hasUpdateOperator) {
    throw new ValidationFailedError('update must use MongoDB update operators ($set, $unset, $inc, etc.)')
  }

  // Get database config
  const dbConfig = await getDatabaseConfig(databaseId, req.user?.id)

  // Create direct MongoDB client
  const client = new MongoClient(dbConfig.connection_string)

  try {
    await client.connect()
    const db = client.db(database)
    const col = db.collection(collection)

    // Update document
    const result = await col.updateOne({ _id: new ObjectId(id) }, update)

    if (result.matchedCount === 0) {
      throw new NotFoundError('document')
    }

    res.status(200).json({
      success: true,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      database,
      collection,
      id,
    })
  } finally {
    await client.close()
  }
}

/**
 * Delete a document
 */
async function handleDeleteDocument(req: ApiV2Request, res: NextApiResponse) {
  const { databaseId, id, database, collection } = req.query as {
    databaseId: string
    id: string
    database?: string
    collection?: string
  }

  if (!database) {
    throw new ValidationFailedError('database query parameter is required')
  }

  if (!collection) {
    throw new ValidationFailedError('collection query parameter is required')
  }

  // Validate names
  validateDatabaseName(database as string)
  validateCollectionName(collection as string)

  // Validate ObjectId
  if (!ObjectId.isValid(id)) {
    throw new BadRequestError('Invalid document ID format')
  }

  // Get database config
  const dbConfig = await getDatabaseConfig(databaseId, req.user?.id)

  // Create direct MongoDB client
  const client = new MongoClient(dbConfig.connection_string)

  try {
    await client.connect()
    const db = client.db(database as string)
    const col = db.collection(collection as string)

    // Delete document
    const result = await col.deleteOne({ _id: new ObjectId(id) })

    if (result.deletedCount === 0) {
      throw new NotFoundError('document')
    }

    res.status(200).json({
      success: true,
      deletedCount: result.deletedCount,
      database,
      collection,
      id,
    })
  } finally {
    await client.close()
  }
}
