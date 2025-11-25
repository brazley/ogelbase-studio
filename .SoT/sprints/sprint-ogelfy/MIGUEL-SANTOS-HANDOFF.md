# Miguel Santos Deployment - ZKEB Server Build

**Ticket**: OGELFY-02
**Sprint**: sprint-ogelfy
**Status**: Ready to Execute (OGELFY-01 Complete ✅)
**Deployed By**: Dylan Torres
**Deployed At**: 2025-11-22

---

## Mission

Build the ZKEB API server using the Ogelfy framework with 4 production-ready middleware plugins:
1. JWT Authentication
2. Rate Limiting (100 req/15min)
3. CORS Support
4. Structured Logging

**Working Directory**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/server/`

**Ogelfy Framework**: `../ogelfy/src/index.ts` (✅ Built, tests passing)

---

## Dependencies Status

✅ **OGELFY-01 Complete**: Jordan Kim delivered core framework
- Ogelfy class with routing ✅
- HTTP methods (GET, POST, PUT, DELETE) ✅
- Path parameters ✅
- Plugin system ✅
- Tests passing (2/2) ✅

**You're unblocked. Build now.**

---

## Architecture

```
server/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts              # Main server entry point
│   ├── config/
│   │   └── env.ts            # Environment validation (Zod)
│   └── middleware/
│       ├── auth.ts           # JWT authentication
│       ├── rate-limit.ts     # Rate limiting (in-memory)
│       ├── cors.ts           # CORS configuration
│       └── logging.ts        # Structured JSON logging
└── __tests__/
    └── server.test.ts        # Integration tests
```

---

## Implementation Plan

### Step 1: Package Setup
Create `package.json`:
```json
{
  "name": "@security/server",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "bun run --hot src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "@security/ogelfy": "workspace:*",
    "zod": "^3.22.4",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/jsonwebtoken": "^9.0.5"
  }
}
```

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Step 2: Environment Config

`src/config/env.ts`:
```typescript
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url().optional(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

export const env = envSchema.parse(process.env);
```

`.env.example`:
```bash
PORT=3000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-must-be-at-least-32-characters-long
ALLOWED_ORIGINS=http://localhost:3000
```

### Step 3: JWT Auth Middleware

`src/middleware/auth.ts`:
```typescript
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthContext {
  userId: string;
  deviceId: string;
}

export async function authMiddleware(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7); // Remove 'Bearer '

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthContext;
    return decoded;
  } catch (error) {
    throw new Error('Unauthorized: Invalid token');
  }
}

export function generateToken(userId: string, deviceId: string): string {
  return jwt.sign(
    { userId, deviceId },
    env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}
```

### Step 4: Rate Limiting Middleware

`src/middleware/rate-limit.ts`:
```typescript
// In-memory rate limiter (production should use Redis)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitOptions {
  limit: number;       // Max requests
  window: number;      // Time window in ms
}

export function rateLimitMiddleware(options: RateLimitOptions) {
  return async (req: Request) => {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();

    const record = rateLimitStore.get(ip);

    if (!record || now > record.resetAt) {
      rateLimitStore.set(ip, {
        count: 1,
        resetAt: now + options.window,
      });
      return;
    }

    if (record.count >= options.limit) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter}s`);
    }

    record.count++;
  };
}
```

### Step 5: CORS Middleware

`src/middleware/cors.ts`:
```typescript
import { env } from '../config/env';

export function corsMiddleware(req: Request, response: Response): Response {
  const origin = req.headers.get('origin');
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',');

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: response.headers });
  }

  return response;
}
```

### Step 6: Logging Middleware

`src/middleware/logging.ts`:
```typescript
export function loggingMiddleware(req: Request, startTime: number) {
  return (response: Response) => {
    const duration = Date.now() - startTime;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: new URL(req.url).pathname,
      status: response.status,
      duration: `${duration}ms`,
      userAgent: req.headers.get('user-agent'),
    }));
  };
}
```

### Step 7: Main Server

`src/index.ts`:
```typescript
import { Ogelfy } from '@security/ogelfy';
import { env } from './config/env';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { corsMiddleware } from './middleware/cors';
import { loggingMiddleware } from './middleware/logging';

const app = new Ogelfy();

// Health check endpoint (no auth required)
app.get('/health', async (req) => {
  return {
    status: 'ok',
    uptime: process.uptime(),
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  };
});

// Protected route example
app.get('/api/backups', async (req) => {
  const startTime = Date.now();

  try {
    // Rate limiting
    await rateLimitMiddleware({ limit: 100, window: 900000 })(req);

    // Authentication
    const auth = await authMiddleware(req);

    // Business logic (mock for now)
    const backups = [
      { id: '1', userId: auth.userId, createdAt: new Date().toISOString() },
    ];

    const response = new Response(JSON.stringify(backups), {
      headers: { 'Content-Type': 'application/json' },
    });

    // CORS
    const corsResponse = corsMiddleware(req, response);

    // Logging
    loggingMiddleware(req, startTime)(corsResponse);

    return corsResponse;
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: error.message.includes('Unauthorized') ? 401 :
             error.message.includes('Rate limit') ? 429 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Start server
const server = await app.listen({ port: env.PORT });
console.log(`🚀 ZKEB Server running on http://localhost:${env.PORT}`);
```

### Step 8: Tests

`__tests__/server.test.ts`:
```typescript
import { describe, test, expect } from 'bun:test';

describe('ZKEB Server', () => {
  test('health check returns ok', async () => {
    const res = await fetch('http://localhost:3000/health');
    const data = await res.json();

    expect(data.status).toBe('ok');
    expect(data.version).toBe('0.1.0');
  });
});
```

---

## Deliverables

Create these files in order:
1. ✅ `package.json` + `tsconfig.json`
2. ✅ `src/config/env.ts`
3. ✅ `src/middleware/auth.ts`
4. ✅ `src/middleware/rate-limit.ts`
5. ✅ `src/middleware/cors.ts`
6. ✅ `src/middleware/logging.ts`
7. ✅ `src/index.ts`
8. ✅ `.env.example`
9. ✅ `__tests__/server.test.ts`

---

## Acceptance Criteria

**Functional**:
- [ ] Health check working at `/health`
- [ ] JWT authentication validates tokens
- [ ] Rate limiting enforces 100 req/15min
- [ ] CORS headers set correctly
- [ ] OPTIONS requests handled (preflight)
- [ ] Structured JSON logging on every request
- [ ] Environment validated on startup

**Quality**:
- [ ] Server starts without errors
- [ ] Tests passing
- [ ] No TypeScript errors
- [ ] Error responses include proper status codes (401, 429, 500)

**Security**:
- [ ] JWT verification working
- [ ] Rate limiting prevents abuse
- [ ] CORS configured correctly

---

## Testing Instructions

```bash
# 1. Navigate to server directory
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/server

# 2. Install dependencies
bun install

# 3. Create .env file
cp .env.example .env
# Edit .env with a real JWT secret (32+ chars)

# 4. Run server
bun run dev

# 5. Test health check
curl http://localhost:3000/health

# 6. Run tests
bun test
```

---

## Reference Materials

**Ogelfy Framework**:
- Location: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/`
- API: Check `src/index.ts` for Ogelfy class methods
- Tests: See `__tests__/index.test.ts` for usage examples

**Crypto Package** (if needed for JWT utilities):
- Location: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/crypto/`

---

## Miguel's Focus Areas

1. **Middleware Quality**: Each plugin must be production-ready
2. **Security First**: JWT validation and rate limiting are critical
3. **Error Handling**: Proper status codes and error messages
4. **Logging**: Structured JSON for observability
5. **Developer Experience**: Clear error messages, easy to test

---

## Questions or Blockers?

**TPM**: Dylan Torres (immediate response)
**Framework Questions**: Jordan Kim (Ogelfy architect)

---

## Execution Timeline

**Estimated**: 4-6 hours
**Start**: Now
**Complete By**: End of day

---

**Let's ship this. Build the ZKEB server, Miguel.**
