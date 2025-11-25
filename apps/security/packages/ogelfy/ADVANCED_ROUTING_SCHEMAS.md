# Advanced Routing + JSON Schema Validation

This document describes the advanced routing features and JSON Schema validation system added to Ogelfy.

## Table of Contents

- [Advanced Routing](#advanced-routing)
  - [Wildcard Routes](#wildcard-routes)
  - [Regex Routes](#regex-routes)
  - [Route Constraints](#route-constraints)
  - [Route Shorthand](#route-shorthand)
- [JSON Schema Validation](#json-schema-validation)
  - [Request Validation](#request-validation)
  - [Response Validation](#response-validation)
  - [Shared Schemas](#shared-schemas)
  - [Custom Formats](#custom-formats)

---

## Advanced Routing

### Wildcard Routes

Match dynamic path segments using `*`:

```typescript
// Match anything after /files/
app.get('/files/*', (req, ctx) => {
  const path = ctx?.params['*']; // "images/logo.png"
  return { path };
});
// GET /files/images/logo.png -> { path: "images/logo.png" }

// Match in the middle of a path
app.get('/api/*/users', (req, ctx) => {
  const version = ctx?.params['*']; // "v1"
  return { version };
});
// GET /api/v1/users -> { version: "v1" }

// Combine with named params
app.get('/users/:id/*', (req, ctx) => {
  return {
    userId: ctx?.params['id'],
    rest: ctx?.params['*'],
  };
});
// GET /users/123/files/doc.pdf -> { userId: "123", rest: "files/doc.pdf" }
```

**Note:** Wildcards at the end of a path match remaining segments. Wildcards in the middle match only one segment.

### Regex Routes

Use regular expressions for complex pattern matching:

```typescript
// Match API versions
app.get(/^\/api\/v(\d+)\/users$/, (req, ctx) => {
  const version = ctx?.params['0']; // First capture group
  return { version };
});
// GET /api/v1/users -> { version: "1" }

// Multiple capture groups
app.get(/^\/(\w+)\/(\d+)$/, (req, ctx) => {
  return {
    resource: ctx?.params['0'],
    id: ctx?.params['1'],
  };
});
// GET /users/42 -> { resource: "users", id: "42" }
```

**Note:** Capture groups are numbered starting from 0.

### Route Constraints

Constrain routes by host, version, or custom headers:

```typescript
// Host constraint
app.get(
  '/api/users',
  {
    constraints: { host: 'api.example.com' },
  },
  () => {
    return { source: 'api' };
  }
);

// Version constraint (via accept-version header)
app.get(
  '/users',
  {
    constraints: { version: '1.0.0' },
  },
  () => {
    return { version: 'v1' };
  }
);

// Multiple hosts
app.get(
  '/data',
  {
    constraints: { host: ['api1.example.com', 'api2.example.com'] },
  },
  handler
);
```

Constraints are checked before route handlers execute.

### Route Shorthand

Convenient methods for common patterns:

```typescript
// ALL methods
app.all('/resource', (req) => {
  return { method: req.method };
});

// Route chaining
app
  .route('/users')
  .get(() => ({ action: 'list' }))
  .post(() => ({ action: 'create' }))
  .put(() => ({ action: 'update' }))
  .delete(() => ({ action: 'delete' }));
```

---

## JSON Schema Validation

Ogelfy uses Ajv for fast JSON Schema validation of requests and responses.

### Request Validation

Validate different parts of the request:

```typescript
app.post(
  '/users',
  {
    schema: {
      // Validate request body
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number', minimum: 0, maximum: 150 },
          email: { type: 'string', format: 'email' },
        },
        required: ['name', 'email'],
      },

      // Validate query parameters
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', default: 1 },
          limit: { type: 'number', default: 10 },
        },
      },

      // Validate URL parameters
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9]+$' },
        },
      },

      // Validate headers
      headers: {
        type: 'object',
        properties: {
          'x-api-key': { type: 'string' },
        },
        required: ['x-api-key'],
      },
    },
  },
  (req, ctx) => {
    // ctx.body, ctx.query, ctx.params are all validated
    return { success: true };
  }
);
```

**Features:**
- Type coercion (string "30" → number 30)
- Remove additional properties
- Apply default values
- Format validation (email, uri, date, etc.)

### Response Validation

Validate and sanitize responses:

```typescript
app.get(
  '/user/:id',
  {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
          },
          required: ['id', 'name'],
          additionalProperties: false, // Remove extra fields
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  },
  (req, ctx) => {
    const user = getUser(ctx?.params.id);

    if (!user) {
      // Return 404 with proper schema
      return { statusCode: 404, error: 'User not found' };
    }

    // Return 200 (default)
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      password: 'secret', // Will be removed by schema
      internal: 'data', // Will be removed by schema
    };
  }
);
```

**Security benefit:** Automatically removes sensitive fields from responses!

### Shared Schemas

Define reusable schemas:

```typescript
// Register shared schema
app.addSchema('User', {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string', format: 'email' },
  },
  required: ['id', 'name', 'email'],
});

// Reference in routes
app.post(
  '/users',
  {
    schema: {
      body: { $ref: 'User' },
      response: {
        200: { $ref: 'User' },
      },
    },
  },
  handler
);

// Compose schemas
app.addSchema('UserWithAddress', {
  type: 'object',
  properties: {
    user: { $ref: 'User' },
    address: {
      type: 'object',
      properties: {
        street: { type: 'string' },
        city: { type: 'string' },
      },
    },
  },
});
```

### Custom Formats

Add custom format validators:

```typescript
const compiler = app.getSchemaCompiler();

// Add custom format
compiler.addFormat('custom-id', /^[A-Z]{3}-\d{3}$/);

// Use in schema
app.post(
  '/items',
  {
    schema: {
      body: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'custom-id' },
        },
      },
    },
  },
  handler
);
// POST /items { "id": "ABC-123" } -> Valid
// POST /items { "id": "invalid" } -> 400 error
```

---

## Validation Error Handling

Validation errors return 400 with detailed error messages:

```json
{
  "name": "ValidationError",
  "message": "/body: must have required property 'name'",
  "errors": [
    {
      "path": "/body",
      "message": "Request body validation failed"
    },
    {
      "path": "",
      "message": "must have required property 'name'",
      "params": {
        "missingProperty": "name"
      }
    }
  ]
}
```

---

## Built-in Formats

Ajv provides these formats out of the box:

- `date` - full-date (RFC 3339)
- `time` - full-time (RFC 3339)
- `date-time` - date-time (RFC 3339)
- `duration` - duration (RFC 3339)
- `email` - email address
- `hostname` - hostname
- `ipv4` - IPv4 address
- `ipv6` - IPv6 address
- `uri` - URI
- `uri-reference` - URI reference
- `uri-template` - URI template
- `url` - URL
- `uuid` - UUID
- `json-pointer` - JSON pointer
- `relative-json-pointer` - relative JSON pointer
- `regex` - regular expression

---

## Route Priority

Routes are matched in this order:

1. Exact matches (`/users/special`)
2. Named parameters (`/users/:id`)
3. Wildcards (`/users/*`)
4. Regex patterns (`/^\/users\/\d+$/`)

```typescript
app.get('/files/special', () => ({ type: 'exact' }));
app.get('/files/:name', () => ({ type: 'param' }));
app.get('/files/*', () => ({ type: 'wildcard' }));

// GET /files/special -> exact
// GET /files/readme.txt -> param
// GET /files/docs/guide.md -> wildcard
```

---

## Performance Tips

1. **Schema Compilation:** Schemas are compiled once and cached. Reuse schemas when possible.

2. **Shared Schemas:** Use `$ref` to avoid duplicating large schemas.

3. **Response Validation:** Only validate responses in development/testing if performance is critical.

4. **Type Coercion:** Disable `coerceTypes` if you need strict type checking.

```typescript
const app = new Ogelfy({
  schemaCompiler: {
    coerceTypes: false, // Strict mode
    removeAdditional: 'all', // Remove all extra props
    useDefaults: true, // Apply defaults
  },
});
```

---

## Examples

See the test files for comprehensive examples:

- `tests/advanced-routing.test.ts` - Wildcard, regex, and constraint examples
- `tests/schema-compiler.test.ts` - Schema compilation and validation
- `tests/route-schemas.test.ts` - Request/response validation examples

---

## Migration from Basic Routing

**Before:**

```typescript
app.get('/users/:id', (req) => {
  const id = (req as any).params.id;
  return getUser(id);
});
```

**After:**

```typescript
app.get('/users/:id', (req, ctx) => {
  const id = ctx?.params.id; // Type-safe context
  return getUser(id);
});
```

**With validation:**

```typescript
app.get(
  '/users/:id',
  {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9]+$' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
        },
      },
    },
  },
  (req, ctx) => {
    return getUser(ctx?.params.id);
  }
);
```

---

## API Reference

### Ogelfy Methods

```typescript
// Add shared schema
app.addSchema(id: string, schema: object): void

// Get schema compiler
app.getSchemaCompiler(): SchemaCompiler

// Register routes with options
app.get(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void
app.post(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void
app.put(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void
app.delete(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void
app.patch(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void
app.options(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void
app.head(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void
app.all(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void

// Route chaining
app.route(path: string): RouteChain
```

### SchemaCompiler Methods

```typescript
// Schema management
addSchema(id: string, schema: object): void
getSchema(id: string): object | undefined
removeSchema(id: string): boolean

// Validation
validate(schema: object, data: unknown): any
validateById(id: string, data: unknown): any
isValid(schema: object, data: unknown): boolean
isValidById(id: string, data: unknown): boolean
getErrors(schema: object, data: unknown): ErrorObject[] | null

// Compilation
compile(schema: object): ValidateFunction
compileById(id: string): ValidateFunction

// Custom formats
addFormat(name: string, format: string | RegExp | Function): void
addKeyword(keyword: string, definition: object): void

// Utilities
clear(): void
```

---

## Conclusion

Ogelfy now has Fastify-level routing and schema validation! These features enable:

✅ Complex route patterns with wildcards and regex
✅ Route constraints for multi-tenant apps
✅ Automatic request/response validation
✅ Type coercion and default values
✅ Security through response sanitization
✅ High-performance schema compilation

For questions or issues, see the test files or open an issue on GitHub.
