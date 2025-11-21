/**
 * API v2 Layer
 *
 * Production-ready API middleware with:
 * - RFC 9457 error handling
 * - API versioning
 * - Rate limiting
 * - Cursor-based pagination
 * - Audit logging
 */

// Core wrapper and handlers
export {
  apiWrapperV2,
  publicApiV2,
  authenticatedApiV2,
  internalApiV2,
  webhookApiV2,
  methodRouter,
  asyncHandler,
} from './apiWrapper'

// Types
export type {
  ApiV2Request,
  ApiV2Handler,
  ApiV2WrapperOptions,
  ProblemDetails,
  ValidationError,
  PaginatedResponse,
  RateLimitInfo,
  RateLimitConfig,
  UserTier,
  AuditLogEntry,
} from './types'

// Error handling
export {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  TooManyRequestsError,
  InternalServerError,
  ServiceUnavailableError,
  errorHandler,
} from './errorHandler'

// Versioning
export {
  apiVersionMiddleware,
  getApiVersion,
  assertSupportedVersion,
  DEFAULT_API_VERSION,
  SUPPORTED_API_VERSIONS,
  type SupportedVersion,
} from './versionMiddleware'

// Pagination
export {
  encodeCursor,
  decodeCursor,
  validatePaginationParams,
  paginatePostgres,
  paginateMongoDB,
  paginateArray,
  buildPaginatedQuery,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from './pagination'

// Rate limiting
export {
  rateLimitMiddleware,
  clearRateLimits,
  getRateLimitStore,
  createRateLimiter,
  strictRateLimiter,
  generousRateLimiter,
  RATE_LIMITS,
} from './rateLimiter'

// Audit logging
export {
  auditLogMiddleware,
  logAudit,
  queryAuditLogs,
  clearAuditLogs,
  getAllAuditLogs,
  getRecentAuditLogs,
  setAuditLogStore,
} from './auditLogger'
