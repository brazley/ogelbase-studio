import { Ogelfy } from '../../../ogelfy/src/index';
import { env } from '../config/env';
import { authMiddleware, generateToken } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { corsHeaders } from '../middleware/cors';
import { logRequest } from '../middleware/logging';

// Custom error class for HTTP errors
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

const app = new Ogelfy();

// Health check (no auth)
app.get('/health', async (req) => {
  return {
    status: 'ok',
    uptime: process.uptime(),
    version: '0.1.0',
  };
});

// Protected endpoint example
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

await app.listen({ port: env.PORT });
console.log(`🚀 ZKEB Server on http://localhost:${env.PORT}`);
