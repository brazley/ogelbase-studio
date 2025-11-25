/**
 * Example: Using Pino Logger with Ogelfy
 */

import { Ogelfy } from '../src/index';

const app = new Ogelfy({
  logger: {
    level: 'info',
    prettyPrint: true, // Pretty output for development
    redact: ['password', 'token'] // Additional fields to redact
  }
});

// Example 1: Basic logging in route handler
app.get('/users/:id', async (req, context) => {
  context?.log.info({ userId: context.params.id }, 'Fetching user');

  // Simulate user fetch
  const user = { id: context.params.id, name: 'John Doe' };

  context?.log.info({ user }, 'User fetched successfully');

  return user;
});

// Example 2: Error logging
app.post('/users', async (req, context) => {
  try {
    context?.log.debug({ body: context?.body }, 'Creating user');

    // Simulate validation error
    if (!context?.body?.name) {
      context?.log.warn('Missing required field: name');
      return {
        statusCode: 400,
        error: 'Missing required field: name'
      };
    }

    // Create user logic here
    const newUser = { id: Date.now().toString(), ...context?.body };

    context?.log.info({ userId: newUser.id }, 'User created successfully');

    return {
      statusCode: 201,
      data: newUser
    };
  } catch (error) {
    context?.log.error({ err: error }, 'Failed to create user');
    throw error;
  }
});

// Example 3: Custom request ID tracking
app.get('/orders/:id', async (req, context) => {
  // Request ID is automatically available in context
  context?.log.info(
    { orderId: context.params.id, requestId: context?.requestId },
    'Processing order request'
  );

  return {
    orderId: context.params.id,
    requestId: context?.requestId
  };
});

// Start server
const server = await app.listen({ port: 3000 });
console.log(`Server running on http://localhost:3000`);

// Example requests:
// curl http://localhost:3000/users/123
// curl -X POST http://localhost:3000/users -H "Content-Type: application/json" -d '{"name":"Jane"}'
// curl -H "x-request-id: my-custom-id" http://localhost:3000/orders/456
