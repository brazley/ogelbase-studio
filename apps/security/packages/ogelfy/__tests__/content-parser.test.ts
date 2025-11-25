import { describe, it, expect } from 'bun:test';
import { ContentTypeParser } from '../src/content-parser';

describe('ContentTypeParser', () => {
  const parser = new ContentTypeParser();

  describe('JSON parsing', () => {
    it('should parse JSON body', async () => {
      const body = JSON.stringify({ name: 'John', age: 30 });
      const req = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      const result = await parser.parse(req);
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should handle malformed JSON', async () => {
      const req = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json'
      });

      await expect(parser.parse(req)).rejects.toThrow('Invalid JSON');
    });
  });

  describe('URL-encoded parsing', () => {
    it('should parse URL-encoded body', async () => {
      const body = 'name=John&age=30&city=New+York';
      const req = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });

      const result = await parser.parse(req);
      expect(result).toEqual({
        name: 'John',
        age: '30',
        city: 'New York'
      });
    });

    it('should handle special characters', async () => {
      const body = 'email=test%40example.com&password=p%40ssw0rd%21';
      const req = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });

      const result = await parser.parse(req);
      expect(result).toEqual({
        email: 'test@example.com',
        password: 'p@ssw0rd!'
      });
    });
  });

  describe('Plain text parsing', () => {
    it('should parse text/plain body', async () => {
      const body = 'Hello, World!';
      const req = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body
      });

      const result = await parser.parse(req);
      expect(result).toBe('Hello, World!');
    });
  });

  describe('Binary parsing', () => {
    it('should parse binary data', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const req = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: data
      });

      const result = await parser.parse(req);
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(result)).toEqual(data);
    });
  });

  describe('Multipart form-data parsing', () => {
    it('should parse multipart form with fields', async () => {
      const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
      const body = [
        `------WebKitFormBoundary7MA4YWxkTrZu0gW`,
        'Content-Disposition: form-data; name="name"',
        '',
        'John Doe',
        `------WebKitFormBoundary7MA4YWxkTrZu0gW`,
        'Content-Disposition: form-data; name="age"',
        '',
        '30',
        `------WebKitFormBoundary7MA4YWxkTrZu0gW--`
      ].join('\r\n');

      const req = new Request('http://localhost', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body
      });

      const result = await parser.parse(req);
      expect(result.fields).toEqual({
        name: 'John Doe',
        age: '30'
      });
      expect(result.files).toEqual([]);
    });

    it('should parse multipart form with files', async () => {
      const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
      const body = [
        `------WebKitFormBoundary7MA4YWxkTrZu0gW`,
        'Content-Disposition: form-data; name="file"; filename="test.txt"',
        'Content-Type: text/plain',
        '',
        'Hello, World!',
        `------WebKitFormBoundary7MA4YWxkTrZu0gW--`
      ].join('\r\n');

      const req = new Request('http://localhost', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body
      });

      const result = await parser.parse(req);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].fieldname).toBe('file');
      expect(result.files[0].filename).toBeDefined();
      expect(result.files[0].mimetype).toBeDefined();

      const decoder = new TextDecoder();
      const content = decoder.decode(result.files[0].data);
      expect(content).toBe('Hello, World!');
    });

    it('should parse multipart form with mixed fields and files', async () => {
      const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
      const body = [
        `------WebKitFormBoundary7MA4YWxkTrZu0gW`,
        'Content-Disposition: form-data; name="title"',
        '',
        'My Document',
        `------WebKitFormBoundary7MA4YWxkTrZu0gW`,
        'Content-Disposition: form-data; name="file"; filename="doc.txt"',
        'Content-Type: text/plain',
        '',
        'Document content',
        `------WebKitFormBoundary7MA4YWxkTrZu0gW`,
        'Content-Disposition: form-data; name="description"',
        '',
        'Important document',
        `------WebKitFormBoundary7MA4YWxkTrZu0gW--`
      ].join('\r\n');

      const req = new Request('http://localhost', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body
      });

      const result = await parser.parse(req);
      expect(result.fields).toEqual({
        title: 'My Document',
        description: 'Important document'
      });
      expect(result.files).toHaveLength(1);
      expect(result.files[0].filename).toBeDefined();
    });
  });

  describe('Custom parsers', () => {
    it('should allow adding custom parsers', async () => {
      const customParser = new ContentTypeParser();

      customParser.add('application/custom', async (req) => {
        const text = await req.text();
        return { custom: true, data: text };
      });

      const req = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/custom' },
        body: 'test data'
      });

      const result = await customParser.parse(req);
      expect(result).toEqual({ custom: true, data: 'test data' });
    });

    it('should allow removing parsers', () => {
      const customParser = new ContentTypeParser();
      customParser.add('application/test', async () => ({}));

      expect(customParser.has('application/test')).toBe(true);
      expect(customParser.remove('application/test')).toBe(true);
      expect(customParser.has('application/test')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should return null for missing content-type', async () => {
      const req = new Request('http://localhost', {
        method: 'POST'
      });

      const result = await parser.parse(req);
      expect(result).toBeNull();
    });

    it('should throw for unsupported content-type', async () => {
      const req = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/unsupported' },
        body: 'test'
      });

      await expect(parser.parse(req)).rejects.toThrow('Unsupported media type');
    });

    it('should handle content-type with charset', async () => {
      const req = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ test: true })
      });

      const result = await parser.parse(req);
      expect(result).toEqual({ test: true });
    });
  });
});
