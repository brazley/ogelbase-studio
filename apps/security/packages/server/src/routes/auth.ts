import type { Ogelfy } from '../../../ogelfy/src/index';
import { serviceRoleMiddleware, extractToken } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { logRequest } from '../middleware/logging';
import * as auth from '../clients/auth';
import { z } from 'zod';

/**
 * Authentication routes
 * Proxies to GoTrue service
 */

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  metadata: z.record(z.any()).optional(),
});

const SigninSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const AdminUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  email_confirm: z.boolean().optional(),
  user_metadata: z.record(z.any()).optional(),
});

export function registerAuthRoutes(app: Ogelfy) {
  /**
   * POST /api/auth/signup
   * Create a new user
   */
  app.post('/api/auth/signup', async (req) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(10, 60000)(req); // 10 signups per minute

      const body = await req.json();
      const { email, password, metadata } = SignupSchema.parse(body);

      const result = await auth.signup(email, password, metadata);

      logRequest(req, 200, Date.now() - start);
      return result;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Rate limit') ? 429 :
        error instanceof Error && error.message.includes('validation') ? 400 :
        error instanceof Error && error.message.includes('already registered') ? 409 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Signup failed');
    }
  });

  /**
   * POST /api/auth/signin
   * Sign in with email and password
   */
  app.post('/api/auth/signin', async (req) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(20, 60000)(req); // 20 signin attempts per minute

      const body = await req.json();
      const { email, password } = SigninSchema.parse(body);

      const result = await auth.signin(email, password);

      logRequest(req, 200, Date.now() - start);
      return result;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Rate limit') ? 429 :
        error instanceof Error && error.message.includes('validation') ? 400 :
        error instanceof Error && error.message.includes('Invalid') ? 401 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Sign in failed');
    }
  });

  /**
   * POST /api/auth/signout
   * Sign out (revoke token)
   */
  app.post('/api/auth/signout', async (req) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(50, 60000)(req); // 50 signouts per minute

      const token = extractToken(req);
      if (!token) {
        throw new Error('Unauthorized: Token required');
      }

      const result = await auth.signout(token);

      logRequest(req, 200, Date.now() - start);
      return result;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Unauthorized') ? 401 :
        error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Sign out failed');
    }
  });

  /**
   * GET /api/auth/user
   * Get current user from token
   */
  app.get('/api/auth/user', async (req) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(100, 60000)(req); // 100 requests per minute

      const token = extractToken(req);
      if (!token) {
        throw new Error('Unauthorized: Token required');
      }

      const result = await auth.getUser(token);

      logRequest(req, 200, Date.now() - start);
      return result;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Unauthorized') ? 401 :
        error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Get user failed');
    }
  });

  /**
   * GET /api/auth/admin/users
   * Admin: List all users
   */
  app.get('/api/auth/admin/users', async (req) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(50, 60000)(req); // 50 requests per minute
      await serviceRoleMiddleware(req);

      const url = new URL(req.url);
      const page = url.searchParams.get('page');
      const perPage = url.searchParams.get('perPage');

      const result = await auth.listUsers({
        page: page ? parseInt(page) : undefined,
        perPage: perPage ? parseInt(perPage) : undefined,
      });

      logRequest(req, 200, Date.now() - start);
      return result;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Unauthorized') ? 401 :
        error instanceof Error && error.message.includes('Forbidden') ? 403 :
        error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'List users failed');
    }
  });

  /**
   * POST /api/auth/admin/users
   * Admin: Create a new user
   */
  app.post('/api/auth/admin/users', async (req) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(20, 60000)(req); // 20 requests per minute
      await serviceRoleMiddleware(req);

      const body = await req.json();
      const userData = AdminUserSchema.parse(body);

      const result = await auth.createUser(userData);

      logRequest(req, 200, Date.now() - start);
      return result;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Unauthorized') ? 401 :
        error instanceof Error && error.message.includes('Forbidden') ? 403 :
        error instanceof Error && error.message.includes('Rate limit') ? 429 :
        error instanceof Error && error.message.includes('validation') ? 400 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Create user failed');
    }
  });

  /**
   * DELETE /api/auth/admin/users/:id
   * Admin: Delete a user
   */
  app.delete('/api/auth/admin/users/:id', async (req, context) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(20, 60000)(req); // 20 requests per minute
      await serviceRoleMiddleware(req);

      const userId = context?.params?.id;
      if (!userId) {
        throw new Error('User ID required');
      }

      const result = await auth.deleteUser(userId);

      logRequest(req, 200, Date.now() - start);
      return result;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Unauthorized') ? 401 :
        error instanceof Error && error.message.includes('Forbidden') ? 403 :
        error instanceof Error && error.message.includes('Rate limit') ? 429 :
        error instanceof Error && error.message.includes('required') ? 400 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Delete user failed');
    }
  });
}
