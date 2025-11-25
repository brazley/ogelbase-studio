# Ticket OGELFY-06: Content-Type Handling + Fast Serialization

**Agent**: Miguel Santos (API & Middleware Engineer)
**Created**: 2025-11-22
**Status**: Ready to Start
**Estimated Effort**: 6-8 hours
**Priority**: P1 (Fastify Parity - Phase 1)
**Dependencies**: OGELFY-01 (Core Framework)
**Sprint**: Ogelfy Extended Features

---

## Objective

Build Fastify-level content parsing and fast JSON serialization for Ogelfy framework.

**Reference**: `.ProjectNotesAndResearch/Ogelfy/FASTIFY-PARITY-ROADMAP.md` (Items #3 and #4)

---

## Part 1: Content-Type Parsing System

### Features to Implement

#### 1. Built-in Parsers

**File**: `src/content-type.ts` (~800 lines)

```typescript
export class ContentTypeParser {
  private parsers: Map<string, ParserFunction>;

  constructor() {
    this.registerDefaultParsers();
  }

  // Default parsers
  private registerDefaultParsers() {
    // JSON (default)
    this.add('application/json', async (req) => await req.json());

    // URL-encoded forms
    this.add('application/x-www-form-urlencoded', async (req) => {
      const form = await req.formData();
      return Object.fromEntries(form);
    });

    // Plain text
    this.add('text/plain', async (req) => await req.text());

    // Binary/Buffer
    this.add('application/octet-stream', async (req) => {
      return await req.arrayBuffer();
    });
  }

  add(contentType: string, parser: ParserFunction): void;
  parse(req: Request): Promise<any>;
}
```

**Usage Examples**:
```typescript
// JSON (default)
app.post('/json', async (req) => {
  const body = await req.json(); // Already parsed
});

// URL-encoded forms
app.post('/form', async (req) => {
  const body = await req.formData();
});

// Plain text
app.post('/text', async (req) => {
  const body = await req.text();
});

// Binary/Buffer
app.post('/binary', async (req) => {
  const body = await req.arrayBuffer();
});
```

#### 2. Custom Content-Type Parsers

```typescript
// YAML parser
app.addContentTypeParser('application/yaml', async (req, payload) => {
  const text = await payload.text();
  return parseYAML(text);
});

// MessagePack parser
app.addContentTypeParser('application/msgpack', async (req, payload) => {
  const buffer = await payload.arrayBuffer();
  return decodeMsgPack(buffer);
});
```

#### 3. Multipart/Form-Data (File Uploads)

**File**: `src/multipart.ts` (~600 lines)

**Dependencies**:
```json
{
  "dependencies": {
    "@fastify/busboy": "^2.1.0"
  }
}
```

**Implementation**:
```typescript
import busboy from '@fastify/busboy';

export async function parseMultipart(req: Request): Promise<MultipartData> {
  const bb = busboy({ headers: Object.fromEntries(req.headers) });
  const files: FileData[] = [];
  const fields: Record<string, string> = {};

  bb.on('file', (fieldname, file, info) => {
    files.push({
      fieldname,
      filename: info.filename,
      mimetype: info.mimeType,
      file // ReadableStream
    });
  });

  bb.on('field', (fieldname, value) => {
    fields[fieldname] = value;
  });

  // Pipe request body to busboy
  req.body.pipeTo(new WritableStream({
    write(chunk) { bb.write(chunk); },
    close() { bb.end(); }
  }));

  return { fields, files };
}

// Usage
app.post('/upload', async (req, reply) => {
  const data = await req.file();

  console.log(data.filename);
  console.log(data.mimetype);
  console.log(data.file); // ReadableStream

  await data.file.pipeTo(destination);
});

// Multiple files
app.post('/uploads', async (req, reply) => {
  const files = await req.files();

  for (const file of files) {
    await saveFile(file);
  }
});
```

#### 4. Stream Handling

```typescript
app.post('/stream', async (req, reply) => {
  const stream = req.body; // ReadableStream

  await stream.pipeTo(writableStream);
});
```

#### 5. Payload Limits

```typescript
// Global limit
const app = new Ogelfy({
  bodyLimit: 1048576 // 1MB
});

// Per-route limits
app.post('/upload', {
  bodyLimit: 10485760 // 10MB
}, handler);
```

**Implementation in Router**:
```typescript
interface RouteOptions {
  bodyLimit?: number;
  // Other options...
}

// Check content-length before parsing
if (contentLength > bodyLimit) {
  throw new PayloadTooLargeError();
}
```

---

## Part 2: Fast JSON Serialization

### Features to Implement

#### 1. Schema-Based Serialization

**File**: `src/serialization.ts` (~700 lines)

**Dependencies**:
```json
{
  "dependencies": {
    "fast-json-stringify": "^5.10.0"
  }
}
```

**Implementation**:
```typescript
import fastJson from 'fast-json-stringify';

export class SerializationManager {
  private serializers: Map<number, (obj: any) => string>;

  compile(statusCode: number, schema: object): (obj: any) => string {
    const cached = this.serializers.get(statusCode);
    if (cached) return cached;

    const serializer = fastJson(schema);
    this.serializers.set(statusCode, serializer);
    return serializer;
  }

  serialize(statusCode: number, data: any): string {
    const serializer = this.serializers.get(statusCode);
    return serializer ? serializer(data) : JSON.stringify(data);
  }
}
```

**Usage**:
```typescript
app.get('/user', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          age: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
}, async () => {
  return {
    id: '123',
    name: 'John',
    age: 30,
    createdAt: new Date()
  };
  // Automatically serialized with fast-json-stringify (3x faster)
});
```

#### 2. Date/BigInt Handling

```typescript
const schema = {
  type: 'object',
  properties: {
    timestamp: { type: 'string', format: 'date-time' },
    bigNumber: { type: 'string' } // BigInt as string
  }
};
```

#### 3. Null/Undefined Handling

```typescript
const schema = {
  type: 'object',
  properties: {
    optional: { type: ['string', 'null'] }
  }
};
```

---

## Deliverables

### Implementation Files

1. **src/content-type.ts** (800 lines) - Content-type parser registry
2. **src/multipart.ts** (600 lines) - Multipart/form-data handling
3. **src/serialization.ts** (700 lines) - Fast JSON serialization
4. **src/index.ts** (update) - Integrate parsing and serialization
5. **src/types.ts** (update) - Type definitions for new features

### Test Files

6. **__tests__/content-type.test.ts** (30+ tests) - Parser tests
7. **__tests__/serialization.test.ts** (20+ tests) - Serialization tests
8. **__tests__/multipart.test.ts** (15+ tests) - File upload tests

### Configuration

9. **package.json** (update) - Add dependencies:
   - `fast-json-stringify: ^5.10.0`
   - `@fastify/busboy: ^2.1.0`

---

## Acceptance Criteria

### Content-Type Parsing
- [ ] JSON, form, text, binary parsing working
- [ ] Custom content-type parsers registerable
- [ ] Multipart/form-data (file uploads) working
- [ ] Stream handling for large payloads
- [ ] Payload size limits enforced
- [ ] Content-Type negotiation working

### Serialization
- [ ] fast-json-stringify integration working
- [ ] Schema-based serialization compilation
- [ ] Date/BigInt handling correct
- [ ] Null/undefined handling correct
- [ ] 3x faster than JSON.stringify (benchmarked)

### Testing
- [ ] All tests passing (65+ total)
- [ ] >80% code coverage
- [ ] Edge cases covered (invalid content-type, missing headers, etc.)
- [ ] Memory leak tests passing

### Performance
- [ ] Parsing overhead <1ms for small payloads
- [ ] Streaming works without loading full payload in memory
- [ ] Serialization 3x faster with schema vs without
- [ ] No memory leaks under load

---

## Technical Specifications

### Content-Type Parser Architecture

```typescript
// src/content-type.ts
export type ParserFunction = (req: Request) => Promise<any>;

export class ContentTypeParser {
  private parsers: Map<string, ParserFunction>;
  private bodyLimit: number;

  constructor(options?: { bodyLimit?: number }) {
    this.parsers = new Map();
    this.bodyLimit = options?.bodyLimit || 1048576; // 1MB default
    this.registerDefaultParsers();
  }

  add(contentType: string, parser: ParserFunction): void {
    this.parsers.set(contentType, parser);
  }

  async parse(req: Request): Promise<any> {
    // Check content-length
    const contentLength = parseInt(req.headers.get('content-length') || '0');
    if (contentLength > this.bodyLimit) {
      throw new PayloadTooLargeError(contentLength, this.bodyLimit);
    }

    // Get content-type (strip charset)
    const contentType = req.headers.get('content-type')?.split(';')[0];

    // Find parser
    const parser = this.parsers.get(contentType || 'application/json');
    if (!parser) {
      throw new UnsupportedMediaTypeError(contentType);
    }

    // Parse
    return await parser(req);
  }

  private registerDefaultParsers(): void {
    // JSON
    this.add('application/json', async (req) => await req.json());

    // Form
    this.add('application/x-www-form-urlencoded', async (req) => {
      const form = await req.formData();
      return Object.fromEntries(form);
    });

    // Text
    this.add('text/plain', async (req) => await req.text());

    // Binary
    this.add('application/octet-stream', async (req) => {
      return await req.arrayBuffer();
    });

    // Multipart
    this.add('multipart/form-data', async (req) => {
      return await parseMultipart(req);
    });
  }
}

export class PayloadTooLargeError extends Error {
  statusCode = 413;
  constructor(actual: number, limit: number) {
    super(`Payload too large: ${actual} bytes (limit: ${limit})`);
  }
}

export class UnsupportedMediaTypeError extends Error {
  statusCode = 415;
  constructor(contentType: string | null) {
    super(`Unsupported media type: ${contentType}`);
  }
}
```

### Multipart Handler Architecture

```typescript
// src/multipart.ts
import busboy from '@fastify/busboy';
import type { Readable } from 'stream';

export interface FileData {
  fieldname: string;
  filename: string;
  encoding: string;
  mimetype: string;
  file: Readable;
}

export interface MultipartData {
  fields: Record<string, string>;
  files: FileData[];
}

export async function parseMultipart(req: Request): Promise<MultipartData> {
  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers: Object.fromEntries(req.headers),
      limits: {
        fileSize: 10 * 1024 * 1024 // 10MB per file
      }
    });

    const files: FileData[] = [];
    const fields: Record<string, string> = {};

    bb.on('file', (fieldname, file, info) => {
      files.push({
        fieldname,
        filename: info.filename,
        encoding: info.encoding,
        mimetype: info.mimeType,
        file
      });
    });

    bb.on('field', (fieldname, value) => {
      fields[fieldname] = value;
    });

    bb.on('finish', () => {
      resolve({ fields, files });
    });

    bb.on('error', reject);

    // Pipe request body to busboy
    const reader = req.body?.getReader();
    if (!reader) {
      reject(new Error('No request body'));
      return;
    }

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            bb.end();
            break;
          }
          bb.write(value);
        }
      } catch (err) {
        reject(err);
      }
    })();
  });
}
```

### Serialization Manager Architecture

```typescript
// src/serialization.ts
import fastJson from 'fast-json-stringify';
import type { JSONSchema } from 'fast-json-stringify';

export class SerializationManager {
  private serializers: Map<string, (obj: any) => string>;

  constructor() {
    this.serializers = new Map();
  }

  compile(key: string, schema: JSONSchema): (obj: any) => string {
    const cached = this.serializers.get(key);
    if (cached) return cached;

    const serializer = fastJson(schema);
    this.serializers.set(key, serializer);
    return serializer;
  }

  serialize(key: string, data: any): string {
    const serializer = this.serializers.get(key);
    return serializer ? serializer(data) : JSON.stringify(data);
  }

  has(key: string): boolean {
    return this.serializers.has(key);
  }

  clear(): void {
    this.serializers.clear();
  }
}

// Helper for creating schema keys
export function createSchemaKey(route: string, statusCode: number): string {
  return `${route}:${statusCode}`;
}
```

---

## Integration with Ogelfy Core

### Update to `src/index.ts`

```typescript
import { ContentTypeParser } from './content-type';
import { SerializationManager } from './serialization';

export class Ogelfy {
  private router: Router;
  private contentTypeParser: ContentTypeParser;
  private serializationManager: SerializationManager;

  constructor(options?: OgelfyOptions) {
    this.router = new Router();
    this.contentTypeParser = new ContentTypeParser({
      bodyLimit: options?.bodyLimit
    });
    this.serializationManager = new SerializationManager();
  }

  // Add method for custom content-type parsers
  addContentTypeParser(contentType: string, parser: ParserFunction) {
    this.contentTypeParser.add(contentType, parser);
  }

  // Update route registration to support schemas
  get(path: string, options: RouteOptions | RouteHandler, handler?: RouteHandler) {
    // Handle both signatures
    const opts = typeof options === 'function' ? {} : options;
    const fn = typeof options === 'function' ? options : handler!;

    // Compile response serializers if schema provided
    if (opts.schema?.response) {
      for (const [statusCode, schema] of Object.entries(opts.schema.response)) {
        const key = createSchemaKey(path, parseInt(statusCode));
        this.serializationManager.compile(key, schema);
      }
    }

    this.router.add('GET', path, fn, opts);
  }

  // Similar for post, put, delete...
}
```

---

## Testing Strategy

### Content-Type Tests (30+ tests)

```typescript
// __tests__/content-type.test.ts
describe('ContentTypeParser', () => {
  describe('Built-in parsers', () => {
    it('should parse JSON');
    it('should parse URL-encoded form');
    it('should parse plain text');
    it('should parse binary data');
    it('should parse multipart/form-data');
  });

  describe('Custom parsers', () => {
    it('should register custom parser');
    it('should use custom parser for matching content-type');
    it('should throw on unsupported content-type');
  });

  describe('Payload limits', () => {
    it('should enforce global body limit');
    it('should enforce per-route body limit');
    it('should throw 413 when payload too large');
  });

  describe('Error handling', () => {
    it('should throw 415 for unsupported media type');
    it('should handle malformed JSON');
    it('should handle missing content-type header');
  });

  describe('Streaming', () => {
    it('should handle large payloads via streaming');
    it('should not load full payload in memory');
  });
});
```

### Serialization Tests (20+ tests)

```typescript
// __tests__/serialization.test.ts
describe('SerializationManager', () => {
  describe('Schema compilation', () => {
    it('should compile JSON schema to serializer');
    it('should cache compiled serializers');
    it('should handle nested objects');
    it('should handle arrays');
  });

  describe('Data type handling', () => {
    it('should serialize dates as ISO strings');
    it('should serialize BigInt as strings');
    it('should handle null values');
    it('should handle undefined values');
  });

  describe('Performance', () => {
    it('should be 3x faster than JSON.stringify');
    it('should have minimal compilation overhead');
  });

  describe('Error handling', () => {
    it('should fall back to JSON.stringify if no schema');
    it('should handle serialization errors gracefully');
  });
});
```

### Multipart Tests (15+ tests)

```typescript
// __tests__/multipart.test.ts
describe('Multipart parsing', () => {
  describe('File uploads', () => {
    it('should parse single file upload');
    it('should parse multiple file uploads');
    it('should extract file metadata');
    it('should stream file data');
  });

  describe('Form fields', () => {
    it('should parse form fields alongside files');
    it('should handle multiple values for same field');
  });

  describe('Limits', () => {
    it('should enforce file size limits');
    it('should enforce field count limits');
  });

  describe('Error handling', () => {
    it('should handle malformed multipart data');
    it('should handle missing boundary');
    it('should handle truncated uploads');
  });
});
```

---

## Implementation Notes

### Memory Management

**Critical**: Stream handling must not load full payloads into memory.

```typescript
// Good: Stream to destination
await req.body.pipeTo(writableStream);

// Bad: Load entire payload
const buffer = await req.arrayBuffer(); // Don't do this for large files!
```

### Error Handling

All parsers must throw proper HTTP errors:
- `413 Payload Too Large` - Content-Length exceeds limit
- `415 Unsupported Media Type` - No parser for content-type
- `400 Bad Request` - Malformed payload

### Performance Considerations

1. **Parser Selection**: O(1) lookup via Map
2. **Schema Compilation**: Compile once, reuse many times
3. **Streaming**: Use streams for large payloads
4. **Serialization**: fast-json-stringify is 3x faster

---

## Agent Instructions

**Miguel Santos**: You are building content-type handling and fast serialization for Ogelfy.

### Key Focus Areas

1. **Correct Streaming**: Memory-efficient handling of large payloads
2. **Parser Registry**: Clean API for registering custom parsers
3. **Fast Serialization**: Schema compilation and caching
4. **Type Safety**: Full TypeScript types for all APIs
5. **Error Handling**: Clear, actionable error messages

### Implementation Order

1. **Day 1 Morning** (3 hours):
   - Implement ContentTypeParser class
   - Add built-in parsers (JSON, form, text, binary)
   - Add payload limit enforcement
   - Write tests for content-type parsing

2. **Day 1 Afternoon** (2 hours):
   - Implement multipart parser
   - Add file upload support
   - Write tests for multipart

3. **Day 2 Morning** (2 hours):
   - Implement SerializationManager
   - Integrate fast-json-stringify
   - Add schema compilation and caching
   - Write tests for serialization

4. **Day 2 Afternoon** (1 hour):
   - Integrate into Ogelfy core
   - Update examples and documentation
   - Run full test suite
   - Performance validation

### Reference Materials

- **Fastify Source**: `/Users/quikolas/Documents/Open Source Repos/fastify-main/lib/contentTypeParser.js`
- **Fastify Serialization**: `/Users/quikolas/Documents/Open Source Repos/fastify-main/lib/serialization.js`
- **Roadmap**: `.ProjectNotesAndResearch/Ogelfy/FASTIFY-PARITY-ROADMAP.md`
- **Ogelfy Core**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/src/`

### Questions?

Ask Dylan Torres (TPM) for clarification or unblocking.

---

**Created**: 2025-11-22
**Last Updated**: 2025-11-22
**TPM**: Dylan Torres
**Status**: Ready to Deploy
