/**
 * Database Integration Example
 *
 * Demonstrates:
 * - Database plugin
 * - CRUD operations
 * - Error handling
 * - Transaction simulation
 *
 * Note: Uses in-memory Map as a mock database.
 * In production, use a real database (PostgreSQL, MySQL, etc.)
 *
 * Run: bun run examples/with-database.ts
 */

import { Ogelfy, fp } from '../src/index';

// Mock Database Class
class Database {
  private users = new Map<string, any>();
  private posts = new Map<string, any>();

  // Users
  async findUserByEmail(email: string) {
    return Array.from(this.users.values()).find(u => u.email === email);
  }

  async findUserById(id: string) {
    return this.users.get(id);
  }

  async getAllUsers() {
    return Array.from(this.users.values());
  }

  async createUser(data: any) {
    const id = crypto.randomUUID();
    const user = {
      id,
      ...data,
      createdAt: new Date().toISOString()
    };

    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, data: any) {
    const user = this.users.get(id);
    if (!user) return null;

    const updated = {
      ...user,
      ...data,
      updatedAt: new Date().toISOString()
    };

    this.users.set(id, updated);
    return updated;
  }

  async deleteUser(id: string) {
    return this.users.delete(id);
  }

  // Posts
  async getAllPosts() {
    return Array.from(this.posts.values());
  }

  async getPostsByUserId(userId: string) {
    return Array.from(this.posts.values()).filter(p => p.userId === userId);
  }

  async findPostById(id: string) {
    return this.posts.get(id);
  }

  async createPost(data: any) {
    const id = crypto.randomUUID();
    const post = {
      id,
      ...data,
      createdAt: new Date().toISOString()
    };

    this.posts.set(id, post);
    return post;
  }

  async deletePost(id: string) {
    return this.posts.delete(id);
  }

  async close() {
    console.log('Database connection closed');
  }
}

// Database Plugin
const databasePlugin = fp(async function (app: Ogelfy, options: any) {
  // Initialize database
  const db = new Database();

  // Seed with sample data
  await db.createUser({
    name: 'Alice',
    email: 'alice@example.com',
    role: 'admin'
  });

  await db.createUser({
    name: 'Bob',
    email: 'bob@example.com',
    role: 'user'
  });

  // Make database available to routes
  app.decorate('db', db);

  // Cleanup on server close
  app.addHook('onClose', async () => {
    await db.close();
  });

  // Health check route
  app.get('/health/db', async () => {
    try {
      const users = await db.getAllUsers();
      return {
        status: 'ok',
        database: 'connected',
        users: users.length
      };
    } catch (error) {
      throw app.httpErrors.serviceUnavailable('Database unavailable');
    }
  });
}, {
  name: 'database',
  version: '1.0.0'
});

// Application
const app = new Ogelfy();

// Register database plugin
await app.register(databasePlugin);

// User routes
app.get('/users', async () => {
  const users = await app.db.getAllUsers();
  return { users };
});

app.get('/users/:id', async (req, context) => {
  const user = await app.db.findUserById(context.params.id);

  if (!user) {
    throw app.httpErrors.notFound('User not found');
  }

  return user;
});

app.post('/users', {
  schema: {
    body: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 3 },
        email: { type: 'string', format: 'email' },
        role: { type: 'string', enum: ['user', 'admin'], default: 'user' }
      },
      required: ['name', 'email']
    }
  }
}, async (req, context) => {
  const { email } = context.body;

  // Check for duplicate email
  const existing = await app.db.findUserByEmail(email);
  if (existing) {
    throw app.httpErrors.conflict('Email already exists');
  }

  const user = await app.db.createUser(context.body);
  return user;
});

app.put('/users/:id', {
  schema: {
    body: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 3 },
        email: { type: 'string', format: 'email' }
      }
    }
  }
}, async (req, context) => {
  const user = await app.db.updateUser(context.params.id, context.body);

  if (!user) {
    throw app.httpErrors.notFound('User not found');
  }

  return user;
});

app.delete('/users/:id', async (req, context) => {
  const deleted = await app.db.deleteUser(context.params.id);

  if (!deleted) {
    throw app.httpErrors.notFound('User not found');
  }

  return { success: true, message: 'User deleted' };
});

// Post routes
app.get('/posts', async () => {
  const posts = await app.db.getAllPosts();
  return { posts };
});

app.get('/users/:userId/posts', async (req, context) => {
  const posts = await app.db.getPostsByUserId(context.params.userId);
  return { posts };
});

app.post('/posts', {
  schema: {
    body: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        title: { type: 'string', minLength: 5 },
        content: { type: 'string', minLength: 10 }
      },
      required: ['userId', 'title', 'content']
    }
  }
}, async (req, context) => {
  const { userId } = context.body;

  // Verify user exists
  const user = await app.db.findUserById(userId);
  if (!user) {
    throw app.httpErrors.badRequest('Invalid userId');
  }

  const post = await app.db.createPost(context.body);
  return post;
});

app.delete('/posts/:id', async (req, context) => {
  const deleted = await app.db.deletePost(context.params.id);

  if (!deleted) {
    throw app.httpErrors.notFound('Post not found');
  }

  return { success: true, message: 'Post deleted' };
});

const PORT = 3003;
await app.listen({ port: PORT });

console.log(`
🚀 Database example running on http://localhost:${PORT}

Try these commands:

1. Get all users:
curl http://localhost:${PORT}/users

2. Create a new user:
curl -X POST http://localhost:${PORT}/users \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Charlie","email":"charlie@example.com"}'

3. Get user by ID (use ID from step 2):
curl http://localhost:${PORT}/users/<user-id>

4. Update user:
curl -X PUT http://localhost:${PORT}/users/<user-id> \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Charles"}'

5. Create a post:
curl -X POST http://localhost:${PORT}/posts \\
  -H "Content-Type: application/json" \\
  -d '{"userId":"<user-id>","title":"Hello World","content":"This is my first post!"}'

6. Get all posts:
curl http://localhost:${PORT}/posts

7. Get user's posts:
curl http://localhost:${PORT}/users/<user-id>/posts

8. Delete user:
curl -X DELETE http://localhost:${PORT}/users/<user-id>
`);
