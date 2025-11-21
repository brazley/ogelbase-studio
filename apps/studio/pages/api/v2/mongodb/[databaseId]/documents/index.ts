import type { NextApiResponse } from 'next'
import { authenticatedApiV2, methodRouter, type ApiV2Request } from 'lib/api/v2'
import { getDatabaseConfig } from 'lib/api/platform/mongodb-helpers'
import {
  validateCollectionName,
  validateDatabaseName,
  validateFilter,
} from 'lib/api/platform/mongodb-validation'
import { ValidationFailedError, BadRequestError } from 'lib/api/v2/errorHandler'
import { MongoClient, ObjectId } from 'mongodb'
import { encodeCursor, decodeCursor, DEFAULT_LIMIT, MAX_LIMIT } from 'lib/api/v2/pagination'

/**
 * MongoDB Documents API
 *
 * GET  /api/v2/mongodb/[databaseId]/documents?database=mydb&collection=users&filter={}&cursor=abc&limit=100
 * POST /api/v2/mongodb/[databaseId]/documents - Insert a document
 */
export default authenticatedApiV2(
  methodRouter({
    GET: handleQueryDocuments,
    POST: handleInsertDocument,
  })
)

/**
 * Query documents with cursor-based pagination
 */
async function handleQueryDocuments(req: ApiV2Request, res: NextApiResponse) {
  const {
    databaseId,
    database,
    collection,
    filter = '{}',
    cursor,
    limit = DEFAULT_LIMIT,
  } = req.query as {
    databaseId: string
    database?: string
    collection?: string
    filter?: string
    cursor?: string
    limit?: string
  }

  if (!database) {
    throw new ValidationFailedError('database parameter is required')
  }

  if (!collection) {
    throw new ValidationFailedError('collection parameter is required')
  }

  // Validate names
  validateDatabaseName(database)
  validateCollectionName(collection)

  // Parse and validate filter
  let filterObj: any
  try {
    filterObj = JSON.parse(filter)
  } catch (e) {
    throw new BadRequestError('Invalid JSON filter')
  }

  validateFilter(filterObj)

  // Parse limit
  const parsedLimit = Math.min(parseInt(limit as string, 10) || DEFAULT_LIMIT, MAX_LIMIT)

  // Get database config
  const dbConfig = await getDatabaseConfig(databaseId, req.user?.id)

  // Create direct MongoDB client
  const client = new MongoClient(dbConfig.connection_string)

  try {
    await client.connect()
    const db = client.db(database)
    const col = db.collection(collection)

    // Add cursor to filter if provided
    if (cursor) {
      try {
        const decodedCursor = decodeCursor(cursor)
        filterObj._id = { $gt: new ObjectId(decodedCursor) }
      } catch (e) {
        throw new BadRequestError('Invalid cursor format')
      }
    }

    // Fetch limit + 1 to check if there are more results
    const documents = await col
      .find(filterObj)
      .sort({ _id: 1 })
      .limit(parsedLimit + 1)
      .toArray()

    // Determine if there are more results
    const hasMore = documents.length > parsedLimit

    // Trim results to limit
    const data = hasMore ? documents.slice(0, parsedLimit) : documents

    // Generate next cursor from the last item
    let nextCursor: string | undefined
    if (hasMore && data.length > 0) {
      const lastItem = data[data.length - 1]
      nextCursor = encodeCursor(lastItem._id.toString())
    }

    res.status(200).json({
      database,
      collection,
      data,
      cursor: nextCursor,
      hasMore,
      count: data.length,
    })
  } finally {
    await client.close()
  }
}

/**
 * Insert a new document
 */
async function handleInsertDocument(req: ApiV2Request, res: NextApiResponse) {
  const { databaseId } = req.query as { databaseId: string }
  const { database, collection, document } = req.body

  if (!database) {
    throw new ValidationFailedError('database is required')
  }

  if (!collection) {
    throw new ValidationFailedError('collection is required')
  }

  if (!document) {
    throw new ValidationFailedError('document is required')
  }

  // Validate names
  validateDatabaseName(database)
  validateCollectionName(collection)

  if (typeof document !== 'object' || Array.isArray(document)) {
    throw new ValidationFailedError('document must be an object')
  }

  // Get database config
  const dbConfig = await getDatabaseConfig(databaseId, req.user?.id)

  // Create direct MongoDB client
  const client = new MongoClient(dbConfig.connection_string)

  try {
    await client.connect()
    const db = client.db(database)
    const col = db.collection(collection)

    // Insert document
    const result = await col.insertOne(document)

    res.status(201).json({
      success: true,
      insertedId: result.insertedId,
      database,
      collection,
    })
  } finally {
    await client.close()
  }
}
