/**
 * ZKEB API Server - Enhanced version with proper status codes
 * Built with Bun runtime and custom middleware
 */
import { env } from '../config/env';
import { authMiddleware, generateToken } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { corsHeaders } from '../middleware/cors';
import { logRequest } from '../middleware/logging';

// Route handlers
async function healthHandler(req: Request): Promise<Response> {
  return new Response(JSON.stringify({
    status: 'ok',
    uptime: process.uptime(),
    version: '0.1.0',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function backupsHandler(req: Request): Promise<Response> {
  const start = Date.now();

  try {
    await rateLimitMiddleware(100, 900000)(req);
    const auth = await authMiddleware(req);

    const response = { backups: [], userId: auth.userId };

    logRequest(req, 200, Date.now() - start);
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(req.headers.get('origin'))
      }
    });
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 :
                   error instanceof Error && error.message.includes('Rate limit') ? 429 : 500;
    const message = error instanceof Error ? error.message : 'Unknown error';

    logRequest(req, status, Date.now() - start);
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Simple router
const routes = new Map<string, (req: Request) => Promise<Response>>([
  ['/health', healthHandler],
  ['/api/backups', backupsHandler],
]);

// Start server
const server = Bun.serve({
  port: env.PORT,
  hostname: 'localhost',
  fetch: async (req) => {
    const url = new URL(req.url);
    const handler = routes.get(url.pathname);

    if (!handler) {
      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      return await handler(req);
    } catch (error) {
      console.error('Unhandled error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
});

console.log(`🚀 ZKEB Server on http://localhost:${env.PORT}`);
console.log(`   - Health: http://localhost:${env.PORT}/health`);
console.log(`   - API: http://localhost:${env.PORT}/api/backups`);
