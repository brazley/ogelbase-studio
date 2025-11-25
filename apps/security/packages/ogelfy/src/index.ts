import type { Server } from 'bun';
import { Router } from './router';
import type {
  RouteHandler,
  OgelfyOptions,
  OgelfyPlugin,
  RouteContext,
  RouteOptions,
  RouteChain,
  PluginOptions
} from './types';
import {
  ErrorHandling,
  httpErrors,
  HttpError,
  ValidationError,
  type ErrorHandler,
  type NotFoundHandler
} from './error-handler';
import { Testing } from './testing';
import { ContentTypeParser } from './content-parser';
import { Serializer } from './serializer';
import { SchemaCompiler, ValidationError as SchemaValidationError } from './schema-compiler';
import { HookManager, Reply, type HookName, type HookHandler, type HookRequest } from './hooks';
import { DecoratorManager } from './decorators';
import { PluginRegistry, getPluginMetadata, type PluginMetadata } from './plugin-registry';
import { createLogger, createRequestLogger } from './logger';
import type { Logger } from 'pino';

function parseCookies(req: Request): Record<string, string> {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return {};

  const cookies: Record<string, string> = {};
  for (const cookie of cookieHeader.split(';')) {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  }
  return cookies;
}

function getIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

function getHostname(req: Request): string {
  return req.headers.get('host')?.split(':')[0] || 'localhost';
}

function getProtocol(req: Request): string {
  return req.headers.get('x-forwarded-proto') || 'http';
}

export class Ogelfy {
  private router: Router;
  private plugins: OgelfyPlugin[] = [];
  private server?: Server;
  private errorHandling: ErrorHandling;
  private testing: Testing;
  private contentParser: ContentTypeParser;
  private serializer: Serializer;
  private schemaCompiler: SchemaCompiler;
  private logger: Logger;

  // New plugin architecture components
  private hookManager: HookManager;
  private decoratorManager: DecoratorManager;
  private pluginRegistry: PluginRegistry;
  private parent?: Ogelfy; // For plugin context isolation
  private requestTimeout?: number;

  /**
   * HTTP error factory methods
   */
  public httpErrors = httpErrors;

  constructor(options?: OgelfyOptions, parent?: Ogelfy) {
    this.parent = parent;
    this.requestTimeout = options?.requestTimeout;

    this.logger = createLogger(options?.logger || {});
    this.schemaCompiler = new SchemaCompiler(options?.schemaCompiler || {});
    this.router = new Router(this.schemaCompiler);
    this.errorHandling = new ErrorHandling();
    this.contentParser = new ContentTypeParser();
    this.serializer = new Serializer();

    // Initialize new plugin architecture
    if (parent) {
      // Child context - inherit from parent
      this.hookManager = parent.hookManager.clone();
      this.decoratorManager = parent.decoratorManager.createChild();
      this.pluginRegistry = parent.pluginRegistry; // Shared registry
    } else {
      // Root context - create new managers
      this.hookManager = new HookManager();
      this.decoratorManager = new DecoratorManager();
      this.pluginRegistry = new PluginRegistry();
    }

    // Testing needs access to error handling and logger
    this.testing = new Testing(this.router, this.errorHandling, this.logger);
  }

  /**
   * Add a lifecycle hook
   */
  addHook(name: HookName, handler: HookHandler): this {
    this.hookManager.add(name, handler);
    return this;
  }

  /**
   * Decorate the server instance with custom properties/methods
   */
  decorate<T = any>(name: string, value: T | (() => T)): this {
    this.decoratorManager.decorateServer(this, name, value);
    return this;
  }

  /**
   * Decorate request objects
   */
  decorateRequest<T = any>(name: string, value: T | (() => T)): this {
    this.decoratorManager.decorateRequest(name, value);
    return this;
  }

  /**
   * Decorate reply objects
   */
  decorateReply<T = any>(name: string, value: T | (() => T)): this {
    this.decoratorManager.decorateReply(name, value);
    return this;
  }

  /**
   * Check if a decorator exists
   */
  hasDecorator(name: string): boolean {
    return this.decoratorManager.hasServerDecorator(name);
  }

  /**
   * Check if a request decorator exists
   */
  hasRequestDecorator(name: string): boolean {
    return this.decoratorManager.hasRequestDecorator(name);
  }

  /**
   * Check if a reply decorator exists
   */
  hasReplyDecorator(name: string): boolean {
    return this.decoratorManager.hasReplyDecorator(name);
  }

  /**
   * Add a custom content-type parser
   */
  addContentTypeParser(contentType: string, parser: (req: Request) => Promise<any>): void {
    this.contentParser.add(contentType, parser);
  }

  /**
   * Remove a content-type parser
   */
  removeContentTypeParser(contentType: string): boolean {
    return this.contentParser.remove(contentType);
  }

  /**
   * Register a route with optional options (supports schemas, constraints, hooks)
   */
  private addRoute(
    method: string,
    path: string | RegExp,
    handlerOrOptions: RouteHandler | RouteOptions,
    maybeHandler?: RouteHandler
  ): void {
    let handler: RouteHandler;
    let options: RouteOptions | undefined;

    if (typeof handlerOrOptions === 'function') {
      handler = handlerOrOptions;
      options = undefined;
    } else {
      if (!maybeHandler) {
        throw new Error('Handler is required when options are provided');
      }
      options = handlerOrOptions;
      handler = maybeHandler;
    }

    this.router.add(method, path, handler, options);
  }

  get(path: string | RegExp, handler: RouteHandler): void;
  get(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  get(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('GET', path, handlerOrOptions, maybeHandler);
  }

  post(path: string | RegExp, handler: RouteHandler): void;
  post(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  post(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('POST', path, handlerOrOptions, maybeHandler);
  }

  put(path: string | RegExp, handler: RouteHandler): void;
  put(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  put(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('PUT', path, handlerOrOptions, maybeHandler);
  }

  delete(path: string | RegExp, handler: RouteHandler): void;
  delete(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  delete(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('DELETE', path, handlerOrOptions, maybeHandler);
  }

  patch(path: string | RegExp, handler: RouteHandler): void;
  patch(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  patch(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('PATCH', path, handlerOrOptions, maybeHandler);
  }

  options(path: string | RegExp, handler: RouteHandler): void;
  options(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  options(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('OPTIONS', path, handlerOrOptions, maybeHandler);
  }

  head(path: string | RegExp, handler: RouteHandler): void;
  head(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  head(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('HEAD', path, handlerOrOptions, maybeHandler);
  }

  /**
   * ALL methods route
   */
  all(path: string | RegExp, handler: RouteHandler): void;
  all(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  all(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('ALL', path, handlerOrOptions, maybeHandler);
  }

  /**
   * Route chaining API
   */
  route(path: string): RouteChain {
    const self = this;
    return {
      get(handler: RouteHandler) {
        self.get(path, handler);
        return this;
      },
      post(handler: RouteHandler) {
        self.post(path, handler);
        return this;
      },
      put(handler: RouteHandler) {
        self.put(path, handler);
        return this;
      },
      delete(handler: RouteHandler) {
        self.delete(path, handler);
        return this;
      },
      patch(handler: RouteHandler) {
        self.patch(path, handler);
        return this;
      },
      options(handler: RouteHandler) {
        self.options(path, handler);
        return this;
      },
      head(handler: RouteHandler) {
        self.head(path, handler);
        return this;
      },
      all(handler: RouteHandler) {
        self.all(path, handler);
        return this;
      },
    };
  }

  /**
   * Register a plugin with advanced encapsulation and lifecycle management
   */
  async register(plugin: OgelfyPlugin, options?: any): Promise<void> {
    // Extract metadata from plugin (if wrapped with fp())
    const metadata = getPluginMetadata(plugin);

    // Check if plugin should skip encapsulation
    const shouldEncapsulate = metadata?.encapsulate !== false;

    if (shouldEncapsulate) {
      // Create isolated context (child Ogelfy instance)
      const childInstance = new Ogelfy({}, this);

      // Register in plugin registry with metadata
      await this.pluginRegistry.register(
        async (opts: any) => {
          await plugin(childInstance, opts);
        },
        options,
        metadata
      );
    } else {
      // No encapsulation - plugin modifies parent directly
      await this.pluginRegistry.register(
        async (opts: any) => {
          await plugin(this, opts);
        },
        options,
        metadata
      );
    }

    this.plugins.push(plugin);
  }

  /**
   * Check if a plugin is loaded
   */
  hasPlugin(name: string): boolean {
    return this.pluginRegistry.hasPlugin(name);
  }

  /**
   * Add a shared JSON schema
   */
  addSchema(id: string, schema: any): void {
    this.schemaCompiler.addSchema(id, schema);
  }

  /**
   * Get the schema compiler instance
   */
  getSchemaCompiler(): SchemaCompiler {
    return this.schemaCompiler;
  }

  /**
   * Set custom error handler
   */
  setErrorHandler(handler: ErrorHandler): void {
    this.errorHandling.setErrorHandler(handler);
  }

  /**
   * Set custom 404 handler
   */
  setNotFoundHandler(handler: NotFoundHandler): void {
    this.errorHandling.setNotFoundHandler(handler);
  }

  /**
   * Inject request for testing (no HTTP server needed)
   */
  async inject(options: any) {
    return this.testing.inject(options);
  }

  /**
   * Handle request with full lifecycle hooks
   */
  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const startTime = Date.now();

    // Create request logger
    const log = createRequestLogger(this.logger, req);
    log.info('Incoming request');

    // Create hook request with metadata
    const hookReq = req as HookRequest;
    hookReq.id = crypto.randomUUID();
    hookReq.startTime = startTime;

    // Create reply object
    const reply = new Reply();

    // Apply decorators
    this.decoratorManager.applyRequestDecorators(hookReq);
    this.decoratorManager.applyReplyDecorators(reply);

    try {
      // HOOK: onRequest (earliest interception)
      await this.hookManager.run('onRequest', hookReq, reply);
      if (reply.sent) return reply.response;

      // Find route
      const route = this.router.find(req.method, url.pathname, req);

      if (!route) {
        return this.errorHandling.handleNotFound(req);
      }

      // HOOK: preParsing (before body parse)
      await this.hookManager.runWithRoute('preParsing', route.hooks, hookReq, reply);
      if (reply.sent) return reply.response;

      // Parse query parameters
      const query: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        query[key] = value;
      });

      // Parse request body for non-GET/HEAD requests
      let body: any = null;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        try {
          body = await this.contentParser.parse(req);
        } catch (error) {
          return new Response(
            JSON.stringify({
              error: 'Bad Request',
              message: error instanceof Error ? error.message : String(error)
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      }

      // Create route context
      const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
      const context: RouteContext = {
        params: route.params,
        query,
        body,
        cookies: parseCookies(req),
        ip: getIP(req),
        hostname: getHostname(req),
        protocol: getProtocol(req),
        log,
        requestId
      };
      hookReq.context = context;

      // HOOK: preValidation (before schema validation)
      await this.hookManager.runWithRoute('preValidation', route.hooks, hookReq, reply);
      if (reply.sent) return reply.response;

      // Validate request if schema exists
      if (route.schema) {
        await this.router.validateRequest(req, route.schema, context);
      }

      // HOOK: preHandler (after validation, before handler - auth, permissions)
      await this.hookManager.runWithRoute('preHandler', route.hooks, hookReq, reply);
      if (reply.sent) return reply.response;

      // Execute handler with context
      let result = await route.handler(req, context);

      // If handler returns Response, use it directly
      if (result instanceof Response) {
        return result;
      }

      // HOOK: preSerialization (transform response data)
      result = await this.hookManager.runWithRoute('preSerialization', route.hooks, hookReq, reply, result);

      // Determine status code
      let statusCode = 200;
      let responseData = result;

      if (result && typeof result === 'object' && 'statusCode' in result) {
        statusCode = result.statusCode;
        // Remove statusCode from response data
        const { statusCode: _, ...rest } = result;
        responseData = rest;
      }

      // Validate response if schema exists
      if (route.schema?.response) {
        responseData = this.router.validateResponse(route.schema, statusCode, responseData);
      }

      // Serialize response
      const responseBody = typeof responseData === 'string'
        ? responseData
        : this.serializer.serialize(responseData);

      // Set response in reply
      reply.status(statusCode);
      if (!reply.hasHeader('Content-Type')) {
        reply.header('Content-Type', 'application/json');
      }
      reply.send(responseBody);

      // HOOK: onSend (before response sent - compression, final modifications)
      await this.hookManager.runWithRoute('onSend', route.hooks, hookReq, reply);

      const response = reply.response;

      // Log successful request completion
      log.info({
        statusCode: response.status,
        duration: Date.now() - startTime
      }, 'Request completed');

      // HOOK: onResponse (after response sent - logging, metrics)
      // Note: This runs after we return the response, so it doesn't block
      setImmediate(async () => {
        try {
          await this.hookManager.runWithRoute('onResponse', route.hooks, hookReq, reply);
        } catch (error) {
          console.error('Error in onResponse hook:', error);
        }
      });

      return response;
    } catch (error) {
      // Log error
      log.error({ err: error }, 'Request failed');

      // HOOK: onError (on any error during lifecycle)
      await this.hookManager.runOnError(hookReq, reply, error as Error);

      if (reply.sent) {
        return reply.response;
      }

      // Handle schema validation errors
      if (error instanceof SchemaValidationError) {
        return new Response(JSON.stringify(error.toJSON()), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return this.errorHandling.handleError(error as Error, req);
    }
  }

  async listen(options: { port: number; hostname?: string }): Promise<Server> {
    this.server = Bun.serve({
      port: options.port,
      hostname: options.hostname || 'localhost',
      fetch: (req) => this.handleRequest(req),
    });

    return this.server;
  }

  async close() {
    this.server?.stop();
  }

  /**
   * Get hook manager (for debugging)
   */
  getHookManager(): HookManager {
    return this.hookManager;
  }

  /**
   * Get decorator manager (for debugging)
   */
  getDecoratorManager(): DecoratorManager {
    return this.decoratorManager;
  }

  /**
   * Get plugin registry (for debugging)
   */
  getPluginRegistry(): PluginRegistry {
    return this.pluginRegistry;
  }
}

// Export logger
export { createLogger, type LoggerOptions } from './logger';

// Export all new plugin architecture components
export { HookManager, type HookName, type HookHandler, type HookRequest } from './hooks';
export { Reply as HookReply } from './hooks';
export { Reply, type CookieOptions } from './reply';
export { DecoratorManager } from './decorators';
export { PluginRegistry, fp, getPluginMetadata, type PluginMetadata } from './plugin-registry';

// Export schema compiler
export {
  SchemaCompiler,
  ValidationError as SchemaValidationError,
  schemaCompiler
} from './schema-compiler';

// Export error handling utilities
export {
  HttpError,
  ValidationError,
  httpErrors,
  type ErrorHandler,
  type NotFoundHandler,
  createErrorResponse,
  assert,
  errorBoundary
} from './error-handler';

// Export testing utilities
export {
  Testing,
  type InjectOptions,
  type InjectResponse,
  testHelpers
} from './testing';

// Export content parsing
export {
  ContentTypeParser,
  contentParser,
  type ContentParser,
  type ParsedMultipart
} from './content-parser';

// Export serialization
export {
  Serializer,
  serializer,
  createRouteSchema,
  Schemas,
  type SerializerSchema,
  type RouteSchema as SerializerRouteSchema
} from './serializer';

// Export existing modules
export { Router } from './router';
export type {
  RouteHandler,
  OgelfyOptions,
  OgelfyPlugin,
  RouteContext,
  RouteSchema,
  RouteOptions,
  RouteConstraints,
  RouteChain,
  PluginOptions
} from './types';
export { validate } from './validation';
