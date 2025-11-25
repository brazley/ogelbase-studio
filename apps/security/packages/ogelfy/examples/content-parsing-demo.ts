/**
 * Ogelfy Content Parsing & Serialization Demo
 *
 * This example demonstrates all content-type parsing capabilities
 * and fast JSON serialization features.
 */

import { Ogelfy, Schemas } from '../src';

const app = new Ogelfy();

// =============================================================================
// 1. JSON Content-Type (application/json)
// =============================================================================

app.post('/api/users', async (req, context) => {
  console.log('Received JSON:', context?.body);
  // { name: 'John', email: 'john@example.com', age: 30 }

  return {
    id: crypto.randomUUID(),
    ...context?.body,
    createdAt: new Date()
  };
});

// Test:
// curl -X POST http://localhost:3000/api/users \
//   -H "Content-Type: application/json" \
//   -d '{"name":"John","email":"john@example.com","age":30}'

// =============================================================================
// 2. URL-Encoded Form (application/x-www-form-urlencoded)
// =============================================================================

app.post('/login', async (req, context) => {
  const { username, password } = context?.body || {};

  console.log('Login attempt:', username);

  // Validate credentials (demo only)
  if (username === 'admin' && password === 'secret') {
    return {
      success: true,
      token: 'jwt-token-here',
      user: { username, role: 'admin' }
    };
  }

  return new Response(
    JSON.stringify({ success: false, error: 'Invalid credentials' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
});

// Test:
// curl -X POST http://localhost:3000/login \
//   -H "Content-Type: application/x-www-form-urlencoded" \
//   -d "username=admin&password=secret"

// =============================================================================
// 3. Multipart Form Data (file uploads)
// =============================================================================

app.post('/upload', async (req, context) => {
  const { fields, files } = context?.body || { fields: {}, files: [] };

  console.log('Fields:', fields);
  console.log('Files:', files.map((f: any) => f.filename));

  // Save files
  const savedFiles = [];
  for (const file of files) {
    const path = `./uploads/${file.filename}`;
    await Bun.write(path, file.data);
    savedFiles.push({
      filename: file.filename,
      size: file.data.byteLength,
      mimeType: file.mimeType
    });
  }

  return {
    success: true,
    fields,
    files: savedFiles
  };
});

// Test:
// curl -X POST http://localhost:3000/upload \
//   -F "title=My Document" \
//   -F "description=Important file" \
//   -F "file=@document.pdf"

// =============================================================================
// 4. Plain Text (text/plain)
// =============================================================================

app.post('/echo', async (req, context) => {
  const text = context?.body;

  console.log('Received text:', text);

  return {
    received: text,
    length: text.length,
    reversed: text.split('').reverse().join('')
  };
});

// Test:
// curl -X POST http://localhost:3000/echo \
//   -H "Content-Type: text/plain" \
//   -d "Hello, Ogelfy!"

// =============================================================================
// 5. Binary Data (application/octet-stream)
// =============================================================================

app.post('/binary', async (req, context) => {
  const buffer = context?.body; // ArrayBuffer

  console.log('Received binary data:', buffer.byteLength, 'bytes');

  // Process binary data
  const view = new Uint8Array(buffer);
  const sum = Array.from(view).reduce((a, b) => a + b, 0);

  return {
    size: buffer.byteLength,
    checksum: sum
  };
});

// Test:
// echo -n "binary data" | curl -X POST http://localhost:3000/binary \
//   -H "Content-Type: application/octet-stream" \
//   --data-binary @-

// =============================================================================
// 6. Route Parameters + Query Strings
// =============================================================================

app.get('/users/:id', async (req, context) => {
  const userId = context?.params.id;
  const include = context?.query.include || 'basic';

  console.log(`Get user ${userId} with ${include} info`);

  return {
    id: userId,
    name: 'John Doe',
    email: include === 'full' ? 'john@example.com' : undefined,
    profile: include === 'full' ? { age: 30, city: 'NYC' } : undefined
  };
});

// Test:
// curl http://localhost:3000/users/123?include=full

// =============================================================================
// 7. Fast Schema-Based Serialization
// =============================================================================

// Define user schema for fast serialization
const userSchema = Schemas.object({
  id: Schemas.string(),
  name: Schemas.string(),
  email: Schemas.string(),
  age: Schemas.number(),
  active: Schemas.boolean(),
  createdAt: Schemas.date(),
  metadata: Schemas.object({
    lastLogin: Schemas.date(),
    loginCount: Schemas.number()
  }, ['lastLogin', 'loginCount'])
}, ['id', 'name', 'email', 'age', 'active', 'createdAt']);

// Pre-compile schema for maximum performance
const serializer = app['serializer'];
const compiledUserSchema = serializer.compile(userSchema);

app.get('/users', async () => {
  // Simulate database query
  const users = [
    {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      active: true,
      createdAt: new Date('2024-01-01'),
      metadata: {
        lastLogin: new Date(),
        loginCount: 42
      }
    },
    {
      id: '2',
      name: 'Jane Smith',
      email: 'jane@example.com',
      age: 28,
      active: true,
      createdAt: new Date('2024-01-02'),
      metadata: {
        lastLogin: new Date(),
        loginCount: 35
      }
    }
  ];

  // Fast serialization using compiled schema
  const arraySchema = Schemas.array(userSchema);
  return serializer.serialize(users, arraySchema);
});

// Test:
// curl http://localhost:3000/users

// =============================================================================
// 8. Custom Content-Type Parser
// =============================================================================

// Add custom CSV parser
app.addContentTypeParser('text/csv', async (req) => {
  const text = await req.text();
  const lines = text.split('\n');
  const headers = lines[0].split(',');

  const data = lines.slice(1).map(line => {
    const values = line.split(',');
    const obj: any = {};
    headers.forEach((header, i) => {
      obj[header.trim()] = values[i]?.trim();
    });
    return obj;
  });

  return { headers, data };
});

app.post('/import/csv', async (req, context) => {
  const { headers, data } = context?.body || { headers: [], data: [] };

  console.log('CSV headers:', headers);
  console.log('CSV rows:', data.length);

  return {
    imported: data.length,
    preview: data.slice(0, 3)
  };
});

// Test:
// curl -X POST http://localhost:3000/import/csv \
//   -H "Content-Type: text/csv" \
//   -d "name,email,age
// John,john@example.com,30
// Jane,jane@example.com,28"

// =============================================================================
// 9. Error Handling Demo
// =============================================================================

app.post('/validate', async (req, context) => {
  const { email, age } = context?.body || {};

  // Validation
  if (!email || !email.includes('@')) {
    return new Response(
      JSON.stringify({ error: 'Invalid email' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (age < 18) {
    return new Response(
      JSON.stringify({ error: 'Must be 18 or older' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return { valid: true };
});

// Test valid:
// curl -X POST http://localhost:3000/validate \
//   -H "Content-Type: application/json" \
//   -d '{"email":"john@example.com","age":25}'

// Test invalid:
// curl -X POST http://localhost:3000/validate \
//   -H "Content-Type: application/json" \
//   -d '{"email":"invalid","age":15}'

// =============================================================================
// 10. Complex Nested Response Schema
// =============================================================================

const addressSchema = Schemas.object({
  street: Schemas.string(),
  city: Schemas.string(),
  state: Schemas.string(),
  zip: Schemas.string()
}, ['street', 'city', 'state', 'zip']);

const profileSchema = Schemas.object({
  bio: Schemas.string(),
  website: Schemas.string(),
  social: Schemas.object({
    twitter: Schemas.string(),
    github: Schemas.string()
  }, ['twitter', 'github'])
}, ['bio', 'website', 'social']);

const fullUserSchema = Schemas.object({
  id: Schemas.string(),
  name: Schemas.string(),
  email: Schemas.string(),
  address: addressSchema,
  profile: profileSchema,
  tags: Schemas.array(Schemas.string()),
  createdAt: Schemas.date()
}, ['id', 'name', 'email', 'address', 'profile', 'tags', 'createdAt']);

app.get('/profile/:id', async (req, context) => {
  const profile = {
    id: context?.params.id,
    name: 'John Doe',
    email: 'john@example.com',
    address: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      zip: '10001'
    },
    profile: {
      bio: 'Software Engineer',
      website: 'https://johndoe.com',
      social: {
        twitter: '@johndoe',
        github: 'johndoe'
      }
    },
    tags: ['developer', 'typescript', 'bun'],
    createdAt: new Date('2024-01-01')
  };

  return serializer.serialize(profile, fullUserSchema);
});

// Test:
// curl http://localhost:3000/profile/123

// =============================================================================
// Start Server
// =============================================================================

const server = await app.listen({ port: 3000 });

console.log('🚀 Ogelfy Content Parsing Demo');
console.log('📡 Server running on http://localhost:3000');
console.log('');
console.log('Available endpoints:');
console.log('  POST   /api/users       - JSON parsing');
console.log('  POST   /login           - Form data parsing');
console.log('  POST   /upload          - File upload (multipart)');
console.log('  POST   /echo            - Plain text');
console.log('  POST   /binary          - Binary data');
console.log('  GET    /users/:id       - Route params + query');
console.log('  GET    /users           - Fast serialization');
console.log('  POST   /import/csv      - Custom CSV parser');
console.log('  POST   /validate        - Error handling');
console.log('  GET    /profile/:id     - Complex nested schema');
console.log('');
console.log('Press Ctrl+C to stop');
