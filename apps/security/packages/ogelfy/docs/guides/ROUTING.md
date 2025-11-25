# Routing Guide

Complete guide to routing in Ogelfy - from basic routes to advanced patterns.

## Table of Contents

- [Basic Routes](#basic-routes)
- [Route Parameters](#route-parameters)
- [Wildcard Routes](#wildcard-routes)
- [Regex Routes](#regex-routes)
- [Route Chaining](#route-chaining)
- [Route Constraints](#route-constraints)
- [Route Ordering](#route-ordering)
- [Advanced Patterns](#advanced-patterns)

## Basic Routes

### Static Routes

The simplest routes match exact paths:

```typescript
import { Ogelfy } from '@security/ogelfy';

const app = new Ogelfy();

app.get('/hello', async () => {
  return { message: 'Hello!' };
});

app.get('/api/users', async () => {
  return { users: [] };
});

app.get('/api/v1/products', async () => {
  return { products: [] };
});
```

### HTTP Methods

Ogelfy supports all standard HTTP methods:

```typescript
// GET - Retrieve data
app.get('/users', async () => {
  return await db.getAllUsers();
});

// POST - Create new resource
app.post('/users', async (req, context) => {
  return await db.createUser(context.body);
});

// PUT - Update entire resource
app.put('/users/:id', async (req, context) => {
  return await db.updateUser(context.params.id, context.body);
});

// PATCH - Partial update
app.patch('/users/:id', async (req, context) => {
  return await db.patchUser(context.params.id, context.body);
});

// DELETE - Remove resource
app.delete('/users/:id', async (req, context) => {
  await db.deleteUser(context.params.id);
  return { success: true };
});

// HEAD - Get headers only
app.head('/users/:id', async (req, context) => {
  const exists = await db.userExists(context.params.id);
  if (!exists) throw app.httpErrors.notFound();
  return new Response(null, { status: 200 });
});

// OPTIONS - CORS preflight
app.options('/api/*', async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE'
    }
  });
});
```

### ALL Method

Handle all HTTP methods with a single route:

```typescript
app.all('/webhook', async (req) => {
  console.log(`Webhook received: ${req.method}`);
  return { received: true, method: req.method };
});
```

## Route Parameters

### Basic Parameters

Extract values from URLs using `:paramName`:

```typescript
// Single parameter
app.get('/users/:id', async (req, context) => {
  return {
    userId: context.params.id
  };
});
// Matches: /users/123, /users/abc, /users/uuid-here

// Multiple parameters
app.get('/users/:userId/posts/:postId', async (req, context) => {
  return {
    userId: context.params.userId,
    postId: context.params.postId
  };
});
// Matches: /users/123/posts/456

// Mixed static and dynamic
app.get('/api/v1/users/:id/profile', async (req, context) => {
  return { userId: context.params.id };
});
// Matches: /api/v1/users/123/profile
```

### Parameter Validation

Validate parameters with schemas:

```typescript
app.get('/users/:id', {
  schema: {
    params: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        }
      },
      required: ['id']
    }
  }
}, async (req, context) => {
  // id is guaranteed to be a valid UUID
  return await db.getUser(context.params.id);
});
```

### Optional Parameters

Use query strings for optional parameters:

```typescript
app.get('/users', async (req, context) => {
  const {
    page = '1',
    limit = '20',
    sort = 'name',
    order = 'asc'
  } = context.query;

  return await db.getUsers({
    page: parseInt(page),
    limit: parseInt(limit),
    sort,
    order
  });
});
// /users?page=2&limit=10&sort=email&order=desc
```

## Wildcard Routes

### Catch-All Routes

Use `*` to match any path segment:

```typescript
// Match all files in a directory
app.get('/files/*', async (req, context) => {
  const url = new URL(req.url);
  const filePath = url.pathname.replace('/files/', '');

  return {
    requestedFile: filePath
  };
});
// Matches: /files/doc.pdf, /files/images/photo.jpg, /files/a/b/c/file.txt

// Static file serving
app.get('/public/*', async (req) => {
  const url = new URL(req.url);
  const filePath = url.pathname.replace('/public/', '');
  const file = Bun.file(`./public/${filePath}`);

  if (await file.exists()) {
    return new Response(file);
  }

  throw app.httpErrors.notFound('File not found');
});
```

### Wildcard with Parameters

Combine wildcards with parameters:

```typescript
app.get('/users/:userId/files/*', async (req, context) => {
  const url = new URL(req.url);
  const filePath = url.pathname.replace(`/users/${context.params.userId}/files/`, '');

  return {
    userId: context.params.userId,
    filePath
  };
});
// /users/123/files/documents/report.pdf
```

## Regex Routes

### Pattern Matching

Use regular expressions for complex patterns:

```typescript
// Match versioned API paths
app.get(/^\/api\/v[0-9]+\/users$/, async (req) => {
  const url = new URL(req.url);
  const version = url.pathname.match(/v([0-9]+)/)?.[1];

  return {
    version,
    users: await db.getUsers()
  };
});
// Matches: /api/v1/users, /api/v2/users, /api/v99/users

// Match file extensions
app.get(/^\/download\/.*\.(pdf|doc|txt)$/, async (req) => {
  const url = new URL(req.url);
  const filename = url.pathname.replace('/download/', '');

  return {
    downloading: filename
  };
});
// Matches: /download/file.pdf, /download/document.doc
// Doesn't match: /download/file.exe, /download/file.jpg

// Match UUID patterns
app.get(/^\/users\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, async (req) => {
  const url = new URL(req.url);
  const userId = url.pathname.replace('/users/', '');

  return await db.getUser(userId);
});
```

### Extracting from Regex

When using regex, extract data manually:

```typescript
app.get(/^\/products\/([a-z]+)-([0-9]+)$/, async (req) => {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/products\/([a-z]+)-([0-9]+)$/);

  if (!match) {
    throw app.httpErrors.badRequest('Invalid product format');
  }

  const [, category, productId] = match;

  return {
    category,
    productId,
    product: await db.getProduct(category, productId)
  };
});
// Matches: /products/books-123, /products/electronics-456
```

## Route Chaining

### Method Chaining

Chain multiple methods for the same path:

```typescript
app.route('/users')
  .get(async () => {
    return await db.getAllUsers();
  })
  .post(async (req, context) => {
    return await db.createUser(context.body);
  })
  .delete(async () => {
    await db.deleteAllUsers();
    return { success: true };
  });
```

### Nested Resources

```typescript
// User routes
app.route('/users')
  .get(getAllUsers)
  .post(createUser);

app.route('/users/:id')
  .get(getUser)
  .put(updateUser)
  .delete(deleteUser);

// Nested posts under users
app.route('/users/:userId/posts')
  .get(getUserPosts)
  .post(createUserPost);

app.route('/users/:userId/posts/:postId')
  .get(getPost)
  .put(updatePost)
  .delete(deletePost);
```

## Route Constraints

### Host Constraints

Route based on hostname:

```typescript
app.get('/api/users', {
  constraints: {
    host: 'api.example.com'
  }
}, async () => {
  return { from: 'api subdomain' };
});

app.get('/api/users', {
  constraints: {
    host: 'admin.example.com'
  }
}, async () => {
  return { from: 'admin subdomain' };
});
```

### Version Constraints

API versioning:

```typescript
// Version 1
app.get('/users', {
  constraints: { version: '1.0' }
}, async () => {
  return { version: '1.0', users: [] };
});

// Version 2 (different format)
app.get('/users', {
  constraints: { version: '2.0' }
}, async () => {
  return {
    version: '2.0',
    data: { users: [] },
    meta: { total: 0 }
  };
});

// Client specifies version via header:
// Accept-Version: 1.0
```

### Custom Constraints

Create custom routing logic:

```typescript
app.get('/api/data', {
  constraints: {
    customCheck: (req: Request) => {
      // Only route if custom header present
      return req.headers.get('X-Internal-Api') === 'true';
    }
  }
}, async () => {
  return { internalData: 'secret' };
});
```

## Route Ordering

Routes are matched in the order they're defined. More specific routes should come first:

```typescript
// ✅ Correct order - specific to general
app.get('/users/admin', async () => {
  return { role: 'admin' };
});

app.get('/users/:id', async (req, context) => {
  return { userId: context.params.id };
});

// ❌ Wrong order - :id would match 'admin'
app.get('/users/:id', async (req, context) => {
  // This would match /users/admin
  return { userId: context.params.id };
});

app.get('/users/admin', async () => {
  // This would never be reached!
  return { role: 'admin' };
});
```

### Priority Rules

1. **Static routes** (exact matches) have highest priority
2. **Parametric routes** (`:param`) come next
3. **Wildcard routes** (`*`) have lowest priority
4. **Within same type**, first registered wins

```typescript
// Priority order:
app.get('/users/search');        // 1. Static (highest priority)
app.get('/users/:id');            // 2. Parameter
app.get('/users/*');              // 3. Wildcard (lowest priority)
```

## Advanced Patterns

### RESTful Resources

Standard CRUD pattern:

```typescript
// Collection routes
app.get('/posts', listPosts);           // GET /posts
app.post('/posts', createPost);         // POST /posts

// Member routes
app.get('/posts/:id', getPost);         // GET /posts/123
app.put('/posts/:id', replacePost);     // PUT /posts/123
app.patch('/posts/:id', updatePost);    // PATCH /posts/123
app.delete('/posts/:id', deletePost);   // DELETE /posts/123

// Nested resources
app.get('/posts/:id/comments', getPostComments);
app.post('/posts/:id/comments', createComment);
```

### Route Grouping with Prefixes

```typescript
// Manual grouping
const apiPrefix = '/api/v1';

app.get(`${apiPrefix}/users`, getUsers);
app.get(`${apiPrefix}/posts`, getPosts);
app.get(`${apiPrefix}/comments`, getComments);

// Or use a plugin for grouping
async function apiRoutes(app: Ogelfy) {
  app.get('/users', getUsers);
  app.get('/posts', getPosts);
  app.get('/comments', getComments);
}

await app.register(apiRoutes, { prefix: '/api/v1' });
```

### Pagination Pattern

```typescript
app.get('/users', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'number', minimum: 1, default: 1 },
        limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
        sort: { type: 'string', enum: ['name', 'email', 'createdAt'], default: 'name' },
        order: { type: 'string', enum: ['asc', 'desc'], default: 'asc' }
      }
    }
  }
}, async (req, context) => {
  const { page, limit, sort, order } = context.query;

  const offset = (page - 1) * limit;
  const users = await db.getUsers({ offset, limit, sort, order });
  const total = await db.getUserCount();

  return {
    data: users,
    meta: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
});
```

### Search and Filtering

```typescript
app.get('/products', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        q: { type: 'string' },              // Search query
        category: { type: 'string' },        // Filter by category
        minPrice: { type: 'number' },        // Price range
        maxPrice: { type: 'number' },
        inStock: { type: 'boolean' },        // Availability
        tags: { type: 'array', items: { type: 'string' } } // Multiple tags
      }
    }
  }
}, async (req, context) => {
  const filters = context.query;

  const products = await db.searchProducts(filters);

  return {
    products,
    filters,
    count: products.length
  };
});
// /products?q=laptop&category=electronics&minPrice=500&maxPrice=2000&inStock=true
```

### Soft Deletes

```typescript
app.delete('/posts/:id', async (req, context) => {
  const postId = context.params.id;

  // Soft delete (mark as deleted instead of removing)
  await db.updatePost(postId, {
    deletedAt: new Date().toISOString(),
    isDeleted: true
  });

  return { success: true, message: 'Post archived' };
});

// Restore endpoint
app.post('/posts/:id/restore', async (req, context) => {
  await db.updatePost(context.params.id, {
    deletedAt: null,
    isDeleted: false
  });

  return { success: true, message: 'Post restored' };
});
```

### Bulk Operations

```typescript
// Bulk create
app.post('/users/bulk', async (req, context) => {
  const users = context.body; // Array of users

  const created = await db.bulkCreateUsers(users);

  return {
    success: true,
    created: created.length
  };
});

// Bulk delete
app.delete('/users/bulk', async (req, context) => {
  const userIds = context.body.ids;

  await db.bulkDeleteUsers(userIds);

  return {
    success: true,
    deleted: userIds.length
  };
});
```

## Best Practices

### 1. Use Descriptive Paths

```typescript
// ✅ Good - Clear and RESTful
app.get('/users/:id', getUser);
app.post('/users', createUser);
app.delete('/users/:id', deleteUser);

// ❌ Bad - Unclear
app.get('/u/:i', getUser);
app.post('/new_user', createUser);
app.get('/delete/:id', deleteUser); // Should be DELETE, not GET
```

### 2. Use Correct HTTP Methods

```typescript
// ✅ Good
app.get('/users', listUsers);          // Read
app.post('/users', createUser);        // Create
app.put('/users/:id', replaceUser);    // Full update
app.patch('/users/:id', updateUser);   // Partial update
app.delete('/users/:id', deleteUser);  // Delete

// ❌ Bad - Using GET for everything
app.get('/createUser', createUser);
app.get('/deleteUser/:id', deleteUser);
```

### 3. Version Your API

```typescript
// Version in path
app.get('/api/v1/users', getUsersV1);
app.get('/api/v2/users', getUsersV2);

// Or use constraints
app.get('/api/users', {
  constraints: { version: '1.0' }
}, getUsersV1);
```

### 4. Validate Parameters

Always validate user input:

```typescript
app.get('/users/:id', {
  schema: {
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' }
      }
    }
  }
}, async (req, context) => {
  // id is guaranteed to be a valid UUID
  return await db.getUser(context.params.id);
});
```

### 5. Handle 404s Gracefully

```typescript
app.get('/users/:id', async (req, context) => {
  const user = await db.getUser(context.params.id);

  if (!user) {
    throw app.httpErrors.notFound('User not found');
  }

  return user;
});
```

## See Also

- [Getting Started Guide](./GETTING_STARTED.md)
- [Validation Guide](./VALIDATION.md)
- [API Reference](../API.md)
