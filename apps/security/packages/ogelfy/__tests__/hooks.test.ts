import { describe, it, expect, beforeEach } from 'bun:test';
import { HookManager, Reply, type HookRequest, type HookHandler } from '../src/hooks';

describe('Hook System', () => {
  let hookManager: HookManager;
  let req: HookRequest;
  let reply: Reply;

  beforeEach(() => {
    hookManager = new HookManager();
    req = new Request('http://localhost/test') as HookRequest;
    req.id = 'test-request-id';
    req.startTime = Date.now();
    reply = new Reply();
  });

  describe('Hook Manager', () => {
    it('should initialize with empty hooks', () => {
      const stats = hookManager.stats();
      expect(stats.onRequest).toBe(0);
      expect(stats.preParsing).toBe(0);
      expect(stats.preValidation).toBe(0);
      expect(stats.preHandler).toBe(0);
      expect(stats.preSerialization).toBe(0);
      expect(stats.onSend).toBe(0);
      expect(stats.onResponse).toBe(0);
      expect(stats.onError).toBe(0);
      expect(stats.onTimeout).toBe(0);
    });

    it('should add hooks', () => {
      const handler: HookHandler = async () => {};
      hookManager.add('onRequest', handler);
      hookManager.add('preHandler', handler);

      expect(hookManager.count('onRequest')).toBe(1);
      expect(hookManager.count('preHandler')).toBe(1);
      expect(hookManager.count('preParsing')).toBe(0);
    });

    it('should execute hooks in order', async () => {
      const order: number[] = [];

      hookManager.add('onRequest', async () => {
        order.push(1);
      });
      hookManager.add('onRequest', async () => {
        order.push(2);
      });
      hookManager.add('onRequest', async () => {
        order.push(3);
      });

      await hookManager.run('onRequest', req, reply);

      expect(order).toEqual([1, 2, 3]);
    });

    it('should stop execution if reply sent', async () => {
      const order: number[] = [];

      hookManager.add('preHandler', async (req, reply) => {
        order.push(1);
      });

      hookManager.add('preHandler', async (req, reply) => {
        order.push(2);
        reply.status(401).send({ error: 'Unauthorized' });
      });

      hookManager.add('preHandler', async (req, reply) => {
        order.push(3); // Should not execute
      });

      await hookManager.run('preHandler', req, reply);

      expect(order).toEqual([1, 2]);
      expect(reply.sent).toBe(true);
      expect(reply.statusCode).toBe(401);
    });

    it('should handle async hooks', async () => {
      let executed = false;

      hookManager.add('onRequest', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        executed = true;
      });

      await hookManager.run('onRequest', req, reply);

      expect(executed).toBe(true);
    });

    it('should pass payload to preSerialization hooks', async () => {
      const handler: HookHandler = async (req, reply, payload) => {
        return {
          ...payload,
          timestamp: Date.now()
        };
      };

      hookManager.add('preSerialization', handler);

      const result = await hookManager.run('preSerialization', req, reply, { data: 'test' });

      expect(result).toHaveProperty('data', 'test');
      expect(result).toHaveProperty('timestamp');
    });

    it('should clone hook manager', () => {
      const handler: HookHandler = async () => {};
      hookManager.add('onRequest', handler);
      hookManager.add('preHandler', handler);

      const cloned = hookManager.clone();

      expect(cloned.count('onRequest')).toBe(1);
      expect(cloned.count('preHandler')).toBe(1);

      // Adding to cloned shouldn't affect original
      cloned.add('onRequest', handler);
      expect(cloned.count('onRequest')).toBe(2);
      expect(hookManager.count('onRequest')).toBe(1);
    });

    it('should inherit parent hooks', () => {
      const handler1: HookHandler = async () => {};
      const handler2: HookHandler = async () => {};

      hookManager.add('onRequest', handler1);

      const child = new HookManager();
      child.add('onRequest', handler2);
      child.inherit(hookManager);

      // Should have both parent and child hooks
      expect(child.count('onRequest')).toBe(2);
    });

    it('should clear hooks', () => {
      const handler: HookHandler = async () => {};
      hookManager.add('onRequest', handler);
      hookManager.add('preHandler', handler);

      expect(hookManager.count('onRequest')).toBe(1);
      expect(hookManager.count('preHandler')).toBe(1);

      hookManager.clear('onRequest');
      expect(hookManager.count('onRequest')).toBe(0);
      expect(hookManager.count('preHandler')).toBe(1);

      hookManager.clear();
      expect(hookManager.count('preHandler')).toBe(0);
    });
  });

  describe('Reply Object', () => {
    it('should set status code', () => {
      reply.status(404);
      expect(reply.statusCode).toBe(404);
    });

    it('should set headers', () => {
      reply.header('X-Custom', 'value');
      expect(reply.getHeader('X-Custom')).toBe('value');
    });

    it('should set multiple headers', () => {
      reply.headers({
        'X-Custom-1': 'value1',
        'X-Custom-2': 'value2'
      });

      expect(reply.getHeader('X-Custom-1')).toBe('value1');
      expect(reply.getHeader('X-Custom-2')).toBe('value2');
    });

    it('should send response', () => {
      reply.send({ message: 'test' });
      expect(reply.sent).toBe(true);
    });

    it('should build Response object', () => {
      reply.status(201).header('X-Custom', 'value').send({ message: 'created' });

      const response = reply.response;
      expect(response.status).toBe(201);
      expect(response.headers.get('X-Custom')).toBe('value');
    });

    it('should throw on duplicate send', () => {
      reply.send({ data: 'first' });
      expect(() => reply.send({ data: 'second' })).toThrow('Reply already sent');
    });

    it('should throw on status after send', () => {
      reply.send({ data: 'test' });
      expect(() => reply.status(500)).toThrow('Cannot set status after response sent');
    });

    it('should throw on header after send', () => {
      reply.send({ data: 'test' });
      expect(() => reply.header('X-Test', 'value')).toThrow('Cannot set header after response sent');
    });

    it('should chain methods', () => {
      const result = reply.status(200).header('X-Test', 'value');
      expect(result).toBe(reply);
    });

    it('should support code() alias', () => {
      reply.code(404);
      expect(reply.statusCode).toBe(404);
    });

    it('should handle JSON serialization', () => {
      const data = { message: 'test', count: 42 };
      reply.send(data);

      const response = reply.response;
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should handle string responses', () => {
      reply.send('plain text');

      const response = reply.response;
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should remove headers', () => {
      reply.header('X-Test', 'value');
      expect(reply.hasHeader('X-Test')).toBe(true);

      reply.removeHeader('X-Test');
      expect(reply.hasHeader('X-Test')).toBe(false);
    });
  });

  describe('Route-level Hooks', () => {
    it('should execute route hooks before global hooks', async () => {
      const order: string[] = [];

      const routeHook: HookHandler = async () => {
        order.push('route');
      };

      const globalHook: HookHandler = async () => {
        order.push('global');
      };

      hookManager.add('preHandler', globalHook);

      await hookManager.runWithRoute('preHandler', { preHandler: [routeHook] }, req, reply);

      expect(order).toEqual(['route', 'global']);
    });

    it('should handle multiple route hooks', async () => {
      const order: number[] = [];

      const routeHooks = [
        async () => order.push(1),
        async () => order.push(2)
      ];

      await hookManager.runWithRoute('onRequest', { onRequest: routeHooks }, req, reply);

      expect(order).toEqual([1, 2]);
    });

    it('should stop on reply sent in route hook', async () => {
      const order: string[] = [];

      const routeHook: HookHandler = async (req, reply) => {
        order.push('route');
        reply.status(403).send({ error: 'Forbidden' });
      };

      const globalHook: HookHandler = async () => {
        order.push('global');
      };

      hookManager.add('preHandler', globalHook);

      await hookManager.runWithRoute('preHandler', { preHandler: [routeHook] }, req, reply);

      expect(order).toEqual(['route']);
      expect(reply.sent).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should run onError hooks', async () => {
      let errorCaught: Error | undefined;

      hookManager.add('onError', async (req, reply, payload, error) => {
        errorCaught = error;
      });

      const testError = new Error('Test error');
      await hookManager.runOnError(req, reply, testError);

      expect(errorCaught).toBe(testError);
    });

    it('should handle errors in onError hooks gracefully', async () => {
      hookManager.add('onError', async () => {
        throw new Error('Hook error');
      });

      // Should not throw
      await hookManager.runOnError(req, reply, new Error('Original error'));
    });

    it('should stop processing if reply sent in onError', async () => {
      const order: number[] = [];

      hookManager.add('onError', async (req, reply) => {
        order.push(1);
        reply.status(500).send({ error: 'Internal Error' });
      });

      hookManager.add('onError', async () => {
        order.push(2);
      });

      await hookManager.runOnError(req, reply, new Error('Test error'));

      expect(order).toEqual([1]);
      expect(reply.sent).toBe(true);
    });
  });

  describe('Timeout Handling', () => {
    it('should run onTimeout hooks', async () => {
      let timeoutCalled = false;

      hookManager.add('onTimeout', async () => {
        timeoutCalled = true;
      });

      await hookManager.runOnTimeout(req, reply);

      expect(timeoutCalled).toBe(true);
    });

    it('should send default timeout response if no hook handles it', async () => {
      await hookManager.runOnTimeout(req, reply);

      expect(reply.sent).toBe(true);
      expect(reply.statusCode).toBe(408);
    });

    it('should allow custom timeout response', async () => {
      hookManager.add('onTimeout', async (req, reply) => {
        reply.status(504).send({ error: 'Gateway Timeout', custom: true });
      });

      await hookManager.runOnTimeout(req, reply);

      expect(reply.statusCode).toBe(504);
      const response = reply.response;
      const body = await response.json();
      expect(body).toHaveProperty('custom', true);
    });

    it('should handle errors in onTimeout hooks', async () => {
      hookManager.add('onTimeout', async () => {
        throw new Error('Timeout hook error');
      });

      // Should still send default response
      await hookManager.runOnTimeout(req, reply);

      expect(reply.sent).toBe(true);
      expect(reply.statusCode).toBe(408);
    });
  });

  describe('Hook Lifecycle Order', () => {
    it('should execute hooks in correct lifecycle order', async () => {
      const lifecycle: string[] = [];

      const hooks = [
        'onRequest',
        'preParsing',
        'preValidation',
        'preHandler',
        'preSerialization',
        'onSend',
        'onResponse'
      ] as const;

      hooks.forEach(hookName => {
        hookManager.add(hookName, async () => {
          lifecycle.push(hookName);
        });
      });

      // Simulate lifecycle
      await hookManager.run('onRequest', req, reply);
      await hookManager.run('preParsing', req, reply);
      await hookManager.run('preValidation', req, reply);
      await hookManager.run('preHandler', req, reply);
      await hookManager.run('preSerialization', req, reply, { data: 'test' });
      await hookManager.run('onSend', req, reply);
      await hookManager.run('onResponse', req, reply);

      expect(lifecycle).toEqual([
        'onRequest',
        'preParsing',
        'preValidation',
        'preHandler',
        'preSerialization',
        'onSend',
        'onResponse'
      ]);
    });
  });

  describe('Hook Statistics', () => {
    it('should return hook stats', () => {
      const handler: HookHandler = async () => {};

      hookManager.add('onRequest', handler);
      hookManager.add('onRequest', handler);
      hookManager.add('preHandler', handler);

      const stats = hookManager.stats();

      expect(stats.onRequest).toBe(2);
      expect(stats.preHandler).toBe(1);
      expect(stats.preParsing).toBe(0);
    });

    it('should check if hooks exist', () => {
      const handler: HookHandler = async () => {};

      expect(hookManager.has('onRequest')).toBe(false);

      hookManager.add('onRequest', handler);

      expect(hookManager.has('onRequest')).toBe(true);
    });
  });
});
