/**
 * Integration Demo - Error Handling + Testing
 *
 * This demonstrates the complete error handling and testing system working together.
 */

import { describe, test, expect } from 'bun:test';
import { Ogelfy, httpErrors, testHelpers } from '../src/index';
import { z } from 'zod';

describe('Integration Demo: Error Handling + Testing', () => {
  test('complete user API with validation and error handling', async () => {
    const app = new Ogelfy();

    // Schema
    const createUserSchema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      age: z.number().min(18)
    });

    // In-memory database
    const users = new Map<string, any>();
    let nextId = 1;

    // Routes
    app.get('/users', async () => {
      return Array.from(users.values());
    });

    app.get('/users/:id', async (req, context) => {
      const user = users.get(context.params.id);

      if (!user) {
        throw httpErrors.notFound('User not found');
      }

      return { user };
    });

    app.post('/users', async (req, context) => {
      // Validate
      const result = createUserSchema.safeParse(context.body);

      if (!result.success) {
        throw httpErrors.validation(result.error);
      }

      // Create user
      const id = String(nextId++);
      const user = { id, ...result.data };
      users.set(id, user);

      return { created: true, user };
    });

    app.delete('/users/:id', async (req, context) => {
      const existed = users.delete(context.params.id);

      if (!existed) {
        throw httpErrors.notFound('User not found');
      }

      return { deleted: true };
    });

    // Test: List users (empty)
    const emptyListResponse = await app.inject({
      method: 'GET',
      url: '/users'
    });

    testHelpers.assertSuccess(emptyListResponse);
    expect(emptyListResponse.json()).toEqual([]);

    // Test: Create valid user
    const createResponse = await app.inject({
      method: 'POST',
      url: '/users',
      body: { name: 'John Doe', email: 'john@example.com', age: 30 }
    });

    testHelpers.assertSuccess(createResponse);

    const created = createResponse.json();
    expect(created.created).toBe(true);
    expect(created.user.name).toBe('John Doe');
    expect(created.user.email).toBe('john@example.com');
    expect(created.user.age).toBe(30);

    const userId = created.user.id;

    // Test: Get user by ID
    const getResponse = await app.inject({
      method: 'GET',
      url: `/users/${userId}`
    });

    testHelpers.assertSuccess(getResponse);
    expect(getResponse.json().user.id).toBe(userId);

    // Test: Create invalid user (validation error)
    const invalidResponse = await app.inject({
      method: 'POST',
      url: '/users',
      body: { name: '', email: 'invalid', age: 10 }
    });

    testHelpers.assertStatus(invalidResponse, 400);

    const error = invalidResponse.json();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toBeDefined();
    expect(error.details.length).toBeGreaterThan(0);

    // Test: Get non-existent user (404)
    const notFoundResponse = await app.inject({
      method: 'GET',
      url: '/users/999'
    });

    testHelpers.assertStatus(notFoundResponse, 404);
    expect(notFoundResponse.json().code).toBe('NOT_FOUND');

    // Test: Delete user
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/users/${userId}`
    });

    testHelpers.assertSuccess(deleteResponse);
    expect(deleteResponse.json().deleted).toBe(true);

    // Test: Delete non-existent user (404)
    const deleteNotFoundResponse = await app.inject({
      method: 'DELETE',
      url: `/users/${userId}`
    });

    testHelpers.assertStatus(deleteNotFoundResponse, 404);

    // Test: List users (still empty after delete)
    const finalListResponse = await app.inject({
      method: 'GET',
      url: '/users'
    });

    testHelpers.assertSuccess(finalListResponse);
    expect(finalListResponse.json()).toEqual([]);
  });

  test('custom error handler integration', async () => {
    const app = new Ogelfy();

    // Track errors
    const errors: Error[] = [];

    // Custom error handler
    app.setErrorHandler((error, req) => {
      errors.push(error);

      return new Response(
        JSON.stringify({
          custom: true,
          message: error.message,
          timestamp: Date.now()
        }),
        {
          status: error instanceof httpErrors.constructor ? (error as any).statusCode : 500,
          headers: { 'content-type': 'application/json' }
        }
      );
    });

    // Route that throws error
    app.get('/error', async () => {
      throw httpErrors.badRequest('Custom error message');
    });

    // Test error is handled by custom handler
    const response = await app.inject({
      method: 'GET',
      url: '/error'
    });

    expect(response.statusCode).toBe(400);

    const json = response.json();
    expect(json.custom).toBe(true);
    expect(json.message).toBe('Custom error message');
    expect(json.timestamp).toBeDefined();

    // Verify error was tracked
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('Custom error message');
  });

  test('custom 404 handler integration', async () => {
    const app = new Ogelfy();

    // Custom 404 handler
    app.setNotFoundHandler((req) => {
      const url = new URL(req.url);

      return {
        customNotFound: true,
        path: url.pathname,
        suggestions: ['/users', '/posts', '/comments']
      };
    });

    // Test custom 404
    const response = await app.inject({
      method: 'GET',
      url: '/unknown/path'
    });

    testHelpers.assertStatus(response, 404);

    const json = response.json();
    expect(json.customNotFound).toBe(true);
    expect(json.path).toBe('/unknown/path');
    expect(json.suggestions).toEqual(['/users', '/posts', '/comments']);
  });

  test('error handling with async operations', async () => {
    const app = new Ogelfy();

    // Simulate async database operation
    const asyncOperation = async (id: string) => {
      await new Promise(resolve => setTimeout(resolve, 1));

      if (id === 'fail') {
        throw new Error('Database connection failed');
      }

      return { id, data: 'test' };
    };

    app.get('/async/:id', async (req, context) => {
      try {
        const result = await asyncOperation(context.params.id);
        return { success: true, result };
      } catch (error) {
        throw httpErrors.internalServerError('Operation failed');
      }
    });

    // Test successful async operation
    const successResponse = await app.inject({
      method: 'GET',
      url: '/async/123'
    });

    testHelpers.assertSuccess(successResponse);
    expect(successResponse.json().success).toBe(true);

    // Test failed async operation
    const failResponse = await app.inject({
      method: 'GET',
      url: '/async/fail'
    });

    testHelpers.assertStatus(failResponse, 500);
    expect(failResponse.json().code).toBe('INTERNAL_ERROR');
  });

  test('test helpers functionality', async () => {
    const app = new Ogelfy();

    app.get('/test', async () => {
      return { value: 42 };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test'
    });

    // All assertions should pass
    testHelpers.assertStatus(response, 200);
    testHelpers.assertSuccess(response);
    testHelpers.assertJson(response);
    testHelpers.assertHeader(response, 'content-type');
    testHelpers.assertHeader(response, 'content-type', 'application/json');
    testHelpers.assertBody(response, { value: 42 });

    // These should throw
    expect(() => testHelpers.assertStatus(response, 404)).toThrow();
    expect(() => testHelpers.assertError(response)).toThrow();
    expect(() => testHelpers.assertBody(response, { value: 99 })).toThrow();
  });
});
