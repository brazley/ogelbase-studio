import { BadRequestError } from '../v2/errorHandler'

/**
 * Allowed aggregation pipeline stages
 */
const ALLOWED_STAGES = [
  '$match',
  '$project',
  '$limit',
  '$skip',
  '$sort',
  '$group',
  '$unwind',
  '$lookup',
  '$addFields',
  '$count',
  '$sample',
  '$replaceRoot',
  '$facet',
  '$bucket',
  '$bucketAuto',
  '$sortByCount',
  '$geoNear',
  '$graphLookup',
  '$redact',
  '$unionWith',
]

/**
 * Forbidden aggregation pipeline stages (security risk)
 */
const FORBIDDEN_STAGES = [
  '$out', // Writes to collection
  '$merge', // Merges with collection
  '$where', // Arbitrary JavaScript execution
  '$function', // Custom JavaScript functions
  '$accumulator', // Custom accumulators with JavaScript
]

/**
 * Maximum pipeline complexity (prevents DoS)
 */
const MAX_PIPELINE_STAGES = 20
const MAX_PIPELINE_DEPTH = 5 // For nested pipelines in $lookup, $facet, etc.

/**
 * Validate MongoDB aggregation pipeline
 *
 * Ensures that the pipeline:
 * - Only uses allowed stages
 * - Does not use forbidden stages
 * - Does not exceed complexity limits
 *
 * @param pipeline - MongoDB aggregation pipeline
 * @throws BadRequestError if validation fails
 */
export function validateAggregationPipeline(pipeline: any[]): void {
  if (!Array.isArray(pipeline)) {
    throw new BadRequestError('Pipeline must be an array')
  }

  if (pipeline.length === 0) {
    throw new BadRequestError('Pipeline cannot be empty')
  }

  if (pipeline.length > MAX_PIPELINE_STAGES) {
    throw new BadRequestError(
      `Pipeline cannot exceed ${MAX_PIPELINE_STAGES} stages (found ${pipeline.length})`
    )
  }

  // Validate each stage
  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i]

    if (typeof stage !== 'object' || stage === null) {
      throw new BadRequestError(`Pipeline stage ${i} must be an object`)
    }

    const stageNames = Object.keys(stage)

    if (stageNames.length === 0) {
      throw new BadRequestError(`Pipeline stage ${i} is empty`)
    }

    if (stageNames.length > 1) {
      throw new BadRequestError(
        `Pipeline stage ${i} has multiple operators: ${stageNames.join(', ')}`
      )
    }

    const stageName = stageNames[0]

    // Check for forbidden stages
    if (FORBIDDEN_STAGES.includes(stageName)) {
      throw new BadRequestError(`Stage "${stageName}" is not allowed for security reasons`)
    }

    // Check for unknown stages
    if (!ALLOWED_STAGES.includes(stageName)) {
      throw new BadRequestError(`Unknown or disallowed stage "${stageName}" at position ${i}`)
    }

    // Validate nested pipelines
    validateNestedPipeline(stage[stageName], stageName, 1)
  }
}

/**
 * Validate nested pipelines in stages like $lookup, $facet, $unionWith
 *
 * @param stageValue - The value of the stage
 * @param stageName - Name of the parent stage
 * @param depth - Current nesting depth
 */
function validateNestedPipeline(stageValue: any, stageName: string, depth: number): void {
  if (depth > MAX_PIPELINE_DEPTH) {
    throw new BadRequestError(`Pipeline nesting too deep (max ${MAX_PIPELINE_DEPTH} levels)`)
  }

  // Check $lookup pipeline
  if (stageName === '$lookup' && stageValue?.pipeline) {
    if (!Array.isArray(stageValue.pipeline)) {
      throw new BadRequestError('$lookup pipeline must be an array')
    }
    validatePipelineStages(stageValue.pipeline, depth)
  }

  // Check $facet pipelines
  if (stageName === '$facet') {
    for (const key in stageValue) {
      if (Array.isArray(stageValue[key])) {
        validatePipelineStages(stageValue[key], depth)
      }
    }
  }

  // Check $unionWith pipeline
  if (stageName === '$unionWith' && stageValue?.pipeline) {
    if (!Array.isArray(stageValue.pipeline)) {
      throw new BadRequestError('$unionWith pipeline must be an array')
    }
    validatePipelineStages(stageValue.pipeline, depth)
  }
}

/**
 * Validate pipeline stages at a given depth
 */
function validatePipelineStages(pipeline: any[], depth: number): void {
  for (const stage of pipeline) {
    const stageNames = Object.keys(stage)
    const stageName = stageNames[0]

    if (FORBIDDEN_STAGES.includes(stageName)) {
      throw new BadRequestError(`Stage "${stageName}" is not allowed for security reasons`)
    }

    if (!ALLOWED_STAGES.includes(stageName)) {
      throw new BadRequestError(`Unknown or disallowed stage "${stageName}"`)
    }

    validateNestedPipeline(stage[stageName], stageName, depth + 1)
  }
}

/**
 * Validate MongoDB filter object
 *
 * Ensures that the filter:
 * - Does not use $where operator
 * - Does not contain executable code
 *
 * @param filter - MongoDB filter object
 * @throws BadRequestError if validation fails
 */
export function validateFilter(filter: any): void {
  if (typeof filter !== 'object' || filter === null) {
    throw new BadRequestError('Filter must be an object')
  }

  // Recursively check for dangerous operators
  checkFilterSafety(filter)
}

/**
 * Recursively check filter for dangerous operators
 */
function checkFilterSafety(obj: any): void {
  if (typeof obj !== 'object' || obj === null) {
    return
  }

  for (const key in obj) {
    // Forbidden operators
    if (key === '$where') {
      throw new BadRequestError('$where operator is not allowed for security reasons')
    }

    if (key === '$function') {
      throw new BadRequestError('$function operator is not allowed for security reasons')
    }

    // Recursively check nested objects
    if (typeof obj[key] === 'object') {
      checkFilterSafety(obj[key])
    }
  }
}

/**
 * Validate collection name
 *
 * @param name - Collection name
 * @throws BadRequestError if validation fails
 */
export function validateCollectionName(name: string): void {
  if (!name || typeof name !== 'string') {
    throw new BadRequestError('Collection name must be a non-empty string')
  }

  if (name.length > 255) {
    throw new BadRequestError('Collection name cannot exceed 255 characters')
  }

  // MongoDB collection name restrictions
  if (name.startsWith('system.')) {
    throw new BadRequestError('Collection name cannot start with "system."')
  }

  if (name.includes('$')) {
    throw new BadRequestError('Collection name cannot contain "$"')
  }

  if (name.includes('\0')) {
    throw new BadRequestError('Collection name cannot contain null characters')
  }
}

/**
 * Validate database name
 *
 * @param name - Database name
 * @throws BadRequestError if validation fails
 */
export function validateDatabaseName(name: string): void {
  if (!name || typeof name !== 'string') {
    throw new BadRequestError('Database name must be a non-empty string')
  }

  if (name.length > 64) {
    throw new BadRequestError('Database name cannot exceed 64 characters')
  }

  // MongoDB database name restrictions
  const invalidChars = /[/\\. "$*<>:|?]/
  if (invalidChars.test(name)) {
    throw new BadRequestError('Database name contains invalid characters')
  }
}

/**
 * Estimate query complexity/cost
 *
 * Returns a rough estimate of query complexity:
 * - Simple queries: < 10
 * - Moderate queries: 10-50
 * - Complex queries: 50-100
 * - Very complex queries: > 100
 *
 * @param pipeline - Aggregation pipeline
 * @returns Complexity score
 */
export function estimateQueryCost(pipeline: any[]): number {
  let cost = 0

  for (const stage of pipeline) {
    const stageName = Object.keys(stage)[0]
    const stageValue = stage[stageName]

    // Base cost per stage
    cost += 5

    // Additional costs for expensive operations
    switch (stageName) {
      case '$lookup':
        cost += 20 // Expensive join operation
        if (stageValue.pipeline) {
          cost += estimateQueryCost(stageValue.pipeline) * 2
        }
        break
      case '$graphLookup':
        cost += 30 // Very expensive recursive operation
        break
      case '$facet':
        for (const key in stageValue) {
          if (Array.isArray(stageValue[key])) {
            cost += estimateQueryCost(stageValue[key])
          }
        }
        break
      case '$group':
        cost += 10 // Grouping requires memory
        break
      case '$sort':
        cost += 8 // Sorting can be expensive
        break
      case '$sample':
        cost += 15 // Random sampling is expensive
        break
      case '$geoNear':
        cost += 12 // Geospatial queries
        break
      case '$match':
        // Match at the beginning is good (reduces data)
        if (pipeline.indexOf(stage) === 0) {
          cost -= 3
        }
        break
      case '$limit':
        // Limit early is good
        cost -= 2
        break
    }
  }

  return cost
}
