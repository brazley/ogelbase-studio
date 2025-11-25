# Content Parsing & Serialization in Ogelfy

Ogelfy provides powerful content-type parsing and fast JSON serialization out of the box.

## Content-Type Parsing

### Supported Content Types

Ogelfy automatically parses request bodies based on the `Content-Type` header:

1. **application/json** - JSON data
2. **application/x-www-form-urlencoded** - Form data
3. **multipart/form-data** - File uploads + form fields
4. **text/plain** - Plain text
5. **application/octet-stream** - Binary data

### Accessing Parsed Body

The parsed body is automatically available in the route context:

```typescript
import { Ogelfy } from '@security/ogelfy';

const app = new Ogelfy();

app.post('/users', async (req, context) => {
  // Body is automatically parsed based on Content-Type
  const { name, email } = context.body;

  return {
    id: '123',
    name,
    email
  };
});
```

### JSON Parsing

```typescript
app.post('/api/data', async (req, context) => {
  // Content-Type: application/json
  console.log(context.body); // { foo: 'bar', nested: { value: 123 } }

  return { received: true };
});
```

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/data \
  -H "Content-Type: application/json" \
  -d '{"foo":"bar","nested":{"value":123}}'
```

### URL-Encoded Form Parsing

```typescript
app.post('/login', async (req, context) => {
  // Content-Type: application/x-www-form-urlencoded
  const { username, password } = context.body;

  return { token: 'jwt-token' };
});
```

**Example Request:**
```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=john&password=secret123"
```

### Multipart Form Data (File Uploads)

```typescript
app.post('/upload', async (req, context) => {
  // Content-Type: multipart/form-data
  const { fields, files } = context.body;

  console.log(fields); // { title: 'My Upload' }
  console.log(files);  // [{ name, filename, mimeType, data }]

  // Save file
  const file = files[0];
  await Bun.write(`./uploads/${file.filename}`, file.data);

  return { uploaded: true, filename: file.filename };
});
```

**Example Request:**
```bash
curl -X POST http://localhost:3000/upload \
  -F "title=My Upload" \
  -F "file=@document.pdf"
```

### Plain Text Parsing

```typescript
app.post('/echo', async (req, context) => {
  // Content-Type: text/plain
  const text = context.body; // string

  return { received: text };
});
```

### Binary Data Parsing

```typescript
app.post('/binary', async (req, context) => {
  // Content-Type: application/octet-stream
  const buffer = context.body; // ArrayBuffer

  const size = buffer.byteLength;
  return { size };
});
```

## Custom Content-Type Parsers

Add your own parsers for custom content types:

```typescript
const app = new Ogelfy();

// Add custom XML parser
app.addContentTypeParser('application/xml', async (req) => {
  const text = await req.text();
  // Parse XML (use a library like fast-xml-parser)
  return parseXML(text);
});

app.post('/xml-data', async (req, context) => {
  // Body will be parsed using your custom parser
  console.log(context.body); // Parsed XML object

  return { success: true };
});
```

### Remove Content-Type Parser

```typescript
app.removeContentTypeParser('application/xml');
```

## Fast JSON Serialization

Ogelfy uses schema-based compilation for 3x faster JSON serialization.

### Default Serialization

By default, Ogelfy serializes responses automatically:

```typescript
app.get('/user', async () => {
  return {
    id: '123',
    name: 'John',
    createdAt: new Date()
  };
  // Automatically serialized to JSON with Date handling
});
```

### Schema-Based Serialization

For maximum performance, define schemas:

```typescript
import { Ogelfy, Schemas, createRouteSchema } from '@security/ogelfy';

const app = new Ogelfy();

const userSchema = Schemas.object({
  id: Schemas.string(),
  name: Schemas.string(),
  email: Schemas.string(),
  age: Schemas.number(),
  active: Schemas.boolean(),
  createdAt: Schemas.date()
}, ['id', 'name', 'email']); // Required fields

app.get('/users/:id', async (req, context) => {
  const user = await getUser(context.params.id);

  // Use serializer directly with schema
  return app.serializer.serialize(user, userSchema);
});
```

### Schema Builders

Ogelfy provides schema builders for common types:

```typescript
// Primitive types
Schemas.string()
Schemas.number()
Schemas.boolean()
Schemas.null()

// Special formats
Schemas.date()      // ISO date-time string
Schemas.bigint()    // BigInt as number

// Complex types
Schemas.array(itemSchema)
Schemas.object(properties, requiredFields)
```

### Example: Nested Objects

```typescript
const addressSchema = Schemas.object({
  street: Schemas.string(),
  city: Schemas.string(),
  zip: Schemas.string()
}, ['street', 'city']);

const userSchema = Schemas.object({
  id: Schemas.string(),
  name: Schemas.string(),
  address: addressSchema  // Nested object
}, ['id', 'name', 'address']);
```

### Example: Arrays

```typescript
const userListSchema = Schemas.array(
  Schemas.object({
    id: Schemas.string(),
    name: Schemas.string()
  }, ['id', 'name'])
);

app.get('/users', async () => {
  const users = await getAllUsers();
  return app.serializer.serialize(users, userListSchema);
});
```

## Route Context

Every route handler receives a `context` object with parsed data:

```typescript
interface RouteContext {
  params: Record<string, string>;  // Route params (/users/:id)
  query: Record<string, string>;   // Query params (?page=1)
  body?: any;                      // Parsed request body
}
```

### Example: Using All Context

```typescript
app.get('/search/:category', async (req, context) => {
  const category = context.params.category;  // Route param
  const page = context.query.page || '1';    // Query param

  const results = await search(category, parseInt(page));

  return {
    category,
    page: parseInt(page),
    results
  };
});
```

**Request:**
```bash
curl http://localhost:3000/search/electronics?page=2
```

### POST with Body

```typescript
app.post('/users/:id/update', async (req, context) => {
  const userId = context.params.id;          // Route param
  const updates = context.body;              // Parsed body

  await updateUser(userId, updates);

  return { success: true };
});
```

**Request:**
```bash
curl -X POST http://localhost:3000/users/123/update \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'
```

## Error Handling

### Invalid Content-Type

If the content-type is unsupported, Ogelfy returns 400:

```typescript
app.post('/data', async (req, context) => {
  return { success: true };
});
```

**Request with unsupported content-type:**
```bash
curl -X POST http://localhost:3000/data \
  -H "Content-Type: application/xml" \
  -d '<data>test</data>'
```

**Response:**
```json
{
  "error": "Bad Request",
  "message": "Unsupported content-type: application/xml"
}
```

### Invalid JSON

```bash
curl -X POST http://localhost:3000/data \
  -H "Content-Type: application/json" \
  -d '{ invalid json'
```

**Response:**
```json
{
  "error": "Bad Request",
  "message": "Failed to parse application/json: Invalid JSON"
}
```

## Performance Tips

### 1. Use Schema-Based Serialization

Schema compilation provides significant speedup for repeated serialization:

```typescript
// Pre-compile schema
const schema = Schemas.object({
  id: Schemas.string(),
  name: Schemas.string()
}, ['id', 'name']);

const compiled = app.serializer.compile(schema);

// Use compiled serializer in hot path
app.get('/users', async () => {
  const users = await getAllUsers();
  return compiled(users);
});
```

### 2. Cache Schemas

Schemas are automatically cached by the serializer:

```typescript
// First call compiles and caches
app.serializer.serialize(data, schema);

// Subsequent calls use cached version
app.serializer.serialize(data2, schema); // Fast!
```

### 3. Avoid Over-Parsing

For GET/HEAD requests, body parsing is automatically skipped:

```typescript
app.get('/data', async () => {
  // No body parsing overhead
  return { data: 'fast' };
});
```

## Advanced Usage

### Direct Access to Parsers

```typescript
import { ContentTypeParser } from '@security/ogelfy';

const parser = new ContentTypeParser();

// Parse manually
const req = new Request('http://localhost', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ test: true })
});

const body = await parser.parse(req);
console.log(body); // { test: true }
```

### Direct Access to Serializer

```typescript
import { Serializer, Schemas } from '@security/ogelfy';

const serializer = new Serializer();

const data = {
  id: '123',
  name: 'John',
  createdAt: new Date()
};

// Without schema
const json1 = serializer.serialize(data);

// With schema (faster)
const schema = Schemas.object({
  id: Schemas.string(),
  name: Schemas.string(),
  createdAt: Schemas.date()
}, ['id', 'name', 'createdAt']);

const json2 = serializer.serialize(data, schema);
```

## Best Practices

1. **Define schemas for repeated serialization** - Pre-compile schemas for hot paths
2. **Use appropriate content-types** - Match your data format
3. **Validate input** - Use schema validation with the SchemaCompiler
4. **Handle file uploads carefully** - Implement size limits and type validation
5. **Cache compiled schemas** - Reuse schema compilation results

## Migration from Other Frameworks

### From Fastify

```typescript
// Fastify
fastify.post('/user', {
  schema: {
    body: {
      type: 'object',
      properties: {
        name: { type: 'string' }
      }
    }
  }
}, async (request, reply) => {
  return { received: request.body.name };
});

// Ogelfy
app.post('/user', async (req, context) => {
  return { received: context.body.name };
});
```

### From Express

```typescript
// Express
app.post('/user', express.json(), (req, res) => {
  res.json({ received: req.body.name });
});

// Ogelfy (JSON parsing automatic)
app.post('/user', async (req, context) => {
  return { received: context.body.name };
});
```

## Summary

Ogelfy provides:

- **Automatic content-type parsing** for JSON, forms, multipart, text, binary
- **Fast schema-based serialization** with compilation and caching
- **Custom parser support** for any content-type
- **Built-in error handling** for invalid content
- **Zero configuration** required - works out of the box

All parsing and serialization happens automatically, but you have full control when you need it.
