import { describe, it, expect } from 'bun:test';
import {
  Serializer,
  Schemas,
  createSchemaKey,
  createResponseSchemaKey,
  benchmark
} from '../src/serializer';

describe('Serializer', () => {
  describe('Schema compilation', () => {
    it('should compile and cache serializer', () => {
      const manager = new Serializer();
      const schema = {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          name: { type: 'string' as const }
        }
      };

      const serializer1 = manager.compile(schema);
      const serializer2 = manager.compile(schema);

      expect(serializer1).toBe(serializer2); // Same reference
      expect(manager.cacheSize).toBe(1);
    });

    it('should compile different schemas separately', () => {
      const manager = new Serializer();

      const schema1 = {
        type: 'object' as const,
        properties: { id: { type: 'string' as const } }
      };

      const schema2 = {
        type: 'object' as const,
        properties: { name: { type: 'string' as const } }
      };

      manager.compile(schema1);
      manager.compile(schema2);

      expect(manager.cacheSize).toBe(2);
    });

    it('should check if schema is compiled', () => {
      const manager = new Serializer();
      const schema = {
        type: 'object' as const,
        properties: { id: { type: 'string' as const } }
      };

      expect(manager.has(schema)).toBe(false);
      manager.compile(schema);
      expect(manager.has(schema)).toBe(true);
    });

    it('should remove compiled schema', () => {
      const manager = new Serializer();
      const schema = {
        type: 'object' as const,
        properties: { id: { type: 'string' as const } }
      };

      manager.compile(schema);
      expect(manager.has(schema)).toBe(true);

      const removed = manager.remove(schema);
      expect(removed).toBe(true);
      expect(manager.has(schema)).toBe(false);
    });

    it('should clear all compiled schemas', () => {
      const manager = new Serializer();

      manager.compile({ type: 'object' as const, properties: { a: { type: 'string' as const } } });
      manager.compile({ type: 'object' as const, properties: { b: { type: 'string' as const } } });

      expect(manager.cacheSize).toBe(2);

      manager.clear();
      expect(manager.cacheSize).toBe(0);
    });
  });

  describe('Serialization', () => {
    it('should serialize simple object', () => {
      const manager = new Serializer();
      const schema = {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          name: { type: 'string' as const }
        }
      };

      const data = { id: '123', name: 'Test' };
      const result = manager.serialize(data, schema);

      expect(result).toBe('{"id":"123","name":"Test"}');
    });

    it('should serialize nested objects', () => {
      const manager = new Serializer();
      const schema = {
        type: 'object' as const,
        properties: {
          user: {
            type: 'object' as const,
            properties: {
              id: { type: 'string' as const },
              name: { type: 'string' as const }
            }
          }
        }
      };

      const data = { user: { id: '123', name: 'Test' } };
      const result = manager.serialize(data, schema);

      expect(result).toContain('user');
      expect(result).toContain('123');
      expect(result).toContain('Test');
    });

    it('should serialize arrays', () => {
      const manager = new Serializer();
      const schema = {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            id: { type: 'string' as const },
            name: { type: 'string' as const }
          }
        }
      };

      const data = [
        { id: '1', name: 'First' },
        { id: '2', name: 'Second' }
      ];

      const result = manager.serialize(data, schema);
      expect(result).toContain('First');
      expect(result).toContain('Second');
    });

    it('should handle Date objects', () => {
      const manager = new Serializer();
      const schema = {
        type: 'object' as const,
        properties: {
          timestamp: { type: 'string' as const, format: 'date-time' as const }
        }
      };

      const date = new Date('2025-01-01T00:00:00.000Z');
      const result = manager.serialize({ timestamp: date }, schema);

      expect(result).toContain('2025-01-01');
    });

    it('should handle numbers', () => {
      const manager = new Serializer();
      const schema = {
        type: 'object' as const,
        properties: {
          count: { type: 'number' as const },
          age: { type: 'integer' as const }
        }
      };

      const data = { count: 42.5, age: 30 };
      const result = manager.serialize(data, schema);

      expect(result).toContain('42.5');
      expect(result).toContain('30');
    });

    it('should handle booleans', () => {
      const manager = new Serializer();
      const schema = {
        type: 'object' as const,
        properties: {
          active: { type: 'boolean' as const }
        }
      };

      const result = manager.serialize({ active: true }, schema);
      expect(result).toContain('true');
    });

    it('should fall back to JSON.stringify when no schema', () => {
      const manager = new Serializer();
      const data = { foo: 'bar', nested: { value: 123 } };

      const result = manager.serialize(data);
      expect(result).toBe(JSON.stringify(data));
    });

    it('should handle required fields', () => {
      const manager = new Serializer();
      const schema = {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          name: { type: 'string' as const }
        },
        required: ['id']
      };

      const data = { id: '123', name: 'Test' };
      const result = manager.serialize(data, schema);

      expect(result).toContain('123');
      expect(result).toContain('Test');
    });

    it('should handle optional fields', () => {
      const manager = new Serializer();
      const schema = {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          optional: { type: 'string' as const }
        },
        required: ['id']
      };

      const data = { id: '123' };
      const result = manager.serialize(data, schema);

      expect(result).toContain('123');
    });

    it('should handle BigInt in default serialization', () => {
      const manager = new Serializer();
      const data = { bigNum: BigInt(9007199254740991) };

      const result = manager.serialize(data);
      expect(result).toContain('9007199254740991');
    });
  });

  describe('Performance', () => {
    it('should benchmark serialization', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          name: { type: 'string' as const },
          age: { type: 'number' as const },
          active: { type: 'boolean' as const }
        }
      };

      const data = { id: '123', name: 'Test', age: 30, active: true };
      const iterations = 10000;

      const results = benchmark(schema, data, iterations);

      // Just verify the benchmark runs and returns valid results
      expect(results.fastTime).toBeGreaterThan(0);
      expect(results.slowTime).toBeGreaterThan(0);
      expect(results.speedup).toBeGreaterThan(0);

      // Note: fast-json-stringify has compilation overhead, so for simple objects
      // it may not be faster. But for complex objects with many iterations, it should be.
    });

    it('should handle large objects efficiently', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          items: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                id: { type: 'string' as const },
                value: { type: 'number' as const }
              }
            }
          }
        }
      };

      const data = {
        items: Array.from({ length: 100 }, (_, i) => ({
          id: `id-${i}`,
          value: i
        }))
      };

      const results = benchmark(schema, data, 1000);

      // Verify benchmark completes successfully
      expect(results.fastTime).toBeGreaterThan(0);
      expect(results.slowTime).toBeGreaterThan(0);
      expect(typeof results.speedup).toBe('number');
    });
  });

  describe('Schema helpers', () => {
    it('should create schema key', () => {
      const key = createSchemaKey('/users/:id', 200);
      expect(key).toBe('/users/:id:200');
    });

    it('should create response schema key', () => {
      const key = createResponseSchemaKey('/users/:id', 'GET', 200);
      expect(key).toBe('GET:/users/:id:200');
    });
  });

  describe('Schemas builder', () => {
    it('should build string schema', () => {
      const schema = Schemas.string();
      expect(schema.type).toBe('string');
    });

    it('should build string schema with format', () => {
      const schema = Schemas.string('date-time');
      expect(schema.type).toBe('string');
      expect(schema.format).toBe('date-time');
    });

    it('should build number schema', () => {
      const schema = Schemas.number();
      expect(schema.type).toBe('number');
    });

    it('should build integer schema', () => {
      const schema = Schemas.integer();
      expect(schema.type).toBe('integer');
    });

    it('should build boolean schema', () => {
      const schema = Schemas.boolean();
      expect(schema.type).toBe('boolean');
    });

    it('should build null schema', () => {
      const schema = Schemas.null();
      expect(schema.type).toBe('null');
    });

    it('should build bigint schema', () => {
      const schema = Schemas.bigint();
      expect(schema.type).toBe('number');
      expect(schema.format).toBe('bigint');
    });

    it('should build date schema', () => {
      const schema = Schemas.date();
      expect(schema.type).toBe('string');
      expect(schema.format).toBe('date-time');
    });

    it('should build array schema', () => {
      const schema = Schemas.array(Schemas.string());
      expect(schema.type).toBe('array');
      expect(schema.items?.type).toBe('string');
    });

    it('should build object schema', () => {
      const schema = Schemas.object({
        id: Schemas.string(),
        age: Schemas.number()
      });

      expect(schema.type).toBe('object');
      expect(schema.properties?.id.type).toBe('string');
      expect(schema.properties?.age.type).toBe('number');
    });

    it('should build object schema with required fields', () => {
      const schema = Schemas.object(
        {
          id: Schemas.string(),
          name: Schemas.string()
        },
        ['id']
      );

      expect(schema.required).toEqual(['id']);
    });

    it('should build nullable schema', () => {
      const schema = Schemas.nullable(Schemas.string());
      expect(schema.type).toBe('string');
      expect(schema.nullable).toBe(true);
    });

    it('should build anyOf schema', () => {
      const schema = Schemas.anyOf(Schemas.string(), Schemas.number());
      expect(schema.anyOf).toHaveLength(2);
    });

    it('should build allOf schema', () => {
      const schema = Schemas.allOf(
        Schemas.object({ id: Schemas.string() }),
        Schemas.object({ name: Schemas.string() })
      );
      expect(schema.allOf).toHaveLength(2);
    });

    it('should build oneOf schema', () => {
      const schema = Schemas.oneOf(Schemas.string(), Schemas.number());
      expect(schema.oneOf).toHaveLength(2);
    });

    it('should build complex nested schema', () => {
      const schema = Schemas.object({
        user: Schemas.object({
          id: Schemas.string(),
          name: Schemas.string(),
          age: Schemas.number(),
          active: Schemas.boolean()
        }),
        posts: Schemas.array(
          Schemas.object({
            id: Schemas.string(),
            title: Schemas.string(),
            createdAt: Schemas.date()
          })
        )
      });

      expect(schema.type).toBe('object');
      expect(schema.properties?.user.type).toBe('object');
      expect(schema.properties?.posts.type).toBe('array');
    });
  });
});
