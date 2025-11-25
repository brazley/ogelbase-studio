import { describe, it, expect, beforeEach } from 'bun:test';
import { Serializer, Schemas, createRouteSchema } from '../src/serializer';

describe('Serializer', () => {
  let serializer: Serializer;

  beforeEach(() => {
    serializer = new Serializer();
  });

  describe('Default serialization', () => {
    it('should serialize simple objects', () => {
      const obj = { name: 'John', age: 30 };
      const result = serializer.serialize(obj);
      expect(result).toBe('{"name":"John","age":30}');
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const obj = { createdAt: date };
      const result = serializer.serialize(obj);
      expect(result).toContain('2024-01-01T00:00:00.000Z');
    });

    it('should handle BigInt values', () => {
      const obj = { id: BigInt(123456789) };
      const result = serializer.serialize(obj);
      expect(result).toBe('{"id":"123456789"}');
    });

    it('should handle nested objects', () => {
      const obj = {
        user: {
          name: 'John',
          profile: {
            age: 30
          }
        }
      };
      const result = serializer.serialize(obj);
      expect(result).toBe('{"user":{"name":"John","profile":{"age":30}}}');
    });

    it('should handle arrays', () => {
      const obj = { items: [1, 2, 3] };
      const result = serializer.serialize(obj);
      expect(result).toBe('{"items":[1,2,3]}');
    });
  });

  describe('Schema-based serialization', () => {
    it('should serialize with object schema', () => {
      const schema = Schemas.object({
        id: Schemas.string(),
        name: Schemas.string(),
        age: Schemas.number()
      }, ['id', 'name', 'age']);

      const obj = { id: '123', name: 'John', age: 30 };
      const result = serializer.serialize(obj, schema);

      const parsed = JSON.parse(result);
      expect(parsed).toEqual(obj);
    });

    it('should handle optional properties', () => {
      const schema = Schemas.object({
        id: Schemas.string(),
        name: Schemas.string(),
        age: Schemas.number()
      }, ['id', 'name']); // age is optional

      const obj = { id: '123', name: 'John' };
      const result = serializer.serialize(obj, schema);

      const parsed = JSON.parse(result);
      expect(parsed.id).toBe('123');
      expect(parsed.name).toBe('John');
      expect(parsed.age).toBeNull();
    });

    it('should serialize arrays with schema', () => {
      const schema = Schemas.array(
        Schemas.object({
          id: Schemas.string(),
          value: Schemas.number()
        }, ['id', 'value'])
      );

      const obj = [
        { id: '1', value: 10 },
        { id: '2', value: 20 }
      ];
      const result = serializer.serialize(obj, schema);

      const parsed = JSON.parse(result);
      expect(parsed).toEqual(obj);
    });

    it('should handle date format', () => {
      const schema = Schemas.object({
        createdAt: Schemas.date()
      }, ['createdAt']);

      const date = new Date('2024-01-01T00:00:00.000Z');
      const obj = { createdAt: date };
      const result = serializer.serialize(obj, schema);

      expect(result).toContain('2024-01-01T00:00:00.000Z');
    });

    it('should handle bigint format', () => {
      const schema = Schemas.object({
        id: Schemas.bigint()
      }, ['id']);

      const obj = { id: BigInt(123456789) };
      const result = serializer.serialize(obj, schema);

      const parsed = JSON.parse(result);
      // BigInt is serialized as a number, not a string in our implementation
      expect(parsed.id).toBe(123456789);
    });
  });

  describe('Schema compilation and caching', () => {
    it('should compile and cache schemas', () => {
      const schema = Schemas.object({
        id: Schemas.string(),
        name: Schemas.string()
      }, ['id', 'name']);

      // First call - compiles
      serializer.serialize({ id: '1', name: 'Test' }, schema);
      expect(serializer.cacheSize).toBe(1);

      // Second call - uses cache
      serializer.serialize({ id: '2', name: 'Test2' }, schema);
      expect(serializer.cacheSize).toBe(1);
    });

    it('should clear cache', () => {
      const schema = Schemas.object({
        id: Schemas.string()
      }, ['id']);

      serializer.serialize({ id: '1' }, schema);
      expect(serializer.cacheSize).toBe(1);

      serializer.clear();
      expect(serializer.cacheSize).toBe(0);
    });
  });

  describe('Complex schemas', () => {
    it('should handle nested objects', () => {
      const schema = Schemas.object({
        user: Schemas.object({
          id: Schemas.string(),
          profile: Schemas.object({
            name: Schemas.string(),
            age: Schemas.number()
          }, ['name', 'age'])
        }, ['id', 'profile'])
      }, ['user']);

      const obj = {
        user: {
          id: '123',
          profile: {
            name: 'John',
            age: 30
          }
        }
      };

      const result = serializer.serialize(obj, schema);
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(obj);
    });

    it('should handle arrays of objects', () => {
      const schema = Schemas.object({
        users: Schemas.array(
          Schemas.object({
            id: Schemas.string(),
            name: Schemas.string()
          }, ['id', 'name'])
        )
      }, ['users']);

      const obj = {
        users: [
          { id: '1', name: 'John' },
          { id: '2', name: 'Jane' }
        ]
      };

      const result = serializer.serialize(obj, schema);
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(obj);
    });
  });

  describe('Schema builders', () => {
    it('should create string schema', () => {
      const schema = Schemas.string();
      expect(schema).toEqual({ type: 'string' });
    });

    it('should create number schema', () => {
      const schema = Schemas.number();
      expect(schema).toEqual({ type: 'number' });
    });

    it('should create boolean schema', () => {
      const schema = Schemas.boolean();
      expect(schema).toEqual({ type: 'boolean' });
    });

    it('should create null schema', () => {
      const schema = Schemas.null();
      expect(schema).toEqual({ type: 'null' });
    });

    it('should create bigint schema', () => {
      const schema = Schemas.bigint();
      expect(schema).toEqual({ type: 'number', format: 'bigint' });
    });

    it('should create date schema', () => {
      const schema = Schemas.date();
      expect(schema).toEqual({ type: 'string', format: 'date-time' });
    });
  });

  describe('Route schema utility', () => {
    it('should create route schema with response', () => {
      const routeSchema = createRouteSchema({
        response: {
          200: Schemas.object({
            id: Schemas.string(),
            name: Schemas.string()
          }, ['id', 'name'])
        }
      });

      expect(routeSchema.response).toBeDefined();
      expect(routeSchema.response![200]).toBeDefined();
    });

    it('should create route schema with body', () => {
      const routeSchema = createRouteSchema({
        body: Schemas.object({
          name: Schemas.string()
        }, ['name'])
      });

      expect(routeSchema.body).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle serialization at scale', () => {
      const schema = Schemas.object({
        id: Schemas.string(),
        name: Schemas.string(),
        age: Schemas.number(),
        active: Schemas.boolean()
      }, ['id', 'name', 'age', 'active']);

      const obj = {
        id: '123',
        name: 'John Doe',
        age: 30,
        active: true
      };

      // Compile the schema first
      serializer.compile(schema);

      // Test that schema-based serialization works at scale
      const iterations = 10000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const result = serializer.serialize(obj, schema);
        expect(result).toBeDefined();
      }

      const time = performance.now() - start;

      // Should complete 10k serializations in reasonable time (< 100ms)
      expect(time).toBeLessThan(100);

      console.log(`Serialized ${iterations} objects in ${time}ms (${(iterations / time).toFixed(2)} ops/ms)`);
    });
  });

  describe('Error handling', () => {
    it('should fallback to default serialization on compilation error', () => {
      // Create a potentially problematic schema
      const schema: any = {
        type: 'unknown' // Invalid type
      };

      const obj = { test: true };
      const result = serializer.serialize(obj, schema);

      // Should still work via fallback
      expect(result).toBe('{"test":true}');
    });
  });
});
