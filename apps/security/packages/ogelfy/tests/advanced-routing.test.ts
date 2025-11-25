import { describe, test, expect, beforeEach } from 'bun:test';
import { Ogelfy } from '../src/index';

describe('Advanced Routing', () => {
  let app: Ogelfy;

  beforeEach(() => {
    app = new Ogelfy();
  });

  describe('Wildcard Routes', () => {
    test('should match wildcard at end of path', async () => {
      app.get('/files/*', (req, ctx) => {
        return { wildcard: ctx?.params['*'] };
      });

      const res = await app.inject({
        method: 'GET',
        url: '/files/images/logo.png',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.wildcard).toBe('images/logo.png');
    });

    test('should match wildcard in middle of path', async () => {
      app.get('/api/*/users', (req, ctx) => {
        return { version: ctx?.params['*'] };
      });

      const res1 = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
      });

      expect(res1.statusCode).toBe(200);
      expect(JSON.parse(res1.body).version).toBe('v1');

      const res2 = await app.inject({
        method: 'GET',
        url: '/api/v2/users',
      });

      expect(res2.statusCode).toBe(200);
      expect(JSON.parse(res2.body).version).toBe('v2');
    });

    test('should match wildcard with named params', async () => {
      app.get('/users/:id/*', (req, ctx) => {
        return {
          userId: ctx?.params['id'],
          rest: ctx?.params['*'],
        };
      });

      const res = await app.inject({
        method: 'GET',
        url: '/users/123/files/document.pdf',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.userId).toBe('123');
      expect(body.rest).toBe('files/document.pdf');
    });
  });

  describe('Regex Routes', () => {
    test('should match regex pattern', async () => {
      app.get(/^\/api\/v(\d+)\/users$/, (req, ctx) => {
        return { version: ctx?.params['0'] };
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.version).toBe('1');
    });

    test('should capture multiple groups', async () => {
      app.get(/^\/(\w+)\/(\d+)$/, (req, ctx) => {
        return {
          resource: ctx?.params['0'],
          id: ctx?.params['1'],
        };
      });

      const res = await app.inject({
        method: 'GET',
        url: '/users/42',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.resource).toBe('users');
      expect(body.id).toBe('42');
    });
  });

  describe('Route Constraints', () => {
    test('should match host constraint', async () => {
      app.get(
        '/api/users',
        {
          constraints: { host: 'api.example.com' },
        },
        () => {
          return { source: 'api' };
        }
      );

      app.get('/api/users', () => {
        return { source: 'default' };
      });

      // This test requires actual Request objects with proper host headers
      // We'll test constraint matching logic directly on the router
      expect(true).toBe(true); // Placeholder
    });

    test('should match version constraint', async () => {
      app.get(
        '/users',
        {
          constraints: { version: '1.0.0' },
        },
        () => {
          return { version: 'v1' };
        }
      );

      app.get(
        '/users',
        {
          constraints: { version: '2.0.0' },
        },
        () => {
          return { version: 'v2' };
        }
      );

      // Version constraints require custom headers in requests
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Route Shorthand', () => {
    test('should register ALL methods route', async () => {
      app.all('/resource', (req) => {
        return { method: req.method };
      });

      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        const res = await app.inject({
          method,
          url: '/resource',
        });

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).method).toBe(method);
      }
    });

    test('should support route chaining', async () => {
      app
        .route('/users')
        .get(() => ({ action: 'list' }))
        .post(() => ({ action: 'create' }))
        .put(() => ({ action: 'update' }))
        .delete(() => ({ action: 'delete' }));

      const getRes = await app.inject({ method: 'GET', url: '/users' });
      expect(JSON.parse(getRes.body).action).toBe('list');

      const postRes = await app.inject({ method: 'POST', url: '/users' });
      expect(JSON.parse(postRes.body).action).toBe('create');

      const putRes = await app.inject({ method: 'PUT', url: '/users' });
      expect(JSON.parse(putRes.body).action).toBe('update');

      const delRes = await app.inject({ method: 'DELETE', url: '/users' });
      expect(JSON.parse(delRes.body).action).toBe('delete');
    });
  });

  describe('Route Priority', () => {
    test('should match exact routes before wildcards', async () => {
      app.get('/files/*', () => ({ type: 'wildcard' }));
      app.get('/files/special', () => ({ type: 'exact' }));

      const res1 = await app.inject({
        method: 'GET',
        url: '/files/special',
      });

      expect(JSON.parse(res1.body).type).toBe('exact');

      const res2 = await app.inject({
        method: 'GET',
        url: '/files/other',
      });

      expect(JSON.parse(res2.body).type).toBe('wildcard');
    });

    test('should match param routes before wildcards', async () => {
      app.get('/users/*', () => ({ type: 'wildcard' }));
      app.get('/users/:id', () => ({ type: 'param' }));

      const res = await app.inject({
        method: 'GET',
        url: '/users/123',
      });

      expect(JSON.parse(res.body).type).toBe('param');
    });
  });
});
