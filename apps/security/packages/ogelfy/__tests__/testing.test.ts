import { describe, test, expect } from 'bun:test';
import { Ogelfy } from '../src/index';
import { testHelpers } from '../src/testing';

describe('Testing - inject()', () => {
  test('injects GET request', async () => {
    const app = new Ogelfy();

    app.get('/test', async () => {
      return { message: 'Hello' };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Hello' });
  });

  test('injects POST request with body', async () => {
    const app = new Ogelfy();

    app.post('/user', async (req, context) => {
      return { created: true, user: context.body };
    });

    const response = await app.inject({
      method: 'POST',
      url: '/user',
      body: { name: 'John', email: 'john@example.com' }
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.created).toBe(true);
    expect(json.user.name).toBe('John');
  });

  test('injects request with route params', async () => {
    const app = new Ogelfy();

    app.get('/user/:id', async (req, context) => {
      return { id: context.params.id, name: 'John' };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/user/123'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: '123', name: 'John' });
  });

  test('injects request with query parameters', async () => {
    const app = new Ogelfy();

    app.get('/search', async (req, context) => {
      const url = new URL(req.url);
      const query = url.searchParams.get('q');
      return { query, results: [] };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/search',
      query: { q: 'test' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().query).toBe('test');
  });

  test('injects request with custom headers', async () => {
    const app = new Ogelfy();

    app.get('/protected', async (req, context) => {
      const auth = req.headers.get('authorization');
      return { authenticated: !!auth, token: auth };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { 'Authorization': 'Bearer token123' }
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.authenticated).toBe(true);
    expect(json.token).toBe('Bearer token123');
  });

  test('handles 404 for unknown routes', async () => {
    const app = new Ogelfy();

    const response = await app.inject({
      method: 'GET',
      url: '/unknown'
    });

    expect(response.statusCode).toBe(404);
    const json = response.json();
    expect(json.code).toBe('NOT_FOUND');
    expect(json.path).toBe('/unknown');
  });

  test('handles errors thrown by route handler', async () => {
    const app = new Ogelfy();

    app.get('/error', async () => {
      throw app.httpErrors.badRequest('Invalid input');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/error'
    });

    expect(response.statusCode).toBe(400);
    const json = response.json();
    expect(json.error).toBe('Invalid input');
    expect(json.code).toBe('BAD_REQUEST');
  });

  test('handles async errors', async () => {
    const app = new Ogelfy();

    app.get('/async-error', async () => {
      await new Promise(resolve => setTimeout(resolve, 1));
      throw app.httpErrors.internalServerError('Something went wrong');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/async-error'
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().code).toBe('INTERNAL_ERROR');
  });

  test('response.body contains raw string', async () => {
    const app = new Ogelfy();

    app.get('/test', async () => {
      return { value: 42 };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test'
    });

    expect(typeof response.body).toBe('string');
    expect(response.body).toBe('{"value":42}');
  });

  test('response.payload is alias for body', async () => {
    const app = new Ogelfy();

    app.get('/test', async () => {
      return { value: 42 };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test'
    });

    expect(response.payload).toBe(response.body);
  });

  test('response.json() parses body', async () => {
    const app = new Ogelfy();

    app.get('/test', async () => {
      return { nested: { value: 42 } };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test'
    });

    const json = response.json();
    expect(json).toEqual({ nested: { value: 42 } });
    expect(json.nested.value).toBe(42);
  });

  test('handles PUT requests', async () => {
    const app = new Ogelfy();

    app.put('/user/:id', async (req, context) => {
      const params = context.params;
      const body = context.body;
      return { updated: true, id: params.id, data: body };
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/user/123',
      body: { name: 'Updated' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().updated).toBe(true);
  });

  test('handles DELETE requests', async () => {
    const app = new Ogelfy();

    app.delete('/user/:id', async (req, context) => {
      const params = context.params;
      return { deleted: true, id: params.id };
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/user/123'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().deleted).toBe(true);
  });

  test('handles Response objects from handlers', async () => {
    const app = new Ogelfy();

    app.get('/custom', async () => {
      return new Response(JSON.stringify({ custom: true }), {
        status: 201,
        headers: { 'content-type': 'application/json', 'x-custom': 'value' }
      });
    });

    const response = await app.inject({
      method: 'GET',
      url: '/custom'
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['x-custom']).toBe('value');
    expect(response.json()).toEqual({ custom: true });
  });

  test('multiple route params', async () => {
    const app = new Ogelfy();

    app.get('/users/:userId/posts/:postId', async (req, context) => {
      const params = context.params;
      return { userId: params.userId, postId: params.postId };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/users/42/posts/99'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: '42', postId: '99' });
  });

  test('complex query parameters', async () => {
    const app = new Ogelfy();

    app.get('/search', async (req, context) => {
      const url = new URL(req.url);
      return {
        q: url.searchParams.get('q'),
        page: url.searchParams.get('page'),
        limit: url.searchParams.get('limit')
      };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/search',
      query: { q: 'test', page: '2', limit: '10' }
    });

    const json = response.json();
    expect(json.q).toBe('test');
    expect(json.page).toBe('2');
    expect(json.limit).toBe('10');
  });

  test('body as string', async () => {
    const app = new Ogelfy();

    app.post('/data', async (req, context) => {
      const body = await req.text();
      return { received: body };
    });

    const response = await app.inject({
      method: 'POST',
      url: '/data',
      body: 'plain text data'
    });

    expect(response.statusCode).toBe(200);
  });

  test('custom not found handler with inject', async () => {
    const app = new Ogelfy();

    app.setNotFoundHandler(async (req, context) => {
      return {
        error: 'Custom 404',
        path: new URL(req.url).pathname,
        timestamp: Date.now()
      };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/missing'
    });

    expect(response.statusCode).toBe(404);
    const json = response.json();
    expect(json.error).toBe('Custom 404');
    expect(json.path).toBe('/missing');
    expect(json.timestamp).toBeDefined();
  });

  test('custom error handler with inject', async () => {
    const app = new Ogelfy();

    app.setErrorHandler(async (error, req) => {
      return new Response(
        JSON.stringify({ custom: true, error: error.message }),
        { status: 418, headers: { 'content-type': 'application/json' } }
      );
    });

    app.get('/error', async () => {
      throw new Error('Test error');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/error'
    });

    expect(response.statusCode).toBe(418);
    expect(response.json()).toEqual({ custom: true, error: 'Test error' });
  });
});

describe('testHelpers', () => {
  test('assertStatus passes for correct status', async () => {
    const app = new Ogelfy();
    app.get('/test', async () => ({ ok: true }));

    const response = await app.inject({ method: 'GET', url: '/test' });

    expect(() => {
      testHelpers.assertStatus(response, 200);
    }).not.toThrow();
  });

  test('assertStatus throws for incorrect status', async () => {
    const app = new Ogelfy();
    app.get('/test', async () => ({ ok: true }));

    const response = await app.inject({ method: 'GET', url: '/test' });

    expect(() => {
      testHelpers.assertStatus(response, 404);
    }).toThrow('Expected status 404 but got 200');
  });

  test('assertJson passes for valid JSON', async () => {
    const app = new Ogelfy();
    app.get('/test', async () => ({ ok: true }));

    const response = await app.inject({ method: 'GET', url: '/test' });

    expect(() => {
      testHelpers.assertJson(response);
    }).not.toThrow();
  });

  test('assertHeader checks header exists', async () => {
    const app = new Ogelfy();
    app.get('/test', async () => ({ ok: true }));

    const response = await app.inject({ method: 'GET', url: '/test' });

    expect(() => {
      testHelpers.assertHeader(response, 'content-type');
    }).not.toThrow();

    expect(() => {
      testHelpers.assertHeader(response, 'x-missing');
    }).toThrow("Expected header 'x-missing' to exist");
  });

  test('assertHeader checks header value', async () => {
    const app = new Ogelfy();
    app.get('/test', async () => ({ ok: true }));

    const response = await app.inject({ method: 'GET', url: '/test' });

    expect(() => {
      testHelpers.assertHeader(response, 'content-type', 'application/json');
    }).not.toThrow();

    expect(() => {
      testHelpers.assertHeader(response, 'content-type', 'text/html');
    }).toThrow();
  });

  test('assertBody checks response body', async () => {
    const app = new Ogelfy();
    app.get('/test', async () => ({ value: 42 }));

    const response = await app.inject({ method: 'GET', url: '/test' });

    expect(() => {
      testHelpers.assertBody(response, { value: 42 });
    }).not.toThrow();

    expect(() => {
      testHelpers.assertBody(response, { value: 99 });
    }).toThrow('Response body mismatch');
  });

  test('assertSuccess passes for 2xx status', async () => {
    const app = new Ogelfy();
    app.get('/test', async () => ({ ok: true }));

    const response = await app.inject({ method: 'GET', url: '/test' });

    expect(() => {
      testHelpers.assertSuccess(response);
    }).not.toThrow();
  });

  test('assertSuccess fails for error status', async () => {
    const app = new Ogelfy();
    app.get('/error', async () => {
      throw app.httpErrors.badRequest();
    });

    const response = await app.inject({ method: 'GET', url: '/error' });

    expect(() => {
      testHelpers.assertSuccess(response);
    }).toThrow('Expected successful response but got 400');
  });

  test('assertError passes for 4xx/5xx status', async () => {
    const app = new Ogelfy();
    app.get('/error', async () => {
      throw app.httpErrors.badRequest();
    });

    const response = await app.inject({ method: 'GET', url: '/error' });

    expect(() => {
      testHelpers.assertError(response);
    }).not.toThrow();
  });

  test('assertError fails for success status', async () => {
    const app = new Ogelfy();
    app.get('/test', async () => ({ ok: true }));

    const response = await app.inject({ method: 'GET', url: '/test' });

    expect(() => {
      testHelpers.assertError(response);
    }).toThrow('Expected error response but got 200');
  });
});

describe('Integration - error handling + testing', () => {
  test('inject catches validation errors', async () => {
    const app = new Ogelfy();

    app.post('/user', async () => {
      throw app.httpErrors.badRequest('Email is required');
    });

    const response = await app.inject({
      method: 'POST',
      url: '/user',
      body: {}
    });

    expect(response.statusCode).toBe(400);
    testHelpers.assertError(response);
    testHelpers.assertStatus(response, 400);

    const json = response.json();
    expect(json.error).toBe('Email is required');
  });

  test('inject works with all HTTP methods', async () => {
    const app = new Ogelfy();

    app.get('/get', async () => ({ method: 'GET' }));
    app.post('/post', async () => ({ method: 'POST' }));
    app.put('/put', async () => ({ method: 'PUT' }));
    app.delete('/delete', async () => ({ method: 'DELETE' }));

    const getResponse = await app.inject({ method: 'GET', url: '/get' });
    const postResponse = await app.inject({ method: 'POST', url: '/post' });
    const putResponse = await app.inject({ method: 'PUT', url: '/put' });
    const deleteResponse = await app.inject({ method: 'DELETE', url: '/delete' });

    expect(getResponse.json().method).toBe('GET');
    expect(postResponse.json().method).toBe('POST');
    expect(putResponse.json().method).toBe('PUT');
    expect(deleteResponse.json().method).toBe('DELETE');
  });

  test('inject respects route priority', async () => {
    const app = new Ogelfy();

    app.get('/user/:id', async (req, context) => {
      const params = context.params;
      return { type: 'dynamic', id: params.id };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/user/123'
    });

    expect(response.json().type).toBe('dynamic');
    expect(response.json().id).toBe('123');
  });
});
