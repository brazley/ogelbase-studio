/**
 * Validation Example
 *
 * Demonstrates:
 * - Request body validation with JSON Schema
 * - Query parameter validation
 * - URL parameter validation
 * - Response validation
 * - Type coercion
 * - Default values
 *
 * Run: bun run examples/with-validation.ts
 */

import { Ogelfy } from '../src/index';

const app = new Ogelfy({
  schemaCompiler: {
    coerceTypes: true,  // Auto-convert query strings to correct types
    useDefaults: true,  // Apply default values
  }
});

// Create user with validation
app.post('/users', {
  schema: {
    body: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 3,
          maxLength: 50
        },
        email: {
          type: 'string',
          format: 'email'
        },
        age: {
          type: 'number',
          minimum: 0,
          maximum: 150
        },
        role: {
          type: 'string',
          enum: ['user', 'admin', 'moderator'],
          default: 'user'
        }
      },
      required: ['name', 'email']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' },
          age: { type: 'number' },
          role: { type: 'string' },
          createdAt: { type: 'string' }
        }
      }
    }
  }
}, async (req, context) => {
  const { name, email, age, role } = context.body;

  return {
    id: crypto.randomUUID(),
    name,
    email,
    age,
    role,
    createdAt: new Date().toISOString()
  };
});

// Search with query validation
app.get('/search', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          minLength: 1,
          maxLength: 100
        },
        page: {
          type: 'number',
          minimum: 1,
          default: 1
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          default: 20
        },
        sort: {
          type: 'string',
          enum: ['name', 'date', 'relevance'],
          default: 'relevance'
        }
      },
      required: ['q']
    }
  }
}, async (req, context) => {
  const { q, page, limit, sort } = context.query;

  // Values are already coerced to correct types
  console.log(typeof page);  // "number", not "string"
  console.log(typeof limit); // "number", not "string"

  return {
    query: q,
    page,
    limit,
    sort,
    results: []
  };
});

// Get user with UUID validation
app.get('/users/:id', {
  schema: {
    params: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid'
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' }
        }
      },
      404: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          statusCode: { type: 'number' }
        }
      }
    }
  }
}, async (req, context) => {
  // id is guaranteed to be a valid UUID
  return {
    id: context.params.id,
    name: 'John Doe',
    email: 'john@example.com'
  };
});

// Complex nested validation
app.post('/posts', {
  schema: {
    body: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          minLength: 5,
          maxLength: 200
        },
        content: {
          type: 'string',
          minLength: 10
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 10,
          uniqueItems: true
        },
        metadata: {
          type: 'object',
          properties: {
            author: { type: 'string' },
            category: { type: 'string' },
            featured: { type: 'boolean', default: false }
          }
        },
        publishedAt: {
          type: 'string',
          format: 'date-time',
          nullable: true
        }
      },
      required: ['title', 'content', 'tags']
    }
  }
}, async (req, context) => {
  return {
    id: crypto.randomUUID(),
    ...context.body,
    createdAt: new Date().toISOString()
  };
});

const PORT = 3001;
await app.listen({ port: PORT });

console.log(`
🚀 Validation example running on http://localhost:${PORT}

Try these:

✅ Valid request:
curl -X POST http://localhost:${PORT}/users \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Alice","email":"alice@example.com","age":30}'

❌ Invalid (missing email):
curl -X POST http://localhost:${PORT}/users \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Bob"}'

❌ Invalid (bad email format):
curl -X POST http://localhost:${PORT}/users \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Bob","email":"not-an-email"}'

✅ Search with query validation:
curl "http://localhost:${PORT}/search?q=ogelfy&page=2&limit=10"

✅ UUID validation:
curl http://localhost:${PORT}/users/550e8400-e29b-41d4-a716-446655440000

❌ Invalid UUID:
curl http://localhost:${PORT}/users/not-a-uuid
`);
