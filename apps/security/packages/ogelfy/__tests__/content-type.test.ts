import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ContentTypeParser,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  parseMultipartFiles
} from '../src/content-parser';

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

    it('should parse complex JSON objects', async () => {
      const parser = new ContentTypeParser();
      const data = {
        nested: { value: 123 },
        array: [1, 2, 3],
        boolean: true,
        null: null
      };

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await parser.parse(req);
      expect(result).toEqual(data);
    });

    it('should parse JSON with charset', async () => {
      const parser = new ContentTypeParser();
      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ foo: 'bar' })
      });

      const result = await parser.parse(req);
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should parse URL-encoded form', async () => {
      const parser = new ContentTypeParser();
      const params = new URLSearchParams();
      params.append('name', 'test');
      params.append('value', '123');

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      const result = await parser.parse(req);
      expect(result.name).toBe('test');
      expect(result.value).toBe('123');
    });

    it('should parse URL-encoded with special characters', async () => {
      const parser = new ContentTypeParser();
      const params = new URLSearchParams();
      params.append('email', 'test@example.com');
      params.append('message', 'Hello World!');

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      const result = await parser.parse(req);
      expect(result.email).toBe('test@example.com');
      expect(result.message).toBe('Hello World!');
    });

    it('should parse plain text', async () => {
      const parser = new ContentTypeParser();
      const text = 'Hello, World!';

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: text
      });

      const result = await parser.parse(req);
      expect(result).toBe(text);
    });

    it('should parse multiline text', async () => {
      const parser = new ContentTypeParser();
      const text = 'Line 1\nLine 2\nLine 3';

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: text
      });

      const result = await parser.parse(req);
      expect(result).toBe(text);
    });

    it('should parse binary data', async () => {
      const parser = new ContentTypeParser();
      const buffer = new Uint8Array([1, 2, 3, 4, 5]);

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: buffer
      });

      const result = await parser.parse(req);
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(result)).toEqual(buffer);
    });
  });

  describe('Custom parsers', () => {
    it('should register and use custom parser', async () => {
      const parser = new ContentTypeParser();
      parser.add('application/yaml', async (req) => ({ yaml: true, parsed: true }));

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/yaml' },
        body: 'foo: bar'
      });

      const result = await parser.parse(req);
      expect(result).toEqual({ yaml: true, parsed: true });
    });

    it('should override built-in parser', async () => {
      const parser = new ContentTypeParser();
      parser.add('application/json', async (req) => ({ custom: true }));

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ foo: 'bar' })
      });

      const result = await parser.parse(req);
      expect(result).toEqual({ custom: true });
    });

    it('should handle case-insensitive content types', async () => {
      const parser = new ContentTypeParser();
      parser.add('APPLICATION/CUSTOM', async (req) => ({ custom: true }));

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/custom' },
        body: 'test'
      });

      const result = await parser.parse(req);
      expect(result).toEqual({ custom: true });
    });

    it('should remove custom parser', async () => {
      const parser = new ContentTypeParser();
      parser.add('application/custom', async (req) => ({ custom: true }));

      expect(parser.has('application/custom')).toBe(true);
      expect(parser.remove('application/custom')).toBe(true);
      expect(parser.has('application/custom')).toBe(false);
    });

    it('should check if parser exists', async () => {
      const parser = new ContentTypeParser();

      expect(parser.has('application/json')).toBe(true);
      expect(parser.has('application/yaml')).toBe(false);

      parser.add('application/yaml', async (req) => ({}));
      expect(parser.has('application/yaml')).toBe(true);
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
        body: JSON.stringify({ data: 'x'.repeat(200) })
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

    it('should have correct error details', async () => {
      const parser = new ContentTypeParser({ bodyLimit: 100 });

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '200'
        },
        body: JSON.stringify({ data: 'x'.repeat(200) })
      });

      try {
        await parser.parse(req);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(PayloadTooLargeError);
        expect((error as PayloadTooLargeError).statusCode).toBe(413);
        expect((error as PayloadTooLargeError).message).toContain('200');
        expect((error as PayloadTooLargeError).message).toContain('100');
      }
    });

    it('should get and set body limit', () => {
      const parser = new ContentTypeParser({ bodyLimit: 1000 });

      expect(parser.getBodyLimit()).toBe(1000);

      parser.setBodyLimit(2000);
      expect(parser.getBodyLimit()).toBe(2000);
    });

    it('should use default body limit', () => {
      const parser = new ContentTypeParser();
      expect(parser.getBodyLimit()).toBe(1048576); // 1MB
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

    it('should have correct error details for unsupported type', async () => {
      const parser = new ContentTypeParser();

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/unknown' },
        body: 'test'
      });

      try {
        await parser.parse(req);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(UnsupportedMediaTypeError);
        expect((error as UnsupportedMediaTypeError).statusCode).toBe(415);
        expect((error as UnsupportedMediaTypeError).message).toContain('unknown');
      }
    });

    it('should handle invalid JSON', async () => {
      const parser = new ContentTypeParser();

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{invalid json}'
      });

      await expect(parser.parse(req)).rejects.toThrow();
    });

    it('should return null for no content-type', async () => {
      const parser = new ContentTypeParser();

      const req = new Request('http://test.com', {
        method: 'POST'
      });

      const result = await parser.parse(req);
      expect(result).toBeNull();
    });

    it('should handle parser errors gracefully', async () => {
      const parser = new ContentTypeParser();
      parser.add('application/error', async (req) => {
        throw new Error('Parser error');
      });

      const req = new Request('http://test.com', {
        method: 'POST',
        headers: { 'content-type': 'application/error' },
        body: 'test'
      });

      await expect(parser.parse(req)).rejects.toThrow('Failed to parse application/error');
    });
  });

  describe('Multipart parsing', () => {
    it('should parse multipart with fields', async () => {
      const parser = new ContentTypeParser();

      // Create FormData
      const formData = new FormData();
      formData.append('name', 'John');
      formData.append('age', '30');

      const req = new Request('http://test.com', {
        method: 'POST',
        body: formData
      });

      const result = await parser.parse(req);
      expect(result.fields.name).toBe('John');
      expect(result.fields.age).toBe('30');
    });

    it('should parse multipart with file', async () => {
      const parser = new ContentTypeParser();

      // Create FormData with file
      const formData = new FormData();
      const fileContent = 'test file content';
      const blob = new Blob([fileContent], { type: 'text/plain' });
      const file = new File([blob], 'test.txt', { type: 'text/plain' });
      formData.append('file', file);

      const req = new Request('http://test.com', {
        method: 'POST',
        body: formData
      });

      const result = await parser.parse(req);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].filename).toBeDefined();
      expect(result.files[0].mimetype).toBeDefined();

      // Check file content
      const decoder = new TextDecoder();
      const content = decoder.decode(result.files[0].data);
      expect(content).toBe(fileContent);
    });

    it('should parse multipart with multiple files', async () => {
      const parser = new ContentTypeParser();

      const formData = new FormData();
      const file1 = new File([new Blob(['content1'])], 'file1.txt', { type: 'text/plain' });
      const file2 = new File([new Blob(['content2'])], 'file2.txt', { type: 'text/plain' });
      formData.append('file1', file1);
      formData.append('file2', file2);

      const req = new Request('http://test.com', {
        method: 'POST',
        body: formData
      });

      const result = await parser.parse(req);
      expect(result.files).toHaveLength(2);
      expect(result.files[0].filename).toBeDefined();
      expect(result.files[1].filename).toBeDefined();
    });

    it('should parse multipart with fields and files', async () => {
      const parser = new ContentTypeParser();

      const formData = new FormData();
      formData.append('name', 'test-user');
      formData.append('description', 'test description');
      const file = new File([new Blob(['data'])], 'file.txt', { type: 'text/plain' });
      formData.append('file', file);

      const req = new Request('http://test.com', {
        method: 'POST',
        body: formData
      });

      const result = await parser.parse(req);
      expect(result.fields.name).toBe('test-user');
      expect(result.fields.description).toBe('test description');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].filename).toBeDefined();
    });
  });

  describe('parseMultipartFiles helper', () => {
    it('should yield files from multipart request', async () => {
      const formData = new FormData();
      const file1 = new File([new Blob(['content1'])], 'file1.txt', { type: 'text/plain' });
      const file2 = new File([new Blob(['content2'])], 'file2.txt', { type: 'text/plain' });
      formData.append('file1', file1);
      formData.append('file2', file2);

      const req = new Request('http://test.com', {
        method: 'POST',
        body: formData
      });

      const files: any[] = [];
      for await (const file of parseMultipartFiles(req)) {
        files.push(file);
      }

      expect(files).toHaveLength(2);
      expect(files[0].filename).toBeDefined();
      expect(files[1].filename).toBeDefined();
    });
  });
});
