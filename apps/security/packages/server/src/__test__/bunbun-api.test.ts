/**
 * BunBun API Gateway Tests
 * Run with: bun test
 */

import { describe, test, expect } from 'bun:test';

describe('BunBun API Gateway', () => {
  const BASE_URL = 'http://localhost:3000';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

  test('Health check endpoint', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data).toHaveProperty('uptime');
    expect(data).toHaveProperty('version');
  });

  test('Services health check', async () => {
    const response = await fetch(`${BASE_URL}/api/health/services`);
    const data = await response.json();

    expect(response.status).toBeOneOf([200, 503]);
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('services');
    expect(data.services).toHaveProperty('postgres');
    expect(data.services).toHaveProperty('auth');
    expect(data.services).toHaveProperty('storage');
    expect(data.services).toHaveProperty('meta');
  });

  test('Database query requires service_role', async () => {
    const response = await fetch(`${BASE_URL}/api/db/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql: 'SELECT 1',
      }),
    });

    expect(response.status).toBe(401);
  });

  test('Database query with service_role', async () => {
    if (!SERVICE_KEY) {
      console.log('Skipping service_role test (no key)');
      return;
    }

    const response = await fetch(`${BASE_URL}/api/db/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        sql: 'SELECT 1 as test',
      }),
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('rows');
    expect(data).toHaveProperty('rowCount');
    expect(data).toHaveProperty('latency');
  });

  test('Auth signup endpoint exists', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
      }),
    });

    // Should return 200 or error (depending on if user exists)
    // But shouldn't be 404
    expect(response.status).not.toBe(404);
  });

  test('Storage list buckets requires auth', async () => {
    const response = await fetch(`${BASE_URL}/api/storage/buckets`);

    expect(response.status).toBe(401);
  });
});
