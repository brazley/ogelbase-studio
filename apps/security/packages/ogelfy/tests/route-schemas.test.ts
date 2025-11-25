import { describe, test, expect, beforeEach } from 'bun:test';
import { Ogelfy } from '../src/index';

describe('Route Schemas', () => {
  let app: Ogelfy;

  beforeEach(() => {
    app = new Ogelfy();
  });

  describe('Request Body Validation', () => {
    test('should validate request body', async () => {
      app.post(
        '/users',
        {
          schema: {
            body: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' },
              },
              required: ['name'],
            },
          },
        },
        (req, ctx) => {
          return { success: true, data: ctx?.body };
        }
      );

      const res = await app.inject({
        method: 'POST',
        url: '/users',
        body: { name: 'John', age: 30 },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('John');
    });

    test('should reject invalid request body', async () => {
      app.post(
        '/users',
        {
          schema: {
            body: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' },
              },
              required: ['name', 'age'],
            },
          },
        },
        () => {
          return { success: true };
        }
      );

      const res = await app.inject({
        method: 'POST',
        url: '/users',
        body: { name: 'John' }, // Missing age
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.name).toBe('ValidationError');
    });

    test('should coerce types in request body', async () => {
      app.post(
        '/users',
        {
          schema: {
            body: {
              type: 'object',
              properties: {
                age: { type: 'number' },
              },
            },
          },
        },
        (req, ctx) => {
          return { age: ctx?.body.age, type: typeof ctx?.body.age };
        }
      );

      const res = await app.inject({
        method: 'POST',
        url: '/users',
        body: { age: '30' }, // String that should be coerced to number
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.age).toBe(30);
      expect(body.type).toBe('number');
    });

    test('should remove additional properties from body', async () => {
      app.post(
        '/users',
        {
          schema: {
            body: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
        (req, ctx) => {
          return { body: ctx?.body };
        }
      );

      const res = await app.inject({
        method: 'POST',
        url: '/users',
        body: { name: 'John', extra: 'field' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.body.name).toBe('John');
      expect(body.body.extra).toBeUndefined();
    });
  });

  describe('Query String Validation', () => {
    test('should validate query parameters', async () => {
      app.get(
        '/search',
        {
          schema: {
            querystring: {
              type: 'object',
              properties: {
                q: { type: 'string' },
                limit: { type: 'number' },
              },
              required: ['q'],
            },
          },
        },
        (req, ctx) => {
          return { query: ctx?.query };
        }
      );

      const res = await app.inject({
        method: 'GET',
        url: '/search?q=test&limit=10',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.query.q).toBe('test');
      expect(body.query.limit).toBe(10); // Coerced to number
    });

    test('should reject invalid query parameters', async () => {
      app.get(
        '/search',
        {
          schema: {
            querystring: {
              type: 'object',
              properties: {
                q: { type: 'string' },
              },
              required: ['q'],
            },
          },
        },
        () => {
          return { success: true };
        }
      );

      const res = await app.inject({
        method: 'GET',
        url: '/search', // Missing required 'q'
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Params Validation', () => {
    test('should validate URL parameters', async () => {
      app.get(
        '/users/:id',
        {
          schema: {
            params: {
              type: 'object',
              properties: {
                id: { type: 'string', pattern: '^[0-9]+$' },
              },
            },
          },
        },
        (req, ctx) => {
          return { id: ctx?.params.id };
        }
      );

      const res = await app.inject({
        method: 'GET',
        url: '/users/123',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).id).toBe('123');
    });

    test('should reject invalid URL parameters', async () => {
      app.get(
        '/users/:id',
        {
          schema: {
            params: {
              type: 'object',
              properties: {
                id: { type: 'string', pattern: '^[0-9]+$' },
              },
            },
          },
        },
        () => {
          return { success: true };
        }
      );

      const res = await app.inject({
        method: 'GET',
        url: '/users/abc', // Invalid pattern
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Response Validation', () => {
    test('should validate response schema', async () => {
      app.get(
        '/user',
        {
          schema: {
            response: {
              200: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                },
                required: ['id', 'name'],
              },
            },
          },
        },
        () => {
          return { id: '123', name: 'John' };
        }
      );

      const res = await app.inject({
        method: 'GET',
        url: '/user',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe('123');
      expect(body.name).toBe('John');
    });

    test('should remove additional properties from response', async () => {
      app.get(
        '/user',
        {
          schema: {
            response: {
              200: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                },
                additionalProperties: false,
              },
            },
          },
        },
        () => {
          return { name: 'John', password: 'secret', internal: 'data' };
        }
      );

      const res = await app.inject({
        method: 'GET',
        url: '/user',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe('John');
      expect(body.password).toBeUndefined();
      expect(body.internal).toBeUndefined();
    });

    test('should validate different status codes', async () => {
      app.get(
        '/resource',
        {
          schema: {
            response: {
              200: {
                type: 'object',
                properties: {
                  data: { type: 'string' },
                },
              },
              404: {
                type: 'object',
                properties: {
                  error: { type: 'string' },
                },
              },
            },
          },
        },
        (req, ctx) => {
          const id = ctx?.query.id;
          if (!id) {
            // statusCode will be removed automatically, so response will be { error: 'Not found' }
            return { statusCode: 404, error: 'Not found' };
          }
          // statusCode will be removed automatically, so response will be { data: 'found' }
          return { statusCode: 200, data: 'found' };
        }
      );

      const res1 = await app.inject({
        method: 'GET',
        url: '/resource?id=123',
      });

      expect(res1.statusCode).toBe(200);
      const body1 = JSON.parse(res1.body);
      expect(body1.data).toBe('found');

      const res2 = await app.inject({
        method: 'GET',
        url: '/resource',
      });

      expect(res2.statusCode).toBe(404);
      const body2 = JSON.parse(res2.body);
      expect(body2.error).toBe('Not found');
    });
  });

  describe('Shared Schemas', () => {
    test('should use shared schemas via $ref', async () => {
      app.addSchema('User', {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
        required: ['id', 'name', 'email'],
      });

      app.post(
        '/users',
        {
          schema: {
            body: { $ref: 'User' },
            response: {
              200: { $ref: 'User' },
            },
          },
        },
        (req, ctx) => {
          return ctx?.body;
        }
      );

      const res = await app.inject({
        method: 'POST',
        url: '/users',
        body: {
          id: '123',
          name: 'John Doe',
          email: 'john@example.com',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe('123');
    });
  });

  describe('Complex Validation', () => {
    test('should validate nested objects', async () => {
      app.post(
        '/profile',
        {
          schema: {
            body: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    contact: {
                      type: 'object',
                      properties: {
                        email: { type: 'string', format: 'email' },
                        phone: { type: 'string' },
                      },
                      required: ['email'],
                    },
                  },
                  required: ['name', 'contact'],
                },
              },
            },
          },
        },
        (req, ctx) => {
          return { success: true };
        }
      );

      const res = await app.inject({
        method: 'POST',
        url: '/profile',
        body: {
          user: {
            name: 'John',
            contact: {
              email: 'john@example.com',
              phone: '555-1234',
            },
          },
        },
      });

      expect(res.statusCode).toBe(200);
    });

    test('should validate arrays with item schemas', async () => {
      app.post(
        '/bulk',
        {
          schema: {
            body: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      value: { type: 'number' },
                    },
                    required: ['name', 'value'],
                  },
                  minItems: 1,
                },
              },
            },
          },
        },
        (req, ctx) => {
          return { count: ctx?.body.items.length };
        }
      );

      const res = await app.inject({
        method: 'POST',
        url: '/bulk',
        body: {
          items: [
            { name: 'item1', value: 10 },
            { name: 'item2', value: 20 },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).count).toBe(2);
    });
  });

  describe('Format Validation', () => {
    test('should validate email format', async () => {
      app.post(
        '/contact',
        {
          schema: {
            body: {
              type: 'object',
              properties: {
                email: { type: 'string', format: 'email' },
              },
            },
          },
        },
        () => {
          return { success: true };
        }
      );

      const validRes = await app.inject({
        method: 'POST',
        url: '/contact',
        body: { email: 'test@example.com' },
      });

      expect(validRes.statusCode).toBe(200);

      const invalidRes = await app.inject({
        method: 'POST',
        url: '/contact',
        body: { email: 'not-an-email' },
      });

      expect(invalidRes.statusCode).toBe(400);
    });

    test('should validate uri format', async () => {
      app.post(
        '/link',
        {
          schema: {
            body: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
              },
            },
          },
        },
        () => {
          return { success: true };
        }
      );

      const validRes = await app.inject({
        method: 'POST',
        url: '/link',
        body: { url: 'https://example.com' },
      });

      expect(validRes.statusCode).toBe(200);
    });

    test('should validate date format', async () => {
      app.post(
        '/event',
        {
          schema: {
            body: {
              type: 'object',
              properties: {
                date: { type: 'string', format: 'date' },
              },
            },
          },
        },
        () => {
          return { success: true };
        }
      );

      const validRes = await app.inject({
        method: 'POST',
        url: '/event',
        body: { date: '2024-01-15' },
      });

      expect(validRes.statusCode).toBe(200);
    });
  });
});
