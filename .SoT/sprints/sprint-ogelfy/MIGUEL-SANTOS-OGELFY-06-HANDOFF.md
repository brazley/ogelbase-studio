# Miguel Santos - Content-Type + Serialization Implementation

**Ticket**: OGELFY-06 - Content-Type Handling + Fast Serialization
**Deployed**: 2025-11-22
**Estimated Effort**: 6-8 hours
**Status**: Ready to Start

---

## Mission

Build **Fastify-level content parsing** and **fast JSON serialization** for Ogelfy - bringing us closer to full Fastify parity.

This implements **Phase 1** items #3 and #4 from the Fastify Parity Roadmap.

---

## What You're Building

### Part 1: Content-Type Parsing System (4 hours)
- Built-in parsers: JSON, URL-encoded, text, binary
- Custom parser registration
- Multipart/form-data with file uploads
- Stream handling for large payloads
- Payload size limits

### Part 2: Fast JSON Serialization (2-3 hours)
- Schema-based compilation with fast-json-stringify
- 3x faster serialization
- Date/BigInt handling
- Serializer caching

---

## Working Directory

```
/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/
```

---

## Quick Start

```bash
# Navigate to Ogelfy package
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy

# Install new dependencies
bun add fast-json-stringify @fastify/busboy

# Create new files
touch src/content-type.ts
touch src/multipart.ts
touch src/serialization.ts
touch __tests__/content-type.test.ts
touch __tests__/multipart.test.ts
touch __tests__/serialization.test.ts

# You're ready to build!
```

---

## Part 1: Content-Type Parser

### File: `src/content-type.ts` (~800 lines)

```typescript
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
    // 1. Check content-length
    const contentLength = parseInt(req.headers.get('content-length') || '0');
    if (contentLength > this.bodyLimit) {
      throw new PayloadTooLargeError(contentLength, this.bodyLimit);
    }

    // 2. Get content-type (strip charset)
    const contentType = req.headers.get('content-type')?.split(';')[0];

    // 3. Find parser
    const parser = this.parsers.get(contentType || 'application/json');
    if (!parser) {
      throw new UnsupportedMediaTypeError(contentType);
    }

    // 4. Parse
    return await parser(req);
  }

  private registerDefaultParsers(): void {
    // JSON (already works with Bun)
    this.add('application/json', async (req) => await req.json());

    // URL-encoded forms
    this.add('application/x-www-form-urlencoded', async (req) => {
      const form = await req.formData();
      return Object.fromEntries(form);
    });

    // Plain text
    this.add('text/plain', async (req) => await req.text());

    // Binary
    this.add('application/octet-stream', async (req) => {
      return await req.arrayBuffer();
    });

    // Multipart (delegate to multipart handler)
    this.add('multipart/form-data', async (req) => {
      const { parseMultipart } = await import('./multipart');
      return await parseMultipart(req);
    });
  }
}

// Error classes
export class PayloadTooLargeError extends Error {
  statusCode = 413;
  constructor(actual: number, limit: number) {
    super(`Payload too large: ${actual} bytes (limit: ${limit})`);
    this.name = 'PayloadTooLargeError';
  }
}

export class UnsupportedMediaTypeError extends Error {
  statusCode = 415;
  constructor(contentType: string | null) {
    super(`Unsupported media type: ${contentType}`);
    this.name = 'UnsupportedMediaTypeError';
  }
}
```

### Usage Examples

```typescript
// Built-in JSON parser
app.post('/json', async (req) => {
  const body = await req.json();
  return { received: body };
});

// Custom YAML parser
app.addContentTypeParser('application/yaml', async (req, payload) => {
  const text = await payload.text();
  return parseYAML(text); // You'd need yaml library
});
```

---

## Part 2: Multipart Handler

### File: `src/multipart.ts` (~600 lines)

```typescript
import busboy from '@fastify/busboy';

export interface FileData {
  fieldname: string;
  filename: string;
  encoding: string;
  mimetype: string;
  file: ReadableStream;
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
      // Convert Node.js Readable to Web ReadableStream
      const webStream = new ReadableStream({
        start(controller) {
          file.on('data', (chunk) => controller.enqueue(chunk));
          file.on('end', () => controller.close());
          file.on('error', (err) => controller.error(err));
        }
      });

      files.push({
        fieldname,
        filename: info.filename,
        encoding: info.encoding,
        mimetype: info.mimeType,
        file: webStream
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

// Helper methods for Ogelfy integration
export async function* parseMultipartFiles(req: Request) {
  const data = await parseMultipart(req);
  for (const file of data.files) {
    yield file;
  }
}
```

### Usage Examples

```typescript
// Single file upload
app.post('/upload', async (req) => {
  const data = await parseMultipart(req);
  const file = data.files[0];

  // Save file
  await Bun.write(`./uploads/${file.filename}`, file.file);

  return { success: true, filename: file.filename };
});

// Multiple files
app.post('/uploads', async (req) => {
  const data = await parseMultipart(req);

  for (const file of data.files) {
    await Bun.write(`./uploads/${file.filename}`, file.file);
  }

  return { success: true, count: data.files.length };
});
```

---

## Part 3: Fast Serialization

### File: `src/serialization.ts` (~700 lines)

```typescript
import fastJson from 'fast-json-stringify';

export type JSONSchema = any; // Import proper type from fast-json-stringify

export class SerializationManager {
  private serializers: Map<string, (obj: any) => string>;

  constructor() {
    this.serializers = new Map();
  }

  /**
   * Compile a JSON schema into a fast serializer
   */
  compile(key: string, schema: JSONSchema): (obj: any) => string {
    // Check cache
    const cached = this.serializers.get(key);
    if (cached) return cached;

    // Compile new serializer
    const serializer = fastJson(schema);
    this.serializers.set(key, serializer);

    return serializer;
  }

  /**
   * Serialize data using compiled serializer
   */
  serialize(key: string, data: any): string {
    const serializer = this.serializers.get(key);

    // Fall back to JSON.stringify if no schema
    return serializer ? serializer(data) : JSON.stringify(data);
  }

  /**
   * Check if serializer exists
   */
  has(key: string): boolean {
    return this.serializers.has(key);
  }

  /**
   * Clear all serializers
   */
  clear(): void {
    this.serializers.clear();
  }

  /**
   * Get serializer count (for debugging)
   */
  get size(): number {
    return this.serializers.size;
  }
}

/**
 * Helper to create schema keys
 */
export function createSchemaKey(route: string, statusCode: number): string {
  return `${route}:${statusCode}`;
}

/**
 * Helper to create response schema keys
 */
export function createResponseSchemaKey(route: string, method: string, statusCode: number): string {
  return `${method}:${route}:${statusCode}`;
}
```

### Usage Examples

```typescript
// Schema-based serialization
app.get('/user/:id', {
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
}, async (req) => {
  return {
    id: '123',
    name: 'John',
    age: 30,
    createdAt: new Date()
  };
  // Automatically serialized with fast-json-stringify (3x faster!)
});
```

---

## Integration with Ogelfy Core

### Update `src/index.ts`

```typescript
import { ContentTypeParser } from './content-type';
import { SerializationManager, createResponseSchemaKey } from './serialization';

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

  /**
   * Add custom content-type parser
   */
  addContentTypeParser(contentType: string, parser: ParserFunction) {
    this.contentTypeParser.add(contentType, parser);
  }

  /**
   * Update route registration to support schemas
   */
  get(path: string, options: RouteOptions | RouteHandler, handler?: RouteHandler) {
    const opts = typeof options === 'function' ? {} : options;
    const fn = typeof options === 'function' ? options : handler!;

    // Compile response serializers if schema provided
    if (opts.schema?.response) {
      for (const [statusCode, schema] of Object.entries(opts.schema.response)) {
        const key = createResponseSchemaKey(path, 'GET', parseInt(statusCode));
        this.serializationManager.compile(key, schema);
      }
    }

    this.router.add('GET', path, fn, opts);
  }

  // Similar updates for post(), put(), delete()
  // ...

  /**
   * In the fetch handler, use content-type parser and serializer
   */
  async listen(options: { port: number; hostname?: string }): Promise<Server> {
    this.server = Bun.serve({
      port: options.port,
      hostname: options.hostname || 'localhost',
      fetch: async (req) => {
        const url = new URL(req.url);
        const route = this.router.find(req.method, url.pathname);

        if (!route) {
          return new Response('Not Found', { status: 404 });
        }

        try {
          // Parse request body with content-type parser
          let body;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            body = await this.contentTypeParser.parse(req);
            // Attach to request (you may need to extend Request type)
          }

          // Execute handler
          const result = await route.handler(req);

          // Serialize response with fast serializer
          const schemaKey = createResponseSchemaKey(
            url.pathname,
            req.method,
            200
          );

          const responseBody = this.serializationManager.has(schemaKey)
            ? this.serializationManager.serialize(schemaKey, result)
            : JSON.stringify(result);

          return new Response(responseBody, {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: String(error) }), {
            status: error.statusCode || 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    });

    return this.server;
  }
}
```

### Update `src/types.ts`

```typescript
export interface RouteOptions {
  schema?: {
    body?: any;
    query?: any;
    params?: any;
    response?: {
      [statusCode: number]: any;
    };
  };
  bodyLimit?: number;
}

export interface OgelfyOptions {
  logger?: boolean;
  bodyLimit?: number; // Default: 1MB
}
```

---

## Testing Strategy

### Content-Type Tests (30+)

**File**: `__tests__/content-type.test.ts`

```typescript
import { describe, it, expect } from 'bun:test';
import { ContentTypeParser, PayloadTooLargeError, UnsupportedMediaTypeError } from '../src/content-type';

describe('ContentTypeParser', () => {
  describe('Built-in parsers', () => {
    it('should parse JSON', async () => {
      const parser = new ContentTypeParser();
      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ foo: 'bar' })
      });

      const result = await parser.parse(req);
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should parse URL-encoded form', async () => {
      const parser = new ContentTypeParser();
      const formData = new FormData();
      formData.append('name', 'test');

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: formData
      });

      const result = await parser.parse(req);
      expect(result.name).toBe('test');
    });

    it('should parse plain text');
    it('should parse binary data');
  });

  describe('Custom parsers', () => {
    it('should register and use custom parser', async () => {
      const parser = new ContentTypeParser();
      parser.add('application/yaml', async (req) => ({ yaml: true }));

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/yaml' },
        body: 'foo: bar'
      });

      const result = await parser.parse(req);
      expect(result).toEqual({ yaml: true });
    });
  });

  describe('Payload limits', () => {
    it('should throw 413 when payload too large', async () => {
      const parser = new ContentTypeParser({ bodyLimit: 100 });

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '200'
        },
        body: 'x'.repeat(200)
      });

      await expect(parser.parse(req)).rejects.toThrow(PayloadTooLargeError);
    });

    it('should allow payloads under limit', async () => {
      const parser = new ContentTypeParser({ bodyLimit: 1000 });

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '50'
        },
        body: JSON.stringify({ small: true })
      });

      const result = await parser.parse(req);
      expect(result.small).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should throw 415 for unsupported media type', async () => {
      const parser = new ContentTypeParser();

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/unknown' },
        body: 'test'
      });

      await expect(parser.parse(req)).rejects.toThrow(UnsupportedMediaTypeError);
    });
  });
});
```

### Serialization Tests (20+)

**File**: `__tests__/serialization.test.ts`

```typescript
import { describe, it, expect } from 'bun:test';
import { SerializationManager, createSchemaKey } from '../src/serialization';

describe('SerializationManager', () => {
  describe('Schema compilation', () => {
    it('should compile and cache serializer', () => {
      const manager = new SerializationManager();
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' }
        }
      };

      const key = 'test-route:200';
      manager.compile(key, schema);

      expect(manager.has(key)).toBe(true);
      expect(manager.size).toBe(1);
    });

    it('should return cached serializer', () => {
      const manager = new SerializationManager();
      const schema = { type: 'object', properties: { id: { type: 'string' } } };

      const key = 'test:200';
      const serializer1 = manager.compile(key, schema);
      const serializer2 = manager.compile(key, schema);

      expect(serializer1).toBe(serializer2); // Same reference
    });
  });

  describe('Serialization', () => {
    it('should serialize data faster than JSON.stringify', () => {
      const manager = new SerializationManager();
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          age: { type: 'number' }
        }
      };

      const key = 'perf-test:200';
      manager.compile(key, schema);

      const data = { id: '123', name: 'Test', age: 30 };
      const iterations = 100000;

      // Measure fast-json-stringify
      const start1 = performance.now();
      for (let i = 0; i < iterations; i++) {
        manager.serialize(key, data);
      }
      const end1 = performance.now();

      // Measure JSON.stringify
      const start2 = performance.now();
      for (let i = 0; i < iterations; i++) {
        JSON.stringify(data);
      }
      const end2 = performance.now();

      const fastTime = end1 - start1;
      const slowTime = end2 - start2;

      console.log(`fast-json-stringify: ${fastTime.toFixed(2)}ms`);
      console.log(`JSON.stringify: ${slowTime.toFixed(2)}ms`);
      console.log(`Speedup: ${(slowTime / fastTime).toFixed(2)}x`);

      expect(fastTime).toBeLessThan(slowTime);
    });

    it('should handle Date objects', () => {
      const manager = new SerializationManager();
      const schema = {
        type: 'object',
        properties: {
          timestamp: { type: 'string', format: 'date-time' }
        }
      };

      manager.compile('date-test:200', schema);
      const result = manager.serialize('date-test:200', { timestamp: new Date('2025-01-01') });

      expect(result).toContain('2025-01-01');
    });

    it('should fall back to JSON.stringify when no schema', () => {
      const manager = new SerializationManager();
      const data = { foo: 'bar' };

      const result = manager.serialize('no-schema:200', data);
      expect(result).toBe(JSON.stringify(data));
    });
  });
});
```

### Multipart Tests (15+)

**File**: `__tests__/multipart.test.ts`

```typescript
describe('Multipart parsing', () => {
  describe('File uploads', () => {
    it('should parse single file upload', async () => {
      // Create multipart request
      const formData = new FormData();
      formData.append('file', new Blob(['test content'], { type: 'text/plain' }), 'test.txt');

      const req = new Request('http://test.com', {
        method: 'POST',
        body: formData
      });

      const result = await parseMultipart(req);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].filename).toBe('test.txt');
      expect(result.files[0].mimetype).toBe('text/plain');
    });

    it('should parse multiple files');
    it('should extract file metadata correctly');
  });

  describe('Form fields', () => {
    it('should parse form fields alongside files', async () => {
      const formData = new FormData();
      formData.append('name', 'test-user');
      formData.append('file', new Blob(['data']), 'file.txt');

      const req = new Request('http://test.com', {
        method: 'POST',
        body: formData
      });

      const result = await parseMultipart(req);

      expect(result.fields.name).toBe('test-user');
      expect(result.files).toHaveLength(1);
    });
  });
});
```

---

## Deliverables Checklist

### Implementation (6-7 hours)
- [ ] `src/content-type.ts` - Content-type parser (~800 lines)
- [ ] `src/multipart.ts` - Multipart handler (~600 lines)
- [ ] `src/serialization.ts` - Fast serialization (~700 lines)
- [ ] Update `src/index.ts` - Integration (~200 line changes)
- [ ] Update `src/types.ts` - New type definitions (~50 lines)

### Testing (1-2 hours)
- [ ] `__tests__/content-type.test.ts` - 30+ tests
- [ ] `__tests__/multipart.test.ts` - 15+ tests
- [ ] `__tests__/serialization.test.ts` - 20+ tests
- [ ] All tests passing
- [ ] >80% coverage

### Configuration
- [ ] Update `package.json` with dependencies
- [ ] Run `bun install`
- [ ] Verify TypeScript compilation

---

## Success Criteria

### Functional
- [ ] JSON, form, text, binary parsing working
- [ ] Custom content-type parsers registerable
- [ ] Multipart/form-data working
- [ ] Stream handling for large payloads
- [ ] Payload size limits enforced
- [ ] fast-json-stringify integration working
- [ ] Schema-based serialization
- [ ] 2-3x faster serialization (benchmarked)

### Quality
- [ ] All 65+ tests passing
- [ ] >80% code coverage
- [ ] No TypeScript errors
- [ ] No memory leaks
- [ ] Clear error messages

### Performance
- [ ] Parsing overhead <1ms
- [ ] Serialization 2-3x faster with schema
- [ ] Streaming works without full memory load

---

## Reference Materials

### Fastify Source
- Content-Type: `/Users/quikolas/Documents/Open Source Repos/fastify-main/lib/contentTypeParser.js`
- Serialization: `/Users/quikolas/Documents/Open Source Repos/fastify-main/lib/serialization.js`

### Documentation
- **Roadmap**: `.ProjectNotesAndResearch/Ogelfy/FASTIFY-PARITY-ROADMAP.md`
- **Ticket**: `.SoT/sprints/sprint-ogelfy/OGELFY-06-CONTENT-TYPE-SERIALIZATION.md`
- **Busboy**: https://github.com/fastify/busboy
- **fast-json-stringify**: https://github.com/fastify/fast-json-stringify

---

## Questions & Support

**TPM**: Dylan Torres
**Full Ticket**: `.SoT/sprints/sprint-ogelfy/OGELFY-06-CONTENT-TYPE-SERIALIZATION.md`

---

## Let's Ship This!

You're the perfect person for this work, Miguel. Your expertise in middleware, content negotiation, and API performance is exactly what this needs.

Build clean, fast, production-ready content parsing and serialization. Make Ogelfy scream. 🚀

**Ready to start NOW.**
