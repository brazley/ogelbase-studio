import type { NextApiResponse } from 'next'
import type { ApiV2Request, ProblemDetails, ValidationError } from './types'

/**
 * Custom API Error class that conforms to RFC 9457 Problem Details
 */
export class ApiError extends Error {
  public readonly status: number
  public readonly title: string
  public readonly detail?: string
  public readonly errorCode?: string
  public readonly validationErrors?: ValidationError[]
  public readonly instance?: string

  constructor(
    status: number,
    title: string,
    detail?: string,
    errorCode?: string,
    validationErrors?: ValidationError[]
  ) {
    super(title)
    this.name = 'ApiError'
    this.status = status
    this.title = title
    this.detail = detail
    this.errorCode = errorCode
    this.validationErrors = validationErrors

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor)
  }

  /**
   * Convert the error to RFC 9457 Problem Details format
   */
  toProblemDetails(instance?: string): ProblemDetails {
    const problem: ProblemDetails = {
      type: this.errorCode
        ? `https://api.supabase.com/errors/${this.errorCode}`
        : `https://api.supabase.com/errors/generic`,
      title: this.title,
      status: this.status,
    }

    if (this.detail) {
      problem.detail = this.detail
    }

    if (instance || this.instance) {
      problem.instance = instance || this.instance
    }

    if (this.errorCode) {
      problem.errorCode = this.errorCode
    }

    if (this.validationErrors && this.validationErrors.length > 0) {
      problem.validationErrors = this.validationErrors
    }

    return problem
  }
}

/**
 * Predefined API error constructors
 */
export class BadRequestError extends ApiError {
  constructor(detail?: string, validationErrors?: ValidationError[]) {
    super(400, 'Bad Request', detail, 'BAD_REQUEST', validationErrors)
  }
}

export class UnauthorizedError extends ApiError {
  constructor(detail?: string) {
    super(401, 'Unauthorized', detail, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends ApiError {
  constructor(detail?: string) {
    super(403, 'Forbidden', detail, 'FORBIDDEN')
  }
}

export class NotFoundError extends ApiError {
  constructor(resource?: string) {
    super(
      404,
      'Not Found',
      resource ? `The requested ${resource} was not found` : 'The requested resource was not found',
      'NOT_FOUND'
    )
  }
}

export class ConflictError extends ApiError {
  constructor(detail?: string) {
    super(409, 'Conflict', detail, 'CONFLICT')
  }
}

export class ValidationFailedError extends ApiError {
  constructor(detail?: string, validationErrors?: ValidationError[]) {
    super(400, 'Validation Error', detail, 'VALIDATION_ERROR', validationErrors)
  }
}

export class UnprocessableEntityError extends ApiError {
  constructor(detail?: string, validationErrors?: ValidationError[]) {
    super(422, 'Unprocessable Entity', detail, 'UNPROCESSABLE_ENTITY', validationErrors)
  }
}

export class TooManyRequestsError extends ApiError {
  public readonly retryAfter?: number

  constructor(detail?: string, retryAfter?: number) {
    super(429, 'Too Many Requests', detail, 'RATE_LIMIT_EXCEEDED')
    this.retryAfter = retryAfter
  }

  toProblemDetails(instance?: string): ProblemDetails {
    const problem = super.toProblemDetails(instance)
    if (this.retryAfter) {
      // Store retry info in a way that can be extracted by error handler
      problem.instance = `${problem.instance || instance || ''}|retry-after:${this.retryAfter}`
    }
    return problem
  }
}

export class InternalServerError extends ApiError {
  constructor(detail?: string) {
    super(500, 'Internal Server Error', detail, 'INTERNAL_ERROR')
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(detail?: string) {
    super(503, 'Service Unavailable', detail, 'SERVICE_UNAVAILABLE')
  }
}

/**
 * Global error handler middleware that converts errors to RFC 9457 format
 */
export function errorHandler(
  err: Error | ApiError,
  req: ApiV2Request,
  res: NextApiResponse,
  _next?: () => void
): void {
  // Set content type for problem details
  res.setHeader('Content-Type', 'application/problem+json')

  // Handle known ApiError instances
  if (err instanceof ApiError) {
    const problem = err.toProblemDetails(req.url)

    // Add retry-after header for rate limit errors
    if (err instanceof TooManyRequestsError && err.retryAfter) {
      res.setHeader('Retry-After', err.retryAfter.toString())
    }

    return res.status(err.status).json(problem)
  }

  // Log unexpected errors in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Unexpected error:', err)
  }

  // Handle generic errors as 500 Internal Server Error
  const problem: ProblemDetails = {
    type: 'https://api.supabase.com/errors/internal-error',
    title: 'Internal Server Error',
    status: 500,
    detail: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    instance: req.url,
  }

  res.status(500).json(problem)
}

/**
 * Async error wrapper for handlers
 */
export function asyncHandler(handler: (req: ApiV2Request, res: NextApiResponse) => Promise<void>) {
  return async (req: ApiV2Request, res: NextApiResponse) => {
    try {
      await handler(req, res)
    } catch (error) {
      errorHandler(error as Error, req, res)
    }
  }
}
