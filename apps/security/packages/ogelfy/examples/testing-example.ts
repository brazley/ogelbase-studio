/**
 * Testing Example
 *
 * Demonstrates:
 * - Using .inject() for testing
 * - Test organization
 * - Testing CRUD operations
 * - Testing validation
 * - Testing error cases
 *
 * Run: bun test examples/testing-example.ts
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { Ogelfy } from '../src/index';

describe('Todo API Tests', () => {
  let app: Ogelfy;
  const todos = new Map<string, any>();

  beforeEach(() => {
    // Clear todos between tests
    todos.clear();

    // Create fresh app
    app = new Ogelfy({
      schemaCompiler: {
        coerceTypes: true,
        useDefaults: true
      }
    });

    // Setup routes
    app.get('/todos', async () => {
      return { todos: Array.from(todos.values()) };
    });

    app.get('/todos/:id', async (req, context) => {
      const todo = todos.get(context.params.id);

      if (!todo) {
        throw app.httpErrors.notFound('Todo not found');
      }

      return todo;
    });

    app.post('/todos', {
      schema: {
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1 },
            completed: { type: 'boolean', default: false }
          },
          required: ['title']
        }
      }
    }, async (req, context) => {
      const id = crypto.randomUUID();
      const todo = {
        id,
        title: context.body.title,
        completed: context.body.completed ?? false,
        createdAt: new Date().toISOString()
      };

      todos.set(id, todo);
      return todo;
    });

    app.put('/todos/:id', async (req, context) => {
      const todo = todos.get(context.params.id);

      if (!todo) {
        throw app.httpErrors.notFound('Todo not found');
      }

      const updated = {
        ...todo,
        ...context.body,
        updatedAt: new Date().toISOString()
      };

      todos.set(context.params.id, updated);
      return updated;
    });

    app.delete('/todos/:id', async (req, context) => {
      const deleted = todos.delete(context.params.id);

      if (!deleted) {
        throw app.httpErrors.notFound('Todo not found');
      }

      return { success: true };
    });
  });

  // Test GET endpoints
  describe('GET /todos', () => {
    test('returns empty array initially', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/todos'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ todos: [] });
    });

    test('returns all todos', async () => {
      // Create some todos
      todos.set('1', { id: '1', title: 'Todo 1', completed: false });
      todos.set('2', { id: '2', title: 'Todo 2', completed: true });

      const response = await app.inject({
        method: 'GET',
        url: '/todos'
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.todos).toHaveLength(2);
    });
  });

  describe('GET /todos/:id', () => {
    test('returns todo by ID', async () => {
      const todo = { id: '123', title: 'Test Todo', completed: false };
      todos.set('123', todo);

      const response = await app.inject({
        method: 'GET',
        url: '/todos/123'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(todo);
    });

    test('returns 404 for nonexistent todo', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/todos/nonexistent'
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // Test POST endpoint
  describe('POST /todos', () => {
    test('creates a todo', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/todos',
        body: {
          title: 'New Todo'
        }
      });

      expect(response.statusCode).toBe(200);

      const todo = response.json();
      expect(todo.id).toBeDefined();
      expect(todo.title).toBe('New Todo');
      expect(todo.completed).toBe(false);
      expect(todo.createdAt).toBeDefined();

      // Verify it was actually created
      expect(todos.has(todo.id)).toBe(true);
    });

    test('validates required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/todos',
        body: {
          completed: true
        }
      });

      expect(response.statusCode).toBe(400);
    });

    test('validates title length', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/todos',
        body: {
          title: '' // Empty string
        }
      });

      expect(response.statusCode).toBe(400);
    });

    test('sets default completed value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/todos',
        body: {
          title: 'Todo without completed'
        }
      });

      expect(response.statusCode).toBe(200);

      const todo = response.json();
      expect(todo.completed).toBe(false);
    });
  });

  // Test PUT endpoint
  describe('PUT /todos/:id', () => {
    test('updates a todo', async () => {
      const todo = {
        id: '123',
        title: 'Original',
        completed: false,
        createdAt: new Date().toISOString()
      };

      todos.set('123', todo);

      const response = await app.inject({
        method: 'PUT',
        url: '/todos/123',
        body: {
          title: 'Updated',
          completed: true
        }
      });

      expect(response.statusCode).toBe(200);

      const updated = response.json();
      expect(updated.title).toBe('Updated');
      expect(updated.completed).toBe(true);
      expect(updated.updatedAt).toBeDefined();

      // Verify it was actually updated
      const stored = todos.get('123');
      expect(stored?.title).toBe('Updated');
    });

    test('returns 404 for nonexistent todo', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/todos/nonexistent',
        body: {
          title: 'Updated'
        }
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // Test DELETE endpoint
  describe('DELETE /todos/:id', () => {
    test('deletes a todo', async () => {
      todos.set('123', {
        id: '123',
        title: 'To Delete',
        completed: false
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/todos/123'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      // Verify it was actually deleted
      expect(todos.has('123')).toBe(false);
    });

    test('returns 404 for nonexistent todo', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/todos/nonexistent'
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // Integration test
  describe('Full CRUD flow', () => {
    test('create, read, update, delete', async () => {
      // 1. Create
      const createResponse = await app.inject({
        method: 'POST',
        url: '/todos',
        body: { title: 'Test Todo' }
      });

      expect(createResponse.statusCode).toBe(200);
      const created = createResponse.json();
      const todoId = created.id;

      // 2. Read
      const readResponse = await app.inject({
        method: 'GET',
        url: `/todos/${todoId}`
      });

      expect(readResponse.statusCode).toBe(200);
      expect(readResponse.json()).toMatchObject({
        id: todoId,
        title: 'Test Todo',
        completed: false
      });

      // 3. Update
      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/todos/${todoId}`,
        body: { completed: true }
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json().completed).toBe(true);

      // 4. Delete
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/todos/${todoId}`
      });

      expect(deleteResponse.statusCode).toBe(200);

      // 5. Verify deleted
      const verifyResponse = await app.inject({
        method: 'GET',
        url: `/todos/${todoId}`
      });

      expect(verifyResponse.statusCode).toBe(404);
    });
  });
});

// Run tests
console.log(`
Run these tests with:
  bun test examples/testing-example.ts

Or run all tests:
  bun test
`);
