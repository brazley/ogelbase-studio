import { Ogelfy, Reply } from '../src';

const app = new Ogelfy();

// Example 1: Method chaining with status codes and headers
app.get('/api/users/:id', (req, context) => {
  const reply = new Reply();

  return reply
    .code(200)
    .header('x-custom-header', 'value')
    .type('application/json')
    .send({
      id: context.params.id,
      name: 'John Doe',
      requestId: context.requestId
    });
});

// Example 2: Cookie handling
app.post('/auth/login', (req, context) => {
  const reply = new Reply();

  // Authenticate user...
  const token = 'session-token-123';

  return reply
    .code(201)
    .setCookie('session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 86400 // 24 hours
    })
    .send({
      success: true,
      message: 'Logged in successfully'
    });
});

// Example 3: Redirects
app.get('/old-path', (req, context) => {
  const reply = new Reply();
  return reply.redirect(301, '/new-path');
});

// Example 4: Access request context helpers
app.get('/debug', (req, context) => {
  const reply = new Reply();

  return reply.send({
    ip: context.ip,
    hostname: context.hostname,
    protocol: context.protocol,
    cookies: context.cookies,
    requestId: context.requestId
  });
});

// Example 5: Multiple cookies
app.post('/auth/multi-factor', (req, context) => {
  const reply = new Reply();

  return reply
    .setCookie('session', 'main-token', { httpOnly: true })
    .setCookie('csrf', 'csrf-token', { sameSite: 'strict' })
    .send({ success: true });
});

// Example 6: Clear cookie (logout)
app.post('/auth/logout', (req, context) => {
  const reply = new Reply();

  return reply
    .clearCookie('session', { path: '/' })
    .send({ message: 'Logged out' });
});

console.log('Reply helpers demo - see examples above');
