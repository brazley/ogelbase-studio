import { describe, it, expect, beforeEach } from 'bun:test';
import { DecoratorManager } from '../src/decorators';
import { Reply, type HookRequest } from '../src/hooks';

describe('Decorator System', () => {
  let decoratorManager: DecoratorManager;
  let mockApp: any;

  beforeEach(() => {
    decoratorManager = new DecoratorManager();
    mockApp = {};
  });

  describe('Server Decorators', () => {
    it('should add server decorator', () => {
      decoratorManager.decorateServer(mockApp, 'config', { dbUrl: 'postgres://localhost' });

      expect(mockApp.config).toEqual({ dbUrl: 'postgres://localhost' });
      expect(decoratorManager.hasServerDecorator('config')).toBe(true);
    });

    it('should add getter decorator', () => {
      let callCount = 0;

      decoratorManager.decorateServer(mockApp, 'timestamp', () => {
        callCount++;
        return Date.now();
      });

      const first = mockApp.timestamp;
      const second = mockApp.timestamp;

      expect(callCount).toBe(2); // Getter called each time
      expect(typeof first).toBe('number');
      expect(typeof second).toBe('number');
    });

    it('should throw on duplicate decorator name', () => {
      decoratorManager.decorateServer(mockApp, 'db', {});

      expect(() => {
        decoratorManager.decorateServer(mockApp, 'db', {});
      }).toThrow("server decorator 'db' already exists");
    });

    it('should throw on reserved names', () => {
      const reservedNames = ['constructor', 'prototype', '__proto__', 'toString'];

      reservedNames.forEach(name => {
        expect(() => {
          decoratorManager.decorateServer(mockApp, name, {});
        }).toThrow(`Cannot use reserved name '${name}' as decorator`);
      });
    });

    it('should validate dependencies', () => {
      decoratorManager.decorateServer(mockApp, 'db', {});

      // Should work with valid dependency
      decoratorManager.decorateServer(mockApp, 'users', {}, ['db']);
      expect(mockApp.users).toBeDefined();

      // Should throw with invalid dependency
      expect(() => {
        decoratorManager.decorateServer(mockApp, 'posts', {}, ['nonexistent']);
      }).toThrow("Decorator dependency 'nonexistent' not found");
    });

    it('should get server decorator metadata', () => {
      const value = { test: true };
      decoratorManager.decorateServer(mockApp, 'testDecorator', value);

      const meta = decoratorManager.getServerDecorator('testDecorator');

      expect(meta).toBeDefined();
      expect(meta?.name).toBe('testDecorator');
      expect(meta?.value).toBe(value);
      expect(meta?.isGetter).toBe(false);
    });

    it('should get all server decorator names', () => {
      decoratorManager.decorateServer(mockApp, 'db', {});
      decoratorManager.decorateServer(mockApp, 'config', {});
      decoratorManager.decorateServer(mockApp, 'logger', {});

      const names = decoratorManager.getServerDecoratorNames();

      expect(names).toContain('db');
      expect(names).toContain('config');
      expect(names).toContain('logger');
      expect(names.length).toBe(3);
    });
  });

  describe('Request Decorators', () => {
    it('should add request decorator', () => {
      decoratorManager.decorateRequest('user', null);

      expect(decoratorManager.hasRequestDecorator('user')).toBe(true);
    });

    it('should apply request decorators', () => {
      decoratorManager.decorateRequest('user', null);
      decoratorManager.decorateRequest('session', { id: 'abc123' });
      decoratorManager.decorateRequest('requestId', () => crypto.randomUUID());

      const req = new Request('http://localhost/test') as HookRequest;
      decoratorManager.applyRequestDecorators(req);

      expect(req.user).toBeNull();
      expect(req.session).toEqual({ id: 'abc123' });
      expect(typeof req.requestId).toBe('string');
      expect(req.requestId.length).toBeGreaterThan(0);
    });

    it('should throw on duplicate request decorator', () => {
      decoratorManager.decorateRequest('user', null);

      expect(() => {
        decoratorManager.decorateRequest('user', null);
      }).toThrow("request decorator 'user' already exists");
    });

    it('should get request decorator metadata', () => {
      const value = { test: true };
      decoratorManager.decorateRequest('metadata', value);

      const meta = decoratorManager.getRequestDecorator('metadata');

      expect(meta).toBeDefined();
      expect(meta?.name).toBe('metadata');
      expect(meta?.value).toBe(value);
    });

    it('should get all request decorator names', () => {
      decoratorManager.decorateRequest('user', null);
      decoratorManager.decorateRequest('session', null);

      const names = decoratorManager.getRequestDecoratorNames();

      expect(names).toContain('user');
      expect(names).toContain('session');
      expect(names.length).toBe(2);
    });
  });

  describe('Reply Decorators', () => {
    it('should add reply decorator', () => {
      decoratorManager.decorateReply('sendError', function(this: Reply, error: any) {
        return this.status(500).send({ error: error.message });
      });

      expect(decoratorManager.hasReplyDecorator('sendError')).toBe(true);
    });

    it('should apply reply decorators', () => {
      decoratorManager.decorateReply('sendSuccess', function(this: Reply, data: any) {
        return this.status(200).send({ success: true, data });
      });

      const reply = new Reply();
      decoratorManager.applyReplyDecorators(reply);

      expect(typeof (reply as any).sendSuccess).toBe('function');

      // Test the custom method
      (reply as any).sendSuccess({ message: 'test' });

      expect(reply.sent).toBe(true);
      expect(reply.statusCode).toBe(200);
    });

    it('should add function methods to reply', () => {
      decoratorManager.decorateReply('custom', function(this: Reply) {
        return this.status(201);
      });

      const reply = new Reply();
      decoratorManager.applyReplyDecorators(reply);

      // Test the custom method (needs to be called in reply context)
      const result = (reply as any).custom.call(reply);

      expect(result).toBe(reply); // Should return reply for chaining
      expect(reply.statusCode).toBe(201);
    });

    it('should throw on duplicate reply decorator', () => {
      decoratorManager.decorateReply('sendUser', () => {});

      expect(() => {
        decoratorManager.decorateReply('sendUser', () => {});
      }).toThrow("reply decorator 'sendUser' already exists");
    });

    it('should get reply decorator metadata', () => {
      const fn = function() {};
      decoratorManager.decorateReply('custom', fn);

      const meta = decoratorManager.getReplyDecorator('custom');

      expect(meta).toBeDefined();
      expect(meta?.name).toBe('custom');
    });

    it('should get all reply decorator names', () => {
      decoratorManager.decorateReply('sendSuccess', () => {});
      decoratorManager.decorateReply('sendError', () => {});

      const names = decoratorManager.getReplyDecoratorNames();

      expect(names).toContain('sendSuccess');
      expect(names).toContain('sendError');
      expect(names.length).toBe(2);
    });
  });

  describe('Decorator Inheritance', () => {
    it('should inherit parent decorators', () => {
      const parent = new DecoratorManager();
      const parentApp: any = {};

      parent.decorateServer(parentApp, 'config', { shared: true });
      parent.decorateRequest('user', null);
      parent.decorateReply('sendUser', () => {});

      const child = parent.createChild();

      expect(child.hasServerDecorator('config')).toBe(true);
      expect(child.hasRequestDecorator('user')).toBe(true);
      expect(child.hasReplyDecorator('sendUser')).toBe(true);
    });

    it('should allow child to add own decorators', () => {
      const parent = new DecoratorManager();
      const parentApp: any = {};
      parent.decorateServer(parentApp, 'config', {});

      const child = parent.createChild();
      const childApp: any = {};

      child.decorateServer(childApp, 'plugin', {});

      expect(child.hasServerDecorator('config')).toBe(true);
      expect(child.hasServerDecorator('plugin')).toBe(true);
      expect(parent.hasServerDecorator('plugin')).toBe(false);
    });

    it('should prevent child from overriding parent decorators', () => {
      const parent = new DecoratorManager();
      const parentApp: any = {};
      parent.decorateServer(parentApp, 'db', {});

      const child = parent.createChild();
      const childApp: any = {};

      expect(() => {
        child.decorateServer(childApp, 'db', {});
      }).toThrow("server decorator 'db' already exists");
    });

    it('should apply parent decorators to request', () => {
      const parent = new DecoratorManager();
      parent.decorateRequest('userId', 'parent-user');

      const child = parent.createChild();
      child.decorateRequest('sessionId', 'child-session');

      const req = new Request('http://localhost/test') as HookRequest;
      child.applyRequestDecorators(req);

      expect((req as any).userId).toBe('parent-user');
      expect((req as any).sessionId).toBe('child-session');
    });

    it('should apply parent decorators to reply', () => {
      const parent = new DecoratorManager();
      parent.decorateReply('parentMethod', () => 'parent');

      const child = parent.createChild();
      child.decorateReply('childMethod', () => 'child');

      const reply = new Reply();
      child.applyReplyDecorators(reply);

      expect(typeof (reply as any).parentMethod).toBe('function');
      expect(typeof (reply as any).childMethod).toBe('function');
    });
  });

  describe('Decorator Isolation', () => {
    it('should isolate sibling decorators', () => {
      const parent = new DecoratorManager();

      const child1 = parent.createChild();
      const child2 = parent.createChild();

      const app1: any = {};
      const app2: any = {};

      child1.decorateServer(app1, 'plugin1', {});
      child2.decorateServer(app2, 'plugin2', {});

      expect(child1.hasServerDecorator('plugin1')).toBe(true);
      expect(child1.hasServerDecorator('plugin2')).toBe(false);
      expect(child2.hasServerDecorator('plugin2')).toBe(true);
      expect(child2.hasServerDecorator('plugin1')).toBe(false);
    });

    it('should isolate nested child decorators', () => {
      const parent = new DecoratorManager();
      const parentApp: any = {};
      parent.decorateServer(parentApp, 'level0', {});

      const child1 = parent.createChild();
      const child1App: any = {};
      child1.decorateServer(child1App, 'level1', {});

      const child2 = child1.createChild();
      const child2App: any = {};
      child2.decorateServer(child2App, 'level2', {});

      // Child2 can see all ancestors
      expect(child2.hasServerDecorator('level0')).toBe(true);
      expect(child2.hasServerDecorator('level1')).toBe(true);
      expect(child2.hasServerDecorator('level2')).toBe(true);

      // Child1 cannot see grandchildren
      expect(child1.hasServerDecorator('level0')).toBe(true);
      expect(child1.hasServerDecorator('level1')).toBe(true);
      expect(child1.hasServerDecorator('level2')).toBe(false);

      // Parent cannot see children
      expect(parent.hasServerDecorator('level0')).toBe(true);
      expect(parent.hasServerDecorator('level1')).toBe(false);
      expect(parent.hasServerDecorator('level2')).toBe(false);
    });
  });

  describe('Decorator Statistics', () => {
    it('should return decorator stats', () => {
      const parent = new DecoratorManager();
      const parentApp: any = {};

      parent.decorateServer(parentApp, 'config', {});
      parent.decorateRequest('user', null);

      const child = parent.createChild();
      const childApp: any = {};

      child.decorateServer(childApp, 'plugin', {});
      child.decorateReply('custom', () => {});

      const stats = child.stats();

      expect(stats.server).toBe(1); // Only child decorators
      expect(stats.reply).toBe(1);
      expect(stats.inherited.server).toBe(1); // Parent decorators
      expect(stats.inherited.request).toBe(1);
    });
  });

  describe('Decorator Cloning', () => {
    it('should clone decorator manager', () => {
      const app: any = {};
      decoratorManager.decorateServer(app, 'db', {});
      decoratorManager.decorateRequest('user', null);

      const cloned = decoratorManager.clone();

      expect(cloned.hasServerDecorator('db')).toBe(true);
      expect(cloned.hasRequestDecorator('user')).toBe(true);

      // Adding to clone shouldn't affect original
      const clonedApp: any = {};
      cloned.decorateServer(clonedApp, 'new', {});
      expect(cloned.hasServerDecorator('new')).toBe(true);
      expect(decoratorManager.hasServerDecorator('new')).toBe(false);
    });
  });

  describe('Decorator Clearing', () => {
    it('should clear all decorators', () => {
      const app: any = {};
      decoratorManager.decorateServer(app, 'db', {});
      decoratorManager.decorateRequest('user', null);
      decoratorManager.decorateReply('custom', () => {});

      expect(decoratorManager.hasServerDecorator('db')).toBe(true);
      expect(decoratorManager.hasRequestDecorator('user')).toBe(true);
      expect(decoratorManager.hasReplyDecorator('custom')).toBe(true);

      decoratorManager.clear();

      expect(decoratorManager.hasServerDecorator('db')).toBe(false);
      expect(decoratorManager.hasRequestDecorator('user')).toBe(false);
      expect(decoratorManager.hasReplyDecorator('custom')).toBe(false);
    });
  });
});
