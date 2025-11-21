import type { PaginatedResponse } from './types'
import { BadRequestError } from './errorHandler'

/**
 * Default pagination limit
 */
export const DEFAULT_LIMIT = 100

/**
 * Maximum pagination limit
 */
export const MAX_LIMIT = 1000

/**
 * Encodes a cursor value to base64
 *
 * @param id - The ID or value to encode
 * @returns Base64 encoded cursor
 */
export function encodeCursor(id: string | number): string {
  return Buffer.from(String(id)).toString('base64')
}

/**
 * Decodes a base64 cursor value
 *
 * @param cursor - The base64 encoded cursor
 * @returns Decoded cursor value
 */
export function decodeCursor(cursor: string): string {
  try {
    return Buffer.from(cursor, 'base64').toString('utf-8')
  } catch (error) {
    throw new BadRequestError('Invalid cursor format')
  }
}

/**
 * Validates and normalizes pagination parameters
 */
export function validatePaginationParams(
  cursor?: string,
  limit?: string | number
): { cursor?: string; limit: number } {
  // Validate and normalize limit
  let normalizedLimit = DEFAULT_LIMIT

  if (limit !== undefined) {
    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      throw new BadRequestError('Limit must be a positive integer')
    }

    if (parsedLimit > MAX_LIMIT) {
      throw new BadRequestError(`Limit cannot exceed ${MAX_LIMIT}`)
    }

    normalizedLimit = parsedLimit
  }

  // Validate cursor if provided
  let normalizedCursor: string | undefined

  if (cursor) {
    try {
      normalizedCursor = decodeCursor(cursor)
    } catch (error) {
      throw new BadRequestError('Invalid cursor format')
    }
  }

  return { cursor: normalizedCursor, limit: normalizedLimit }
}

/**
 * Generic cursor-based pagination for PostgreSQL queries
 *
 * Assumes records are ordered by a monotonically increasing ID field
 *
 * @param executeQuery - Function that executes the query and returns results
 * @param cursor - Optional cursor for pagination (encoded)
 * @param limit - Number of records to return
 * @param cursorField - Field name to use for cursor (default: 'id')
 * @returns Paginated response with data, cursor, and hasMore flag
 */
export async function paginatePostgres<T extends Record<string, unknown>>(
  executeQuery: (afterId?: string, limit?: number) => Promise<T[]>,
  cursor?: string,
  limit: number = DEFAULT_LIMIT,
  cursorField: string = 'id'
): Promise<PaginatedResponse<T>> {
  // Validate parameters
  const { cursor: decodedCursor, limit: validatedLimit } = validatePaginationParams(cursor, limit)

  // Fetch limit + 1 to check if there are more results
  const results = await executeQuery(decodedCursor, validatedLimit + 1)

  // Determine if there are more results
  const hasMore = results.length > validatedLimit

  // Trim results to limit
  const data = hasMore ? results.slice(0, validatedLimit) : results

  // Generate next cursor from the last item
  let nextCursor: string | undefined

  if (hasMore && data.length > 0) {
    const lastItem = data[data.length - 1]
    const cursorValue = lastItem[cursorField]

    if (cursorValue !== undefined && cursorValue !== null) {
      nextCursor = encodeCursor(String(cursorValue))
    }
  }

  return {
    data,
    cursor: nextCursor,
    hasMore,
  }
}

/**
 * Cursor-based pagination for MongoDB-like collections
 *
 * @param executeQuery - Function that executes the query
 * @param cursor - Optional cursor for pagination (encoded)
 * @param limit - Number of records to return
 * @param cursorField - Field name to use for cursor (default: '_id')
 * @returns Paginated response
 */
export async function paginateMongoDB<T extends Record<string, unknown>>(
  executeQuery: (afterId?: string, limit?: number) => Promise<T[]>,
  cursor?: string,
  limit: number = DEFAULT_LIMIT,
  cursorField: string = '_id'
): Promise<PaginatedResponse<T>> {
  // MongoDB pagination is similar to PostgreSQL
  return paginatePostgres(executeQuery, cursor, limit, cursorField)
}

/**
 * Paginate an in-memory array (useful for testing or small datasets)
 *
 * @param items - Array of items to paginate
 * @param cursor - Optional cursor (index)
 * @param limit - Number of items to return
 * @returns Paginated response
 */
export function paginateArray<T extends Record<string, unknown>>(
  items: T[],
  cursor?: string,
  limit: number = DEFAULT_LIMIT,
  cursorField: string = 'id'
): PaginatedResponse<T> {
  const { cursor: decodedCursor, limit: validatedLimit } = validatePaginationParams(cursor, limit)

  // Find the starting index
  let startIndex = 0

  if (decodedCursor) {
    // Find the index of the item with the cursor value
    const cursorIndex = items.findIndex((item) => String(item[cursorField]) === decodedCursor)

    if (cursorIndex === -1) {
      throw new BadRequestError('Invalid cursor: item not found')
    }

    // Start from the next item
    startIndex = cursorIndex + 1
  }

  // Get the slice of items
  const endIndex = startIndex + validatedLimit
  const data = items.slice(startIndex, endIndex)

  // Determine if there are more items
  const hasMore = endIndex < items.length

  // Generate next cursor
  let nextCursor: string | undefined

  if (hasMore && data.length > 0) {
    const lastItem = data[data.length - 1]
    const cursorValue = lastItem[cursorField]

    if (cursorValue !== undefined && cursorValue !== null) {
      nextCursor = encodeCursor(String(cursorValue))
    }
  }

  return {
    data,
    cursor: nextCursor,
    hasMore,
  }
}

/**
 * Helper to build a PostgreSQL query with cursor pagination
 *
 * @param baseQuery - Base SQL query without pagination
 * @param cursor - Optional cursor value (decoded)
 * @param limit - Limit value
 * @param cursorField - Field to use for pagination
 * @param cursorOperator - Comparison operator (default: '>')
 * @returns Modified query with pagination
 */
export function buildPaginatedQuery(
  baseQuery: string,
  cursor?: string,
  limit: number = DEFAULT_LIMIT,
  cursorField: string = 'id',
  cursorOperator: '>' | '<' = '>'
): { query: string; parameters: unknown[] } {
  const parameters: unknown[] = []
  let query = baseQuery

  // Add WHERE clause for cursor if provided
  if (cursor) {
    const whereClause = baseQuery.toLowerCase().includes('where') ? 'AND' : 'WHERE'
    query += ` ${whereClause} ${cursorField} ${cursorOperator} $${parameters.length + 1}`
    parameters.push(cursor)
  }

  // Add ORDER BY if not present
  if (!query.toLowerCase().includes('order by')) {
    query += ` ORDER BY ${cursorField} ASC`
  }

  // Add LIMIT
  query += ` LIMIT $${parameters.length + 1}`
  parameters.push(limit + 1) // Fetch one extra to check hasMore

  return { query, parameters }
}
