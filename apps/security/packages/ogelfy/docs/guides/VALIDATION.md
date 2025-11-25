# Validation Guide

Complete guide to request and response validation in Ogelfy using JSON Schema.

## Table of Contents

- [Why Validation](#why-validation)
- [Basic Validation](#basic-validation)
- [Request Validation](#request-validation)
- [Response Validation](#response-validation)
- [Shared Schemas](#shared-schemas)
- [Type Coercion](#type-coercion)
- [Custom Validation](#custom-validation)
- [Error Handling](#error-handling)

## Why Validation

Validation provides:
- **Type safety** - Ensure data matches expected format
- **Security** - Prevent malicious or malformed data
- **Performance** - Fast JSON Schema compilation with AJV
- **Documentation** - Schemas serve as API documentation
- **Error messages** - Clear validation errors for clients

## Basic Validation

Add validation to any route using the `schema` option:

```typescript
import { Ogelfy } from '@security/ogelfy';

const app = new Ogelfy();

app.post('/users', {
  schema: {
    body: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string', format: 'email' }
      },
      required: ['name', 'email']
    }
  }
}, async (req, context) => {
  // If we reach here, body is validated
  const { name, email } = context.body;

  return {
    id: crypto.randomUUID(),
    name,
    email
  };
});
```

Try invalid data:

```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob"}'

# Response: 400 Bad Request
{
  "error": "Validation failed",
  "errors": [{
    "field": "email",
    "message": "must have required property 'email'"
  }]
}
```

## Request Validation

### Body Validation

Validate POST/PUT/PATCH request bodies:

```typescript
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
          maxItems: 10,
          uniqueItems: true
        },
        published: {
          type: 'boolean',
          default: false
        },
        publishedAt: {
          type: 'string',
          format: 'date-time',
          nullable: true
        }
      },
      required: ['title', 'content']
    }
  }
}, async (req, context) => {
  return {
    id: crypto.randomUUID(),
    ...context.body,
    createdAt: new Date().toISOString()
  };
});
```

### Query String Validation

Validate URL query parameters:

```typescript
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

  // All values are validated and coerced to correct types
  // page and limit are numbers, not strings

  return await searchDatabase({ q, page, limit, sort });
});
```

### URL Parameters Validation

Validate route parameters:

```typescript
app.get('/users/:id', {
  schema: {
    params: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid'
        }
      },
      required: ['id']
    }
  }
}, async (req, context) => {
  // id is guaranteed to be a valid UUID
  return await db.getUser(context.params.id);
});

// Custom pattern
app.get('/products/:sku', {
  schema: {
    params: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          pattern: '^[A-Z]{3}-[0-9]{6}$' // Format: ABC-123456
        }
      }
    }
  }
}, async (req, context) => {
  return await db.getProductBySku(context.params.sku);
});
```

### Headers Validation

Validate request headers:

```typescript
app.get('/protected', {
  schema: {
    headers: {
      type: 'object',
      properties: {
        'authorization': {
          type: 'string',
          pattern: '^Bearer .+$'
        },
        'x-api-version': {
          type: 'string',
          enum: ['1.0', '2.0']
        }
      },
      required: ['authorization']
    }
  }
}, async (req, context) => {
  // Authorization header is present and valid
  return { data: 'secret' };
});
```

## Response Validation

Validate responses by status code:

```typescript
app.get('/users/:id', {
  schema: {
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' },
          createdAt: { type: 'string' }
        },
        required: ['id', 'name', 'email', 'createdAt']
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
  const user = await db.getUser(context.params.id);

  if (!user) {
    throw app.httpErrors.notFound('User not found');
  }

  return user; // Validated against 200 schema
});
```

### Response Serialization

Response validation also enables fast serialization:

```typescript
app.get('/users', {
  schema: {
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' }
          }
        }
      }
    }
  }
}, async () => {
  return await db.getAllUsers();
  // Response is serialized 3x faster with schema!
});
```

## Shared Schemas

### Defining Shared Schemas

Reuse schemas across multiple routes:

```typescript
// Define shared schemas
app.addSchema('userSchema', {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', minLength: 3, maxLength: 100 },
    email: { type: 'string', format: 'email' },
    age: { type: 'number', minimum: 0, maximum: 150 },
    createdAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'name', 'email']
});

app.addSchema('paginationSchema', {
  type: 'object',
  properties: {
    page: { type: 'number', minimum: 1, default: 1 },
    limit: { type: 'number', minimum: 1, maximum: 100, default: 20 }
  }
});

// Reference shared schemas
app.get('/users', {
  schema: {
    querystring: { $ref: 'paginationSchema#' },
    response: {
      200: {
        type: 'array',
        items: { $ref: 'userSchema#' }
      }
    }
  }
}, async (req, context) => {
  return await db.getUsers(context.query);
});

app.post('/users', {
  schema: {
    body: {
      type: 'object',
      properties: {
        name: { $ref: 'userSchema#/properties/name' },
        email: { $ref: 'userSchema#/properties/email' },
        age: { $ref: 'userSchema#/properties/age' }
      },
      required: ['name', 'email']
    },
    response: {
      200: { $ref: 'userSchema#' }
    }
  }
}, async (req, context) => {
  return await db.createUser(context.body);
});
```

### Schema Composition

Combine schemas using `allOf`, `anyOf`, `oneOf`:

```typescript
app.addSchema('baseUser', {
  type: 'object',
  properties: {
    name: { type: 'string' },
    email: { type: 'string', format: 'email' }
  }
});

app.addSchema('adminUser', {
  allOf: [
    { $ref: 'baseUser#' },
    {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['admin', 'superadmin'] },
        permissions: { type: 'array', items: { type: 'string' } }
      },
      required: ['role']
    }
  ]
});

app.post('/admin/users', {
  schema: {
    body: { $ref: 'adminUser#' }
  }
}, async (req, context) => {
  return await db.createAdminUser(context.body);
});
```

## Type Coercion

Ogelfy automatically coerces types when enabled (default):

```typescript
const app = new Ogelfy({
  schemaCompiler: {
    coerceTypes: true // Default
  }
});

app.get('/items', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        active: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } }
      }
    }
  }
}, async (req, context) => {
  // Query string "?limit=10&active=true&tags=a,b,c"
  // is coerced to:
  // {
  //   limit: 10,           // number, not string "10"
  //   active: true,        // boolean, not string "true"
  //   tags: ['a', 'b', 'c'] // array, not string "a,b,c"
  // }

  console.log(typeof context.query.limit);  // "number"
  console.log(typeof context.query.active); // "boolean"
  console.log(Array.isArray(context.query.tags)); // true

  return await db.getItems(context.query);
});
```

## Custom Validation

### Custom Formats

Add custom format validators:

```typescript
import Ajv from 'ajv';

const compiler = app.getSchemaCompiler();
const ajv = compiler.getAjv();

// Add custom format
ajv.addFormat('phone', {
  validate: (value: string) => {
    return /^\+?[1-9]\d{1,14}$/.test(value);
  }
});

// Use in schema
app.post('/users', {
  schema: {
    body: {
      type: 'object',
      properties: {
        phone: { type: 'string', format: 'phone' }
      }
    }
  }
}, async (req, context) => {
  return { phone: context.body.phone };
});
```

### Custom Keywords

Add custom validation keywords:

```typescript
import Ajv from 'ajv';

const compiler = app.getSchemaCompiler();
const ajv = compiler.getAjv();

// Add custom keyword
ajv.addKeyword({
  keyword: 'isNotEmpty',
  validate: (schema: boolean, data: string) => {
    if (!schema) return true;
    return typeof data === 'string' && data.trim().length > 0;
  },
  errors: false
});

// Use in schema
app.post('/posts', {
  schema: {
    body: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          isNotEmpty: true
        }
      }
    }
  }
}, async (req, context) => {
  return { title: context.body.title };
});
```

### Schema Refinements

Use AJV's `$data` for cross-field validation:

```typescript
app.post('/events', {
  schema: {
    body: {
      type: 'object',
      properties: {
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' }
      },
      required: ['startDate', 'endDate'],
      if: {
        properties: {
          startDate: { type: 'string' }
        }
      },
      then: {
        properties: {
          endDate: {
            type: 'string',
            formatMinimum: { $data: '1/startDate' }
          }
        }
      }
    }
  }
}, async (req, context) => {
  // endDate must be >= startDate
  return await db.createEvent(context.body);
});
```

## Error Handling

### Validation Errors

Ogelfy returns detailed validation errors:

```typescript
// Invalid request
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "A",
    "email": "not-an-email",
    "age": -5
  }'

// Response: 400 Bad Request
{
  "error": "Validation failed",
  "errors": [
    {
      "field": "name",
      "message": "must NOT have fewer than 3 characters",
      "value": "A"
    },
    {
      "field": "email",
      "message": "must match format \"email\"",
      "value": "not-an-email"
    },
    {
      "field": "age",
      "message": "must be >= 0",
      "value": -5
    }
  ]
}
```

### Custom Error Messages

Customize validation error messages:

```typescript
app.post('/users', {
  schema: {
    body: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          format: 'email',
          errorMessage: 'Please provide a valid email address'
        },
        age: {
          type: 'number',
          minimum: 18,
          errorMessage: 'You must be at least 18 years old'
        }
      }
    }
  }
}, async (req, context) => {
  return await db.createUser(context.body);
});
```

### Handling Validation Errors

Catch validation errors in error handler:

```typescript
import { SchemaValidationError } from '@security/ogelfy';

app.setErrorHandler((error, req) => {
  if (error instanceof SchemaValidationError) {
    // Custom validation error handling
    return new Response(JSON.stringify({
      error: 'Invalid request',
      details: error.errors,
      hint: 'Check the API documentation for valid formats'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Handle other errors
  return new Response(JSON.stringify({
    error: error.message
  }), {
    status: error.statusCode || 500,
    headers: { 'Content-Type': 'application/json' }
  });
});
```

## Best Practices

### 1. Always Validate User Input

```typescript
// ✅ Good - Validate everything
app.post('/users', {
  schema: {
    body: { /* validation */ },
    querystring: { /* validation */ },
    params: { /* validation */ }
  }
}, handler);

// ❌ Bad - No validation
app.post('/users', handler);
```

### 2. Use Shared Schemas

```typescript
// ✅ Good - Reusable
app.addSchema('user', userSchema);
app.post('/users', { schema: { body: { $ref: 'user#' } } }, createUser);
app.put('/users/:id', { schema: { body: { $ref: 'user#' } } }, updateUser);

// ❌ Bad - Duplicated
app.post('/users', { schema: { body: userSchema } }, createUser);
app.put('/users/:id', { schema: { body: userSchema } }, updateUser);
```

### 3. Validate Responses in Development

```typescript
const app = new Ogelfy({
  schemaCompiler: {
    strict: process.env.NODE_ENV !== 'production'
  }
});

// Catches response schema mismatches during development
```

### 4. Use Default Values

```typescript
app.get('/items', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'number', default: 1 },
        limit: { type: 'number', default: 20 }
      }
    }
  }
}, async (req, context) => {
  // page and limit always have values
  return await db.getItems(context.query);
});
```

### 5. Document with Examples

```typescript
app.addSchema('userCreate', {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 3,
      examples: ['John Doe', 'Jane Smith']
    },
    email: {
      type: 'string',
      format: 'email',
      examples: ['john@example.com']
    }
  }
});
```

## See Also

- [Getting Started Guide](./GETTING_STARTED.md)
- [Routing Guide](./ROUTING.md)
- [API Reference](../API.md)
- [AJV Documentation](https://ajv.js.org/)
