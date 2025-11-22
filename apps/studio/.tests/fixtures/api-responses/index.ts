/**
 * API Response Fixtures
 *
 * Mock API response data for testing endpoints
 */

import type { MockApiResponse } from '../../helpers/mocks'

/**
 * Successful API responses
 */
export const successResponses = {
  /**
   * Generic success response
   */
  success: {
    data: { success: true },
  } as MockApiResponse<{ success: boolean }>,

  /**
   * Data list response
   */
  list: {
    data: [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
      { id: '3', name: 'Item 3' },
    ],
  } as MockApiResponse<Array<{ id: string; name: string }>>,

  /**
   * Single item response
   */
  item: {
    data: { id: '1', name: 'Test Item', value: 123 },
  } as MockApiResponse<{ id: string; name: string; value: number }>,

  /**
   * Paginated response
   */
  paginated: {
    data: {
      items: [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 50,
        hasMore: true,
      },
    },
  },

  /**
   * Empty list response
   */
  emptyList: {
    data: [],
  } as MockApiResponse<Array<any>>,

  /**
   * Created resource response (201)
   */
  created: {
    data: {
      id: 'new-id-123',
      createdAt: new Date().toISOString(),
    },
  },

  /**
   * No content response (204)
   */
  noContent: {
    data: null,
  } as MockApiResponse<null>,
}

/**
 * Error API responses
 */
export const errorResponses = {
  /**
   * 400 Bad Request
   */
  badRequest: {
    error: {
      message: 'Invalid request parameters',
      code: 'BAD_REQUEST',
      status: 400,
    },
  } as MockApiResponse,

  /**
   * 401 Unauthorized
   */
  unauthorized: {
    error: {
      message: 'Authentication required',
      code: 'UNAUTHORIZED',
      status: 401,
    },
  } as MockApiResponse,

  /**
   * 403 Forbidden
   */
  forbidden: {
    error: {
      message: 'Insufficient permissions',
      code: 'FORBIDDEN',
      status: 403,
    },
  } as MockApiResponse,

  /**
   * 404 Not Found
   */
  notFound: {
    error: {
      message: 'Resource not found',
      code: 'NOT_FOUND',
      status: 404,
    },
  } as MockApiResponse,

  /**
   * 409 Conflict
   */
  conflict: {
    error: {
      message: 'Resource already exists',
      code: 'CONFLICT',
      status: 409,
    },
  } as MockApiResponse,

  /**
   * 422 Unprocessable Entity
   */
  validationError: {
    error: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      status: 422,
      details: {
        fields: {
          email: 'Invalid email format',
          password: 'Password too short',
        },
      },
    },
  } as MockApiResponse,

  /**
   * 429 Too Many Requests
   */
  rateLimited: {
    error: {
      message: 'Rate limit exceeded',
      code: 'RATE_LIMITED',
      status: 429,
      retryAfter: 60,
    },
  } as MockApiResponse,

  /**
   * 500 Internal Server Error
   */
  serverError: {
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      status: 500,
    },
  } as MockApiResponse,

  /**
   * 503 Service Unavailable
   */
  serviceUnavailable: {
    error: {
      message: 'Service temporarily unavailable',
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
      retryAfter: 120,
    },
  } as MockApiResponse,

  /**
   * Network/timeout error
   */
  networkError: {
    error: {
      message: 'Network request failed',
      code: 'NETWORK_ERROR',
      status: 0,
    },
  } as MockApiResponse,
}

/**
 * Redis-specific API responses
 */
export const redisApiResponses = {
  /**
   * Redis health check success
   */
  healthSuccess: {
    data: {
      status: 'healthy',
      latency: 2.5,
      memoryUsage: 45.2,
      connections: 12,
      hitRate: 92.3,
      lastChecked: new Date().toISOString(),
    },
  },

  /**
   * Redis health check degraded
   */
  healthDegraded: {
    data: {
      status: 'degraded',
      latency: 15.7,
      memoryUsage: 87.3,
      connections: 28,
      hitRate: 78.5,
      lastChecked: new Date().toISOString(),
    },
  },

  /**
   * Redis connection error
   */
  connectionError: {
    error: {
      message: 'Failed to connect to Redis',
      code: 'REDIS_CONNECTION_ERROR',
      status: 503,
    },
  },

  /**
   * Redis timeout error
   */
  timeoutError: {
    error: {
      message: 'Redis operation timed out',
      code: 'REDIS_TIMEOUT',
      status: 504,
    },
  },

  /**
   * Redis memory full
   */
  memoryFullError: {
    error: {
      message: 'Redis memory limit reached',
      code: 'REDIS_OOM',
      status: 507,
    },
  },
}

/**
 * Auth-specific API responses
 */
export const authApiResponses = {
  /**
   * Login success
   */
  loginSuccess: {
    data: {
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      refreshToken: 'refresh-token-123',
      expiresIn: 3600,
      user: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        name: 'Test User',
      },
    },
  },

  /**
   * Invalid credentials
   */
  invalidCredentials: {
    error: {
      message: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS',
      status: 401,
    },
  },

  /**
   * Session expired
   */
  sessionExpired: {
    error: {
      message: 'Session has expired',
      code: 'SESSION_EXPIRED',
      status: 401,
    },
  },

  /**
   * Token refresh success
   */
  refreshSuccess: {
    data: {
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      expiresIn: 3600,
    },
  },
}

/**
 * Database-specific API responses
 */
export const databaseApiResponses = {
  /**
   * Database list success
   */
  listSuccess: {
    data: [
      {
        id: 'db-001',
        name: 'primary',
        status: 'healthy',
        connectionString: 'postgresql://...',
      },
      {
        id: 'db-002',
        name: 'replica',
        status: 'healthy',
        connectionString: 'postgresql://...',
      },
    ],
  },

  /**
   * Database connection failed
   */
  connectionFailed: {
    error: {
      message: 'Failed to connect to database',
      code: 'DB_CONNECTION_ERROR',
      status: 503,
    },
  },

  /**
   * Query execution success
   */
  querySuccess: {
    data: {
      rows: [
        { id: 1, name: 'Row 1' },
        { id: 2, name: 'Row 2' },
      ],
      rowCount: 2,
      executionTime: 12.5,
    },
  },

  /**
   * Query syntax error
   */
  querySyntaxError: {
    error: {
      message: 'SQL syntax error near "FROM"',
      code: 'SQL_SYNTAX_ERROR',
      status: 400,
      position: 45,
    },
  },
}
