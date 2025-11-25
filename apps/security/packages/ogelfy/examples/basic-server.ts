/**
 * Basic Ogelfy Server Example
 *
 * Demonstrates:
 * - Simple route registration
 * - Route parameters
 * - Query parameters
 * - JSON responses
 *
 * Run: bun run examples/basic-server.ts
 * Test: curl http://localhost:3000/hello
 */

import { Ogelfy } from '../src/index';

const app = new Ogelfy();

// Simple GET route
app.get('/', async () => {
  return {
    message: 'Welcome to Ogelfy!',
    docs: 'https://github.com/your-repo/ogelfy'
  };
});

// Route with response
app.get('/hello', async () => {
  return { message: 'Hello Ogelfy!' };
});

// Route with parameter
app.get('/greet/:name', async (req, context) => {
  return {
    message: `Hello, ${context.params.name}!`,
    timestamp: new Date().toISOString()
  };
});

// Route with query parameters
app.get('/search', async (req, context) => {
  const { q, limit = '10' } = context.query;

  return {
    query: q,
    limit: parseInt(limit),
    results: []
  };
});

// Multiple parameters
app.get('/users/:userId/posts/:postId', async (req, context) => {
  return {
    userId: context.params.userId,
    postId: context.params.postId
  };
});

// POST route
app.post('/echo', async (req, context) => {
  return {
    received: context.body,
    timestamp: new Date().toISOString()
  };
});

// Health check
app.get('/health', async () => {
  return {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
});

// Start server
const PORT = 3000;
await app.listen({ port: PORT });

console.log(`
🚀 Ogelfy server running on http://localhost:${PORT}

Try these endpoints:
  GET  http://localhost:${PORT}/
  GET  http://localhost:${PORT}/hello
  GET  http://localhost:${PORT}/greet/World
  GET  http://localhost:${PORT}/search?q=ogelfy&limit=5
  GET  http://localhost:${PORT}/users/123/posts/456
  POST http://localhost:${PORT}/echo (with JSON body)
  GET  http://localhost:${PORT}/health
`);
