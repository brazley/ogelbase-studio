import type { Ogelfy } from '../../packages/ogelfy/src/index';
import { serviceRoleMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { logRequest } from '../middleware/logging';
import * as db from '../clients/postgres';
import { z } from 'zod';

/**
 * Database operation routes
 * ALL routes require service_role authentication
 */

const QuerySchema = z.object({
  sql: z.string().min(1),
  params: z.array(z.any()).optional(),
});

const MigrateSchema = z.object({
  name: z.string().min(1),
  sql: z.string().min(1),
});

export function registerDbRoutes(app: Ogelfy) {
  /**
   * POST /api/db/query
   * Execute raw SQL query
   */
  app.post('/api/db/query', async (req) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(20, 60000)(req); // 20 requests per minute
      await serviceRoleMiddleware(req);

      const body = await req.json();
      const { sql, params } = QuerySchema.parse(body);

      const result = await db.query(sql, params);

      logRequest(req, 200, Date.now() - start);
      return result;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Unauthorized') ? 401 :
        error instanceof Error && error.message.includes('Forbidden') ? 403 :
        error instanceof Error && error.message.includes('Rate limit') ? 429 :
        error instanceof Error && error.message.includes('validation') ? 400 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Query failed');
    }
  });

  /**
   * POST /api/db/migrate
   * Run a database migration
   */
  app.post('/api/db/migrate', async (req) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(10, 60000)(req); // 10 migrations per minute
      await serviceRoleMiddleware(req);

      const body = await req.json();
      const { name, sql } = MigrateSchema.parse(body);

      const result = await db.migrate(name, sql);

      logRequest(req, 200, Date.now() - start);
      return result;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Unauthorized') ? 401 :
        error instanceof Error && error.message.includes('Forbidden') ? 403 :
        error instanceof Error && error.message.includes('Rate limit') ? 429 :
        error instanceof Error && error.message.includes('validation') ? 400 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Migration failed');
    }
  });

  /**
   * GET /api/db/tables
   * List all tables in specified schemas
   */
  app.get('/api/db/tables', async (req) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(50, 60000)(req); // 50 requests per minute
      await serviceRoleMiddleware(req);

      const url = new URL(req.url);
      const schemasParam = url.searchParams.get('schemas');
      const schemas = schemasParam ? schemasParam.split(',') : ['public'];

      const tables = await db.getTables(schemas);

      logRequest(req, 200, Date.now() - start);
      return { tables };
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Unauthorized') ? 401 :
        error instanceof Error && error.message.includes('Forbidden') ? 403 :
        error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Failed to list tables');
    }
  });

  /**
   * GET /api/db/health
   * Check database connection health
   */
  app.get('/api/db/health', async (req) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(100, 60000)(req); // 100 requests per minute

      const health = await db.checkHealth();

      logRequest(req, health.connected ? 200 : 503, Date.now() - start);
      return health;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Health check failed');
    }
  });
}
