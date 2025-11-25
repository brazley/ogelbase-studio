# TypeScript Guide

Ogelfy is built with TypeScript and provides excellent type safety out of the box.

## Type-Safe Routes

### Basic Typing

```typescript
import { Ogelfy, type RouteHandler, type RouteContext } from '@security/ogelfy';

const app = new Ogelfy();

// Type-safe handler
const getUser: RouteHandler = async (req, context) => {
  // context is typed as RouteContext
  const userId: string = context.params.id;

  return {
    id: userId,
    name: 'John Doe'
  };
};

app.get('/users/:id', getUser);
```

### Custom Context Types

Extend the context with custom types:

```typescript
interface UserContext extends RouteContext {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

const handler = async (req: Request, context: UserContext) => {
  // context.user is typed
  return {
    userId: context.user.id,
    email: context.user.email
  };
};
```

### Type-Safe Body

```typescript
interface CreateUserBody {
  name: string;
  email: string;
  age?: number;
}

app.post('/users', async (req, context) => {
  // Cast body to your type
  const body = context.body as CreateUserBody;

  return {
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email,
    age: body.age || 0
  };
});
```

## Schema Types

### Inferring Types from Schemas

```typescript
import type { FromSchema } from 'json-schema-to-ts';

const userSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    email: { type: 'string' },
    age: { type: 'number' }
  },
  required: ['name', 'email']
} as const;

// Infer TypeScript type from schema
type User = FromSchema<typeof userSchema>;
// Result: { name: string; email: string; age?: number }

app.post('/users', {
  schema: {
    body: userSchema
  }
}, async (req, context) => {
  const user = context.body as User;

  return {
    id: crypto.randomUUID(),
    ...user
  };
});
```

## Plugin Types

### Typed Plugins

```typescript
import type { Ogelfy } from '@security/ogelfy';

interface AuthPluginOptions {
  secret: string;
  expiresIn?: string;
}

interface AuthDecorator {
  authenticate(token: string): Promise<any>;
  signToken(payload: any): string;
}

async function authPlugin(
  app: Ogelfy,
  options: AuthPluginOptions
): Promise<void> {
  const { secret, expiresIn = '7d' } = options;

  // Type-safe decorator
  const auth: AuthDecorator = {
    authenticate: async (token: string) => {
      // Implementation
      return { userId: '123' };
    },
    signToken: (payload: any) => {
      // Implementation
      return 'token';
    }
  };

  app.decorate('auth', auth);
}

// Usage
await app.register(authPlugin, {
  secret: 'my-secret'
});

// TypeScript knows about auth decorator
const user = await app.auth.authenticate('token');
```

### Extending App Type

```typescript
// Declare module augmentation
declare module '@security/ogelfy' {
  interface Ogelfy {
    // Add custom properties
    db: Database;
    auth: {
      authenticate(token: string): Promise<User>;
      signToken(payload: any): string;
    };
  }

  // Extend request type
  interface HookRequest extends Request {
    user?: User;
    session?: Session;
  }
}

// Now TypeScript knows about these properties
app.db.query('SELECT * FROM users');
app.auth.authenticate('token');
```

## Generic Handlers

### Reusable Typed Handlers

```typescript
// Generic CRUD handler factory
function createCrudHandlers<T>(
  resource: string,
  repository: Repository<T>
) {
  return {
    list: (async (req, context) => {
      const items = await repository.findAll();
      return { [resource]: items };
    }) as RouteHandler,

    get: (async (req, context) => {
      const item = await repository.findById(context.params.id);
      if (!item) {
        throw app.httpErrors.notFound(`${resource} not found`);
      }
      return item;
    }) as RouteHandler,

    create: (async (req, context) => {
      const item = await repository.create(context.body as T);
      return item;
    }) as RouteHandler
  };
}

// Usage
interface User {
  id: string;
  name: string;
  email: string;
}

const userHandlers = createCrudHandlers<User>('users', userRepository);

app.get('/users', userHandlers.list);
app.get('/users/:id', userHandlers.get);
app.post('/users', userHandlers.create);
```

## Type-Safe Configuration

```typescript
import type { OgelfyOptions } from '@security/ogelfy';

const config: OgelfyOptions = {
  bodyLimit: 1024 * 1024, // 1MB
  schemaCompiler: {
    coerceTypes: true,
    useDefaults: true
  }
};

const app = new Ogelfy(config);
```

## Request/Response Types

### Typed Request Headers

```typescript
interface CustomHeaders {
  'x-api-key': string;
  'x-user-id': string;
}

app.get('/protected', async (req) => {
  const apiKey = req.headers.get('x-api-key') as string;
  const userId = req.headers.get('x-user-id') as string;

  return { apiKey, userId };
});
```

### Typed Responses

```typescript
interface UserResponse {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

app.get('/users/:id', async (req, context): Promise<UserResponse> => {
  const user = await db.getUser(context.params.id);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
});
```

## Hook Types

### Typed Hooks

```typescript
import type { HookHandler, HookRequest, Reply } from '@security/ogelfy';

const authHook: HookHandler = async (req: HookRequest, reply: Reply) => {
  const token = req.headers.get('authorization');

  if (!token) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  // Attach user to request
  req.user = await verifyToken(token);
};

app.addHook('preHandler', authHook);
```

## Error Types

### Typed Errors

```typescript
import { HttpError, httpErrors } from '@security/ogelfy';

app.get('/users/:id', async (req, context) => {
  const user = await db.getUser(context.params.id);

  if (!user) {
    // Type-safe error
    throw httpErrors.notFound('User not found');
  }

  return user;
});

// Custom typed error
class ValidationError extends HttpError {
  constructor(message: string, public fields: string[]) {
    super(400, message);
    this.name = 'ValidationError';
  }
}

throw new ValidationError('Invalid fields', ['email', 'age']);
```

## Testing Types

### Typed Test Helpers

```typescript
import { describe, test, expect } from 'bun:test';
import type { InjectOptions, InjectResponse } from '@security/ogelfy';

describe('User API', () => {
  test('creates user', async () => {
    const options: InjectOptions = {
      method: 'POST',
      url: '/users',
      body: {
        name: 'Alice',
        email: 'alice@example.com'
      }
    };

    const response: InjectResponse = await app.inject(options);

    expect(response.statusCode).toBe(200);

    const user = response.json() as User;
    expect(user.name).toBe('Alice');
  });
});
```

## Advanced Patterns

### Conditional Types

```typescript
type RouteMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type RouteConfig<M extends RouteMethod> = {
  method: M;
  path: string;
} & (M extends 'GET' ? {} : { body: any });

// POST requires body
const postConfig: RouteConfig<'POST'> = {
  method: 'POST',
  path: '/users',
  body: { name: 'Alice' }
};

// GET doesn't need body
const getConfig: RouteConfig<'GET'> = {
  method: 'GET',
  path: '/users'
};
```

### Generic Validators

```typescript
function createValidator<T>(schema: any) {
  return (data: unknown): data is T => {
    // Validation logic
    return true;
  };
}

interface User {
  name: string;
  email: string;
}

const isUser = createValidator<User>({
  type: 'object',
  properties: {
    name: { type: 'string' },
    email: { type: 'string', format: 'email' }
  }
});

app.post('/users', async (req, context) => {
  if (!isUser(context.body)) {
    throw app.httpErrors.badRequest('Invalid user data');
  }

  // context.body is now typed as User
  return await db.createUser(context.body);
});
```

## Best Practices

### 1. Use Const Assertions

```typescript
const userSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    email: { type: 'string' }
  }
} as const; // Make it readonly
```

### 2. Define Interfaces for Data Models

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
}

interface CreateUserInput {
  name: string;
  email: string;
  role?: 'user' | 'admin';
}

interface UpdateUserInput {
  name?: string;
  email?: string;
}
```

### 3. Use Type Guards

```typescript
function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

app.post('/users', async (req, context) => {
  if (!isValidEmail(context.body.email)) {
    throw app.httpErrors.badRequest('Invalid email');
  }

  // email is typed as string
  return { email: context.body.email };
});
```

### 4. Strict Mode

Enable strict TypeScript:

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitAny": true,
    "noImplicitThis": true
  }
}
```

### 5. Use Discriminated Unions

```typescript
type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

app.get('/users/:id', async (req, context): Promise<ApiResponse<User>> => {
  const user = await db.getUser(context.params.id);

  if (!user) {
    return {
      success: false,
      error: 'User not found'
    };
  }

  return {
    success: true,
    data: user
  };
});
```

## Common Issues

### Issue: Context Body Not Typed

```typescript
// ❌ Bad - No type safety
app.post('/users', async (req, context) => {
  const name = context.body.name; // any
});

// ✅ Good - Type assertion
interface CreateUserBody {
  name: string;
  email: string;
}

app.post('/users', async (req, context) => {
  const body = context.body as CreateUserBody;
  const name = body.name; // string
});
```

### Issue: Plugin Decorators Not Typed

```typescript
// Add type declarations
declare module '@security/ogelfy' {
  interface Ogelfy {
    myPlugin: MyPluginType;
  }
}

// Now TypeScript knows about it
app.myPlugin.method();
```

### Issue: Generic Route Handlers

```typescript
// Use type assertion for generic handlers
const createHandler = <T>() => {
  return (async (req, context) => {
    const data = context.body as T;
    return data;
  }) as RouteHandler;
};
```

## See Also

- [API Reference](./API.md)
- [Getting Started](./guides/GETTING_STARTED.md)
- [Validation Guide](./guides/VALIDATION.md)
