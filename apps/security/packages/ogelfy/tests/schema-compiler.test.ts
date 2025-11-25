import { describe, test, expect, beforeEach } from 'bun:test';
import { Ogelfy, SchemaValidationError, SchemaCompiler } from '../src/index';

describe('Schema Compiler', () => {
  let compiler: SchemaCompiler;

  beforeEach(() => {
    compiler = new SchemaCompiler();
  });

  describe('Basic Validation', () => {
    test('should validate valid data', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };

      const data = { name: 'John', age: 30 };
      const result = compiler.validate(schema, data);

      expect(result).toEqual(data);
    });

    test('should throw ValidationError for invalid data', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };

      const data = { age: 30 }; // Missing required 'name'

      expect(() => {
        compiler.validate(schema, data);
      }).toThrow(SchemaValidationError);
    });

    test('should coerce types when enabled', () => {
      const schema = {
        type: 'object',
        properties: {
          age: { type: 'number' },
          active: { type: 'boolean' },
        },
      };

      const data = { age: '30', active: 'true' };
      const result = compiler.validate(schema, data);

      expect(result.age).toBe(30);
      expect(result.active).toBe(true);
    });

    test('should remove additional properties when enabled', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };

      const data = { name: 'John', extra: 'value' };
      const result = compiler.validate(schema, data);

      expect(result).toEqual({ name: 'John' });
      expect(result.extra).toBeUndefined();
    });

    test('should apply default values', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string', default: 'user' },
        },
      };

      const data = { name: 'John' };
      const result = compiler.validate(schema, data);

      expect(result.role).toBe('user');
    });
  });

  describe('Shared Schemas', () => {
    test('should register and use shared schema', () => {
      const userSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['id', 'name'],
      };

      compiler.addSchema('User', userSchema);

      const data = { id: '123', name: 'John' };
      const result = compiler.validateById('User', data);

      expect(result).toEqual(data);
    });

    test('should reference shared schemas', () => {
      compiler.addSchema('Address', {
        type: 'object',
        properties: {
          street: { type: 'string' },
          city: { type: 'string' },
        },
      });

      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: { $ref: 'Address' },
        },
      };

      const data = {
        name: 'John',
        address: { street: '123 Main St', city: 'NYC' },
      };

      const result = compiler.validate(schema, data);
      expect(result).toEqual(data);
    });

    test('should throw error for duplicate schema id', () => {
      const schema = { type: 'object' };

      compiler.addSchema('Duplicate', schema);

      expect(() => {
        compiler.addSchema('Duplicate', schema);
      }).toThrow();
    });

    test('should remove schema by id', () => {
      compiler.addSchema('Temp', { type: 'object' });
      const removed = compiler.removeSchema('Temp');

      expect(removed).toBe(true);
      expect(() => {
        compiler.compileById('Temp');
      }).toThrow();
    });
  });

  describe('Format Validators', () => {
    test('should validate email format', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
      };

      const valid = compiler.isValid(schema, { email: 'test@example.com' });
      expect(valid).toBe(true);

      const invalid = compiler.isValid(schema, { email: 'not-an-email' });
      expect(invalid).toBe(false);
    });

    test('should validate uri format', () => {
      const schema = {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri' },
        },
      };

      const valid = compiler.isValid(schema, { url: 'https://example.com' });
      expect(valid).toBe(true);

      const invalid = compiler.isValid(schema, { url: 'not-a-url' });
      expect(invalid).toBe(false);
    });

    test('should validate date format', () => {
      const schema = {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' },
        },
      };

      const valid = compiler.isValid(schema, { date: '2024-01-15' });
      expect(valid).toBe(true);

      const invalid = compiler.isValid(schema, { date: 'not-a-date' });
      expect(invalid).toBe(false);
    });

    test('should add custom format', () => {
      compiler.addFormat('custom', /^[A-Z]{3}-\d{3}$/);

      const schema = {
        type: 'string',
        format: 'custom',
      };

      expect(compiler.isValid(schema, 'ABC-123')).toBe(true);
      expect(compiler.isValid(schema, 'invalid')).toBe(false);
    });
  });

  describe('Complex Schemas', () => {
    test('should validate nested objects', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              profile: {
                type: 'object',
                properties: {
                  bio: { type: 'string' },
                },
              },
            },
          },
        },
      };

      const data = {
        user: {
          name: 'John',
          profile: {
            bio: 'Developer',
          },
        },
      };

      const result = compiler.validate(schema, data);
      expect(result).toEqual(data);
    });

    test('should validate arrays', () => {
      const schema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 5,
          },
        },
      };

      const valid = compiler.validate(schema, { tags: ['tag1', 'tag2'] });
      expect(valid.tags).toHaveLength(2);

      expect(() => {
        compiler.validate(schema, { tags: [] }); // Too few items
      }).toThrow();
    });

    test('should validate enum values', () => {
      const schema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'pending'],
          },
        },
      };

      const valid = compiler.validate(schema, { status: 'active' });
      expect(valid.status).toBe('active');

      expect(() => {
        compiler.validate(schema, { status: 'invalid' });
      }).toThrow();
    });
  });

  describe('Performance', () => {
    test('should cache compiled validators', () => {
      const schema = {
        $id: 'CachedSchema',
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
      };

      compiler.addSchema('CachedSchema', schema);

      // First compilation
      const validate1 = compiler.compileById('CachedSchema');

      // Second compilation should return cached validator
      const validate2 = compiler.compileById('CachedSchema');

      expect(validate1).toBe(validate2); // Same reference
    });
  });

  describe('Error Handling', () => {
    test('should provide detailed error messages', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number', minimum: 0, maximum: 150 },
        },
        required: ['name', 'age'],
      };

      try {
        compiler.validate(schema, { name: 'John', age: 200 });
      } catch (error) {
        expect(error).toBeInstanceOf(SchemaValidationError);
        const validationError = error as SchemaValidationError;
        expect(validationError.errors.length).toBeGreaterThan(0);
        expect(validationError.message).toContain('age');
      }
    });

    test('should return errors without throwing', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };

      const errors = compiler.getErrors(schema, {});
      expect(errors).not.toBeNull();
      expect(errors!.length).toBeGreaterThan(0);
    });
  });
});
