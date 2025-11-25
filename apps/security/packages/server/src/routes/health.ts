import type { Ogelfy } from '../../../ogelfy/src/index';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { logRequest } from '../middleware/logging';
import * as db from '../clients/postgres';
import * as auth from '../clients/auth';
import * as storage from '../clients/storage';
import * as meta from '../clients/meta';

/**
 * Health check routes
 */

export function registerHealthRoutes(app: Ogelfy) {
  /**
   * GET /health
   * Overall service health
   */
  app.get('/health', async (req) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(100, 60000)(req); // 100 requests per minute

      const response = {
        status: 'ok',
        uptime: process.uptime(),
        version: '0.1.0',
        timestamp: new Date().toISOString(),
      };

      logRequest(req, 200, Date.now() - start);
      return response;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Health check failed');
    }
  });

  /**
   * GET /api/health/services
   * Check health of all connected services
   */
  app.get('/api/health/services', async (req) => {
    const start = Date.now();

    try {
      await rateLimitMiddleware(50, 60000)(req); // 50 requests per minute

      // Check all services in parallel
      const [postgresHealth, authHealth, storageHealth, metaHealth] = await Promise.all([
        db.checkHealth(),
        auth.checkHealth(),
        storage.checkHealth(),
        meta.checkHealth(),
      ]);

      const allHealthy =
        postgresHealth.connected &&
        authHealth.connected &&
        storageHealth.connected &&
        metaHealth.connected;

      const response = {
        status: allHealthy ? 'ok' : 'degraded',
        services: {
          postgres: {
            status: postgresHealth.connected ? 'up' : 'down',
            latency: postgresHealth.latency,
            error: 'error' in postgresHealth ? postgresHealth.error : undefined,
          },
          auth: {
            status: authHealth.connected ? 'up' : 'down',
            latency: authHealth.latency,
            error: 'error' in authHealth ? authHealth.error : undefined,
          },
          storage: {
            status: storageHealth.connected ? 'up' : 'down',
            latency: storageHealth.latency,
            error: 'error' in storageHealth ? storageHealth.error : undefined,
          },
          meta: {
            status: metaHealth.connected ? 'up' : 'down',
            latency: metaHealth.latency,
            error: 'error' in metaHealth ? metaHealth.error : undefined,
          },
        },
        timestamp: new Date().toISOString(),
      };

      const statusCode = allHealthy ? 200 : 503;
      logRequest(req, statusCode, Date.now() - start);
      return response;
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

      logRequest(req, status, Date.now() - start);
      throw new Error(error instanceof Error ? error.message : 'Services health check failed');
    }
  });
}
