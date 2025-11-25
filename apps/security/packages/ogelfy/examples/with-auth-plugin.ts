/**
 * Authentication Plugin Example
 *
 * Demonstrates:
 * - Creating a plugin
 * - Adding decorators
 * - Using lifecycle hooks
 * - JWT authentication
 * - Protected routes
 *
 * Run: bun run examples/with-auth-plugin.ts
 */

import { Ogelfy, fp } from '../src/index';
import type { Request } from 'bun';

// Simple JWT helpers (in production, use a proper library)
const JWT_SECRET = 'your-secret-key-change-in-production';

function createToken(payload: any): string {
  // Simplified JWT (use jsonwebtoken in production)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = Buffer.from(`${header}.${body}.${JWT_SECRET}`).toString('base64url');

  return `${header}.${body}.${signature}`;
}

function verifyToken(token: string): any {
  try {
    const [header, payload] = token.split('.');
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
}

// Mock user database
const users = new Map([
  ['alice@example.com', { id: '1', email: 'alice@example.com', password: 'password123', role: 'admin' }],
  ['bob@example.com', { id: '2', email: 'bob@example.com', password: 'password456', role: 'user' }],
]);

// Authentication Plugin
interface AuthOptions {
  secret: string;
  publicRoutes?: string[];
}

const authPlugin = fp(async function (app: Ogelfy, options: AuthOptions) {
  const { publicRoutes = [] } = options;

  // Add authentication methods to app
  app.decorate('authenticate', async (req: Request) => {
    const authHeader = req.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      throw app.httpErrors.unauthorized('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    if (!payload) {
      throw app.httpErrors.unauthorized('Invalid token');
    }

    return payload;
  });

  app.decorate('signToken', (payload: any): string => {
    return createToken(payload);
  });

  // Add user decorator to requests
  app.decorateRequest('user', null);

  // Global authentication hook
  app.addHook('preHandler', async (req, reply) => {
    const url = new URL(req.url);

    // Skip public routes
    if (publicRoutes.includes(url.pathname)) {
      return;
    }

    // Authenticate all other routes
    try {
      req.user = await app.authenticate(req);
    } catch (error: any) {
      reply.status(error.statusCode || 401).send({
        error: error.message || 'Unauthorized'
      });
    }
  });

  // Auth routes
  app.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 }
        },
        required: ['email', 'password']
      }
    }
  }, async (req, context) => {
    const { email, password } = context.body;

    // Verify credentials
    const user = users.get(email);

    if (!user || user.password !== password) {
      throw app.httpErrors.unauthorized('Invalid email or password');
    }

    // Generate token
    const token = app.signToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    };
  });

  app.get('/auth/me', async (req) => {
    return {
      user: req.user
    };
  });

  app.post('/auth/logout', async () => {
    return {
      message: 'Logged out successfully'
    };
  });
}, {
  name: 'auth-plugin',
  version: '1.0.0'
});

// Application
const app = new Ogelfy();

// Register auth plugin
await app.register(authPlugin, {
  secret: JWT_SECRET,
  publicRoutes: ['/auth/login', '/health', '/']
});

// Public routes
app.get('/', async () => {
  return {
    message: 'Public API',
    endpoints: {
      login: 'POST /auth/login',
      me: 'GET /auth/me (requires auth)',
      profile: 'GET /profile (requires auth)',
      admin: 'GET /admin (requires admin role)'
    }
  };
});

app.get('/health', async () => {
  return { status: 'ok' };
});

// Protected routes (require authentication)
app.get('/profile', async (req) => {
  return {
    message: 'Your profile',
    user: req.user
  };
});

app.get('/data', async (req) => {
  return {
    message: 'Protected data',
    userId: req.user.userId,
    data: [1, 2, 3, 4, 5]
  };
});

// Admin-only route
app.get('/admin', async (req, reply) => {
  if (req.user.role !== 'admin') {
    reply.status(403).send({
      error: 'Forbidden',
      message: 'Admin access required'
    });
    return;
  }

  return {
    message: 'Admin area',
    users: Array.from(users.values()).map(u => ({
      id: u.id,
      email: u.email,
      role: u.role
    }))
  };
});

const PORT = 3002;
await app.listen({ port: PORT });

console.log(`
🚀 Auth example running on http://localhost:${PORT}

Test credentials:
  alice@example.com / password123 (admin)
  bob@example.com / password456 (user)

Try these commands:

1. Login as Alice:
curl -X POST http://localhost:${PORT}/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"alice@example.com","password":"password123"}'

2. Save the token and use it:
TOKEN="<token-from-step-1>"

3. Get your profile:
curl http://localhost:${PORT}/auth/me \\
  -H "Authorization: Bearer $TOKEN"

4. Access protected data:
curl http://localhost:${PORT}/data \\
  -H "Authorization: Bearer $TOKEN"

5. Access admin area (Alice only):
curl http://localhost:${PORT}/admin \\
  -H "Authorization: Bearer $TOKEN"

6. Try without token (should fail):
curl http://localhost:${PORT}/profile
`);
