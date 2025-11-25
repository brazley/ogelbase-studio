import { Ogelfy } from '../../packages/ogelfy/src/index';
import { env } from '../config/env';
import { authMiddleware, generateToken } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { corsHeaders } from '../middleware/cors';
import { logRequest } from '../middleware/logging';

// Import route registrations
import { registerDbRoutes } from '../routes/db';
import { registerAuthRoutes } from '../routes/auth';
import { registerStorageRoutes } from '../routes/storage';
import { registerHealthRoutes } from '../routes/health';
import { registerWebhookRoutes } from '../routes/webhooks';
import { ensurePlatformUsersTable } from '../clients/platform';

// Custom error class for HTTP errors
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

const app = new Ogelfy();

// Register all route modules
registerHealthRoutes(app);
registerDbRoutes(app);
registerAuthRoutes(app);
registerStorageRoutes(app);
registerWebhookRoutes(app);

// Protected endpoint example (legacy, kept for backwards compatibility)
app.get('/api/backups', async (req) => {
  const start = Date.now();

  try {
    await rateLimitMiddleware(100, 900000)(req);
    const auth = await authMiddleware(req);

    const response = { backups: [], userId: auth.userId };

    logRequest(req, 200, Date.now() - start);
    return response;
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 :
                   error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;

    logRequest(req, status, Date.now() - start);

    // Throw HttpError so Ogelfy can catch it
    throw new HttpError(status, error instanceof Error ? error.message : 'Unknown error');
  }
});

// Ensure platform schema exists before starting
try {
  await ensurePlatformUsersTable();
  console.log('✅ Platform schema initialized');
} catch (err) {
  console.warn('⚠️  Could not initialize platform schema:', err);
}

await app.listen({ port: env.PORT });
console.log(`🚀 BunBun API Gateway running on http://localhost:${env.PORT}`);
console.log(`📊 Services: Database, Auth, Storage, Meta, Webhooks`);
console.log(`🔒 Security: JWT auth, rate limiting, CORS enabled`);
