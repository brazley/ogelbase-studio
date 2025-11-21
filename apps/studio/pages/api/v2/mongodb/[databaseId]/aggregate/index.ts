import type { NextApiResponse } from 'next'
import { authenticatedApiV2, methodRouter, type ApiV2Request } from 'lib/api/v2'
import { getDatabaseConfig } from 'lib/api/platform/mongodb-helpers'
import {
  validateCollectionName,
  validateDatabaseName,
  validateAggregationPipeline,
  estimateQueryCost,
} from 'lib/api/platform/mongodb-validation'
import { ValidationFailedError, BadRequestError } from 'lib/api/v2/errorHandler'
import { MongoClient } from 'mongodb'

/**
 * MongoDB Aggregation API
 *
 * POST /api/v2/mongodb/[databaseId]/aggregate
 * Body: { database, collection, pipeline: [...] }
 */
export default authenticatedApiV2(
  methodRouter({
    POST: handleAggregate,
  })
)

/**
 * Maximum query cost allowed (prevents DoS)
 */
const MAX_QUERY_COST = 150

/**
 * Execute aggregation pipeline
 */
async function handleAggregate(req: ApiV2Request, res: NextApiResponse) {
  const { databaseId } = req.query as { databaseId: string }
  const { database, collection, pipeline, options = {} } = req.body

  if (!database) {
    throw new ValidationFailedError('database is required')
  }

  if (!collection) {
    throw new ValidationFailedError('collection is required')
  }

  if (!pipeline) {
    throw new ValidationFailedError('pipeline is required')
  }

  if (!Array.isArray(pipeline)) {
    throw new ValidationFailedError('pipeline must be an array')
  }

  // Validate names
  validateDatabaseName(database)
  validateCollectionName(collection)

  // Validate and estimate pipeline cost
  validateAggregationPipeline(pipeline)
  const cost = estimateQueryCost(pipeline)

  if (cost > MAX_QUERY_COST) {
    throw new BadRequestError(
      `Aggregation pipeline is too complex (cost: ${cost}, max: ${MAX_QUERY_COST}). ` +
        'Please simplify your query or add more $match/$limit stages at the beginning.'
    )
  }

  // Get database config
  const dbConfig = await getDatabaseConfig(databaseId, req.user?.id)

  // Create direct MongoDB client
  const client = new MongoClient(dbConfig.connection_string)

  try {
    await client.connect()
    const db = client.db(database)
    const col = db.collection(collection)

    // Execute aggregation with optional settings
    const aggregationOptions: any = {}

    // Optional: Set timeout
    if (options.maxTimeMS) {
      aggregationOptions.maxTimeMS = Math.min(options.maxTimeMS, 30000) // Max 30s
    } else {
      aggregationOptions.maxTimeMS = 10000 // Default 10s
    }

    // Optional: Allow disk use for large operations
    if (options.allowDiskUse === true) {
      aggregationOptions.allowDiskUse = true
    }

    // Execute aggregation
    const startTime = Date.now()
    const results = await col.aggregate(pipeline, aggregationOptions).toArray()
    const duration = Date.now() - startTime

    res.status(200).json({
      database,
      collection,
      data: results,
      count: results.length,
      meta: {
        pipelineStages: pipeline.length,
        estimatedCost: cost,
        executionTimeMs: duration,
      },
    })
  } finally {
    await client.close()
  }
}
