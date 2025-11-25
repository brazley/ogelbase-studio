/**
 * Full CRUD API Example
 *
 * A complete RESTful API with:
 * - CRUD operations
 * - Validation
 * - Error handling
 * - Pagination
 * - Filtering
 * - Sorting
 *
 * Run: bun run examples/full-crud-api.ts
 */

import { Ogelfy } from '../src/index';

// Mock database
const todos = new Map<string, any>();

const app = new Ogelfy({
  schemaCompiler: {
    coerceTypes: true,
    useDefaults: true
  }
});

// Shared schemas
app.addSchema('todoSchema', {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', maxLength: 1000 },
    completed: { type: 'boolean', default: false },
    priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
    dueDate: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string', nullable: true }
  }
});

// List todos with pagination and filtering
app.get('/todos', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'number', minimum: 1, default: 1 },
        limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
        completed: { type: 'boolean' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        sort: { type: 'string', enum: ['createdAt', 'dueDate', 'priority'], default: 'createdAt' },
        order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: 'todoSchema#' }
          },
          meta: {
            type: 'object',
            properties: {
              total: { type: 'number' },
              page: { type: 'number' },
              limit: { type: 'number' },
              pages: { type: 'number' }
            }
          }
        }
      }
    }
  }
}, async (req, context) => {
  let allTodos = Array.from(todos.values());

  // Filter by completed
  if (context.query.completed !== undefined) {
    allTodos = allTodos.filter(t => t.completed === context.query.completed);
  }

  // Filter by priority
  if (context.query.priority) {
    allTodos = allTodos.filter(t => t.priority === context.query.priority);
  }

  // Sort
  const { sort, order } = context.query;
  allTodos.sort((a, b) => {
    const aVal = a[sort];
    const bVal = b[sort];
    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return order === 'asc' ? comparison : -comparison;
  });

  // Paginate
  const { page, limit } = context.query;
  const start = (page - 1) * limit;
  const end = start + limit;
  const paginated = allTodos.slice(start, end);

  return {
    data: paginated,
    meta: {
      total: allTodos.length,
      page,
      limit,
      pages: Math.ceil(allTodos.length / limit)
    }
  };
});

// Get single todo
app.get('/todos/:id', {
  schema: {
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      }
    },
    response: {
      200: { $ref: 'todoSchema#' }
    }
  }
}, async (req, context) => {
  const todo = todos.get(context.params.id);

  if (!todo) {
    throw app.httpErrors.notFound('Todo not found');
  }

  return todo;
});

// Create todo
app.post('/todos', {
  schema: {
    body: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', maxLength: 1000 },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
        dueDate: { type: 'string', format: 'date-time', nullable: true }
      },
      required: ['title']
    },
    response: {
      201: { $ref: 'todoSchema#' }
    }
  }
}, async (req, context) => {
  const id = crypto.randomUUID();

  const todo = {
    id,
    title: context.body.title,
    description: context.body.description || '',
    completed: false,
    priority: context.body.priority || 'medium',
    dueDate: context.body.dueDate || null,
    createdAt: new Date().toISOString(),
    updatedAt: null
  };

  todos.set(id, todo);

  return {
    ...todo,
    statusCode: 201
  };
});

// Update todo
app.put('/todos/:id', {
  schema: {
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      }
    },
    body: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', maxLength: 1000 },
        completed: { type: 'boolean' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        dueDate: { type: 'string', format: 'date-time', nullable: true }
      }
    },
    response: {
      200: { $ref: 'todoSchema#' }
    }
  }
}, async (req, context) => {
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

// Partial update
app.patch('/todos/:id', {
  schema: {
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      }
    },
    body: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', maxLength: 1000 },
        completed: { type: 'boolean' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        dueDate: { type: 'string', format: 'date-time', nullable: true }
      }
    }
  }
}, async (req, context) => {
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

// Delete todo
app.delete('/todos/:id', async (req, context) => {
  const deleted = todos.delete(context.params.id);

  if (!deleted) {
    throw app.httpErrors.notFound('Todo not found');
  }

  return { success: true, message: 'Todo deleted' };
});

// Bulk operations
app.post('/todos/bulk', {
  schema: {
    body: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1 },
          priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' }
        },
        required: ['title']
      },
      minItems: 1,
      maxItems: 100
    }
  }
}, async (req, context) => {
  const created = [];

  for (const item of context.body) {
    const id = crypto.randomUUID();
    const todo = {
      id,
      title: item.title,
      description: '',
      completed: false,
      priority: item.priority || 'medium',
      dueDate: null,
      createdAt: new Date().toISOString(),
      updatedAt: null
    };

    todos.set(id, todo);
    created.push(todo);
  }

  return {
    success: true,
    created: created.length,
    todos: created
  };
});

// Statistics
app.get('/todos/stats', async () => {
  const allTodos = Array.from(todos.values());

  return {
    total: allTodos.length,
    completed: allTodos.filter(t => t.completed).length,
    pending: allTodos.filter(t => !t.completed).length,
    byPriority: {
      high: allTodos.filter(t => t.priority === 'high').length,
      medium: allTodos.filter(t => t.priority === 'medium').length,
      low: allTodos.filter(t => t.priority === 'low').length
    }
  };
});

// Seed some sample data
const sampleTodos = [
  { title: 'Learn Ogelfy', priority: 'high', completed: false },
  { title: 'Build an API', priority: 'medium', completed: false },
  { title: 'Write tests', priority: 'medium', completed: true },
  { title: 'Deploy to production', priority: 'high', completed: false }
];

for (const sample of sampleTodos) {
  const id = crypto.randomUUID();
  todos.set(id, {
    id,
    ...sample,
    description: '',
    dueDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: null
  });
}

const PORT = 3004;
await app.listen({ port: PORT });

console.log(`
🚀 Full CRUD API running on http://localhost:${PORT}

Endpoints:
  GET    /todos              - List todos (with pagination & filtering)
  GET    /todos/:id          - Get single todo
  POST   /todos              - Create todo
  PUT    /todos/:id          - Replace todo
  PATCH  /todos/:id          - Update todo fields
  DELETE /todos/:id          - Delete todo
  POST   /todos/bulk         - Create multiple todos
  GET    /todos/stats        - Get statistics

Examples:

1. List all todos:
curl http://localhost:${PORT}/todos

2. Filter completed todos:
curl "http://localhost:${PORT}/todos?completed=true"

3. Paginate & sort:
curl "http://localhost:${PORT}/todos?page=1&limit=10&sort=priority&order=desc"

4. Create todo:
curl -X POST http://localhost:${PORT}/todos \\
  -H "Content-Type: application/json" \\
  -d '{"title":"New task","priority":"high"}'

5. Update todo (use ID from list):
curl -X PUT http://localhost:${PORT}/todos/<id> \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Updated task","completed":true}'

6. Partial update:
curl -X PATCH http://localhost:${PORT}/todos/<id> \\
  -H "Content-Type: application/json" \\
  -d '{"completed":true}'

7. Delete todo:
curl -X DELETE http://localhost:${PORT}/todos/<id>

8. Get statistics:
curl http://localhost:${PORT}/todos/stats
`);
