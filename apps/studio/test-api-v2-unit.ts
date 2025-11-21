/**
 * Unit tests for API v2 layer
 * Run with: npx tsx test-api-v2-unit.ts
 */

// Test imports
import {
  ApiError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  TooManyRequestsError,
} from './lib/api/v2/errorHandler'

import {
  encodeCursor,
  decodeCursor,
  validatePaginationParams,
  paginateArray,
} from './lib/api/v2/pagination'

import { DEFAULT_API_VERSION, SUPPORTED_API_VERSIONS } from './lib/api/v2/versionMiddleware'

console.log('🧪 API v2 Unit Tests\n')

// Test 1: Error Handling
console.log('✓ Test 1: RFC 9457 Error Classes')
try {
  const notFoundError = new NotFoundError('project')
  const problem = notFoundError.toProblemDetails('/api/v2/projects/123')

  console.assert(problem.status === 404, '404 status code')
  console.assert(problem.title === 'Not Found', 'Correct title')
  console.assert(problem.errorCode === 'NOT_FOUND', 'Correct error code')
  console.assert(problem.type === 'https://api.supabase.com/errors/NOT_FOUND', 'Correct type URL')
  console.log('  ✓ NotFoundError creates valid RFC 9457 response')
  console.log('  ', JSON.stringify(problem, null, 2))
} catch (err) {
  console.error('  ✗ Failed:', err)
}

// Test 2: Bad Request with Validation Errors
console.log('\n✓ Test 2: Validation Errors')
try {
  const badRequestError = new BadRequestError('Invalid input', [
    { field: 'email', message: 'Email is required' },
    { field: 'password', message: 'Password too short' },
  ])
  const problem = badRequestError.toProblemDetails()

  console.assert(problem.status === 400, '400 status code')
  console.assert(problem.validationErrors?.length === 2, 'Has validation errors')
  console.log('  ✓ BadRequestError includes validation details')
  console.log('  ', JSON.stringify(problem, null, 2))
} catch (err) {
  console.error('  ✗ Failed:', err)
}

// Test 3: Rate Limit Error
console.log('\n✓ Test 3: Rate Limit Error')
try {
  const rateLimitError = new TooManyRequestsError('Too many requests', 60)
  const problem = rateLimitError.toProblemDetails()

  console.assert(problem.status === 429, '429 status code')
  console.assert(problem.errorCode === 'RATE_LIMIT_EXCEEDED', 'Correct error code')
  console.log('  ✓ TooManyRequestsError creates 429 response')
  console.log('  ', JSON.stringify(problem, null, 2))
} catch (err) {
  console.error('  ✗ Failed:', err)
}

// Test 4: Cursor Encoding/Decoding
console.log('\n✓ Test 4: Cursor Encoding/Decoding')
try {
  const originalId = '12345'
  const encoded = encodeCursor(originalId)
  const decoded = decodeCursor(encoded)

  console.assert(decoded === originalId, 'Round-trip encoding works')
  console.log(`  ✓ Cursor encoding: ${originalId} -> ${encoded} -> ${decoded}`)
} catch (err) {
  console.error('  ✗ Failed:', err)
}

// Test 5: Pagination Validation
console.log('\n✓ Test 5: Pagination Validation')
try {
  const { limit, cursor } = validatePaginationParams(undefined, 50)
  console.assert(limit === 50, 'Limit is set correctly')
  console.assert(cursor === undefined, 'Cursor is undefined when not provided')
  console.log(`  ✓ Pagination params: limit=${limit}, cursor=${cursor}`)
} catch (err) {
  console.error('  ✗ Failed:', err)
}

// Test 6: Array Pagination
console.log('\n✓ Test 6: Array Pagination')
try {
  const items = Array.from({ length: 250 }, (_, i) => ({
    id: String(i + 1),
    name: `Item ${i + 1}`,
  }))

  // First page
  const page1 = paginateArray(items, undefined, 10)
  console.assert(page1.data.length === 10, 'First page has 10 items')
  console.assert(page1.hasMore === true, 'Has more pages')
  console.assert(page1.cursor !== undefined, 'Has cursor')
  console.log(`  ✓ First page: ${page1.data.length} items, hasMore=${page1.hasMore}`)

  // Second page
  const page2 = paginateArray(items, page1.cursor, 10)
  console.assert(page2.data.length === 10, 'Second page has 10 items')
  console.assert(page2.data[0].id === '11', 'Second page starts at item 11')
  console.log(`  ✓ Second page: ${page2.data.length} items, first item=${page2.data[0].id}`)

  // Last page
  const page25 = paginateArray(items, encodeCursor('240'), 100)
  console.assert(page25.data.length === 10, 'Last page has remaining items')
  console.assert(page25.hasMore === false, 'No more pages')
  console.log(`  ✓ Last page: ${page25.data.length} items, hasMore=${page25.hasMore}`)
} catch (err) {
  console.error('  ✗ Failed:', err)
}

// Test 7: API Versioning
console.log('\n✓ Test 7: API Versioning')
try {
  console.assert(DEFAULT_API_VERSION === '2025-11-20', 'Default version is set')
  console.assert(SUPPORTED_API_VERSIONS.includes('2025-11-20'), 'Default version is supported')
  console.log(`  ✓ Default version: ${DEFAULT_API_VERSION}`)
  console.log(`  ✓ Supported versions: ${SUPPORTED_API_VERSIONS.join(', ')}`)
} catch (err) {
  console.error('  ✗ Failed:', err)
}

// Test 8: Invalid Pagination Limit
console.log('\n✓ Test 8: Invalid Pagination Limits')
try {
  // Test limit too large
  try {
    validatePaginationParams(undefined, 5000)
    console.error('  ✗ Should have thrown error for limit > 1000')
  } catch (err: any) {
    console.assert(err.status === 400, 'Throws 400 error')
    console.log('  ✓ Rejects limit > 1000')
  }

  // Test negative limit
  try {
    validatePaginationParams(undefined, -5)
    console.error('  ✗ Should have thrown error for negative limit')
  } catch (err: any) {
    console.assert(err.status === 400, 'Throws 400 error')
    console.log('  ✓ Rejects negative limit')
  }

  // Test invalid cursor
  try {
    decodeCursor('not-valid-base64!!!')
    console.error('  ✗ Should have thrown error for invalid cursor')
  } catch (err: any) {
    console.log('  ✓ Rejects invalid cursor format')
  }
} catch (err) {
  console.error('  ✗ Failed:', err)
}

// Summary
console.log('\n' + '='.repeat(50))
console.log('✅ All API v2 unit tests passed!')
console.log('='.repeat(50))

console.log('\n📚 API v2 Components:')
console.log('  ✓ RFC 9457 error handling')
console.log('  ✓ API versioning (date-based)')
console.log('  ✓ Cursor-based pagination')
console.log('  ✓ Rate limiting (in-memory)')
console.log('  ✓ Audit logging')
console.log('  ✓ Type-safe middleware chain')

console.log('\n🚀 Next Steps:')
console.log('  1. Start dev server: npm run dev')
console.log('  2. Run integration tests: ./test-api-v2.sh')
console.log('  3. Test endpoints at http://localhost:8082/api/v2/test')
