import { describe, it, expect } from 'bun:test';
import { Ogelfy, Schemas } from '../src';

describe('Ogelfy Integration - Content Parsing & Serialization', () => {
  describe('JSON content-type', () => {
    it('should parse JSON request and serialize response', async () => {
      const app = new Ogelfy();

      app.post('/users', async (req, context) => {
        // Body is automatically parsed
        expect(context?.body).toEqual({
          name: 'John Doe',
          email: 'john@example.com'
        });

        return {
          id: '123',
          name: context?.body.name,
          email: context?.body.email,
          createdAt: new Date('2024-01-01T00:00:00.000Z')
        };
      });

      const server = await app.listen({ port: 3001 });

      try {
        const response = await fetch('http://localhost:3001/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'John Doe',
            email: 'john@example.com'
          })
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.id).toBe('123');
        expect(data.name).toBe('John Doe');
        expect(data.createdAt).toBe('2024-01-01T00:00:00.000Z');
      } finally {
        await app.close();
      }
    });
  });

  describe('URL-encoded content-type', () => {
    it('should parse form data', async () => {
      const app = new Ogelfy();

      app.post('/login', async (req, context) => {
        expect(context?.body).toEqual({
          username: 'john',
          password: 'secret123'
        });

        return {
          success: true,
          token: 'jwt-token-here'
        };
      });

      const server = await app.listen({ port: 3002 });

      try {
        const response = await fetch('http://localhost:3002/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'username=john&password=secret123'
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
      } finally {
        await app.close();
      }
    });
  });

  describe('Query parameters', () => {
    it('should parse query parameters', async () => {
      const app = new Ogelfy();

      app.get('/search', async (req, context) => {
        expect(context?.query).toEqual({
          q: 'test',
          page: '1',
          limit: '10'
        });

        return {
          results: [],
          page: parseInt(context?.query.page || '1'),
          total: 0
        };
      });

      const server = await app.listen({ port: 3003 });

      try {
        const response = await fetch('http://localhost:3003/search?q=test&page=1&limit=10');

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.page).toBe(1);
      } finally {
        await app.close();
      }
    });
  });

  describe('Route params', () => {
    it('should parse route parameters', async () => {
      const app = new Ogelfy();

      app.get('/users/:id', async (req, context) => {
        expect(context?.params.id).toBe('123');

        return {
          id: context?.params.id,
          name: 'John Doe'
        };
      });

      const server = await app.listen({ port: 3004 });

      try {
        const response = await fetch('http://localhost:3004/users/123');

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.id).toBe('123');
      } finally {
        await app.close();
      }
    });
  });

  describe('Plain text content-type', () => {
    it('should parse plain text', async () => {
      const app = new Ogelfy();

      app.post('/echo', async (req, context) => {
        expect(typeof context?.body).toBe('string');
        expect(context?.body).toBe('Hello, World!');

        return {
          message: 'Received',
          length: context?.body.length
        };
      });

      const server = await app.listen({ port: 3005 });

      try {
        const response = await fetch('http://localhost:3005/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'Hello, World!'
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe('Received');
        expect(data.length).toBe(13);
      } finally {
        await app.close();
      }
    });
  });

  describe('Binary content-type', () => {
    it('should parse binary data', async () => {
      const app = new Ogelfy();

      app.post('/upload', async (req, context) => {
        expect(context?.body).toBeInstanceOf(ArrayBuffer);

        const size = context?.body.byteLength;
        return {
          uploaded: true,
          size
        };
      });

      const server = await app.listen({ port: 3006 });

      try {
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        const response = await fetch('http://localhost:3006/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: data
        });

        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.uploaded).toBe(true);
        expect(result.size).toBe(5);
      } finally {
        await app.close();
      }
    });
  });

  describe('Custom content-type parser', () => {
    it('should allow custom parsers', async () => {
      const app = new Ogelfy();

      // Add custom parser
      app.addContentTypeParser('application/custom', async (req) => {
        const text = await req.text();
        return {
          custom: true,
          data: text.toUpperCase()
        };
      });

      app.post('/custom', async (req, context) => {
        expect(context?.body.custom).toBe(true);
        expect(context?.body.data).toBe('HELLO');

        return {
          processed: true
        };
      });

      const server = await app.listen({ port: 3007 });

      try {
        const response = await fetch('http://localhost:3007/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/custom' },
          body: 'hello'
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.processed).toBe(true);
      } finally {
        await app.close();
      }
    });
  });

  describe('Error handling', () => {
    it('should return 400 for invalid JSON', async () => {
      const app = new Ogelfy();

      app.post('/data', async (req, context) => {
        return { success: true };
      });

      const server = await app.listen({ port: 3008 });

      try {
        const response = await fetch('http://localhost:3008/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{ invalid json'
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('Bad Request');
      } finally {
        await app.close();
      }
    });

    it('should return 400 for unsupported content-type', async () => {
      const app = new Ogelfy();

      app.post('/data', async (req, context) => {
        return { success: true };
      });

      const server = await app.listen({ port: 3009 });

      try {
        const response = await fetch('http://localhost:3009/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/unsupported' },
          body: 'test'
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('Bad Request');
        expect(data.message).toContain('Unsupported media type');
      } finally {
        await app.close();
      }
    });
  });

  describe('Complex request/response flow', () => {
    it('should handle full CRUD flow', async () => {
      const app = new Ogelfy();
      const users = new Map();

      // Create
      app.post('/users', async (req, context) => {
        const id = Date.now().toString();
        const user = {
          id,
          ...context?.body,
          createdAt: new Date()
        };
        users.set(id, user);
        return user;
      });

      // Read
      app.get('/users/:id', async (req, context) => {
        const user = users.get(context?.params.id);
        if (!user) {
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404
          });
        }
        return user;
      });

      // Update
      app.put('/users/:id', async (req, context) => {
        const user = users.get(context?.params.id);
        if (!user) {
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404
          });
        }
        const updated = { ...user, ...context?.body };
        users.set(context?.params.id, updated);
        return updated;
      });

      // Delete
      app.delete('/users/:id', async (req, context) => {
        const deleted = users.delete(context?.params.id);
        return { deleted };
      });

      const server = await app.listen({ port: 3010 });

      try {
        // Create user
        const createRes = await fetch('http://localhost:3010/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'John', email: 'john@example.com' })
        });
        const created = await createRes.json();
        expect(created.id).toBeDefined();

        // Read user
        const readRes = await fetch(`http://localhost:3010/users/${created.id}`);
        const read = await readRes.json();
        expect(read.name).toBe('John');

        // Update user
        const updateRes = await fetch(`http://localhost:3010/users/${created.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'John Doe' })
        });
        const updated = await updateRes.json();
        expect(updated.name).toBe('John Doe');

        // Delete user
        const deleteRes = await fetch(`http://localhost:3010/users/${created.id}`, {
          method: 'DELETE'
        });
        const deleted = await deleteRes.json();
        expect(deleted.deleted).toBe(true);
      } finally {
        await app.close();
      }
    });
  });
});
