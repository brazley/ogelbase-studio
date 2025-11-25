import { describe, test, expect } from 'bun:test';
import {
  HttpError,
  ValidationError,
  httpErrors,
  ErrorHandling,
  createErrorResponse,
  assert,
  errorBoundary
} from '../src/error-handler';
import { z, ZodError } from 'zod';

describe('HttpError', () => {
  test('creates basic HTTP error', () => {
    const error = new HttpError(400, 'Bad Request', 'BAD_REQUEST');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Bad Request');
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.name).toBe('HttpError');
  });

  test('creates HTTP error with details', () => {
    const error = new HttpError(400, 'Validation failed', 'VALIDATION_ERROR', {
      field: 'email',
      issue: 'invalid format'
    });

    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ field: 'email', issue: 'invalid format' });
  });

  test('serializes to JSON', () => {
    const error = new HttpError(404, 'Not Found', 'NOT_FOUND');
    const json = error.toJSON();

    expect(json).toEqual({
      error: 'Not Found',
      code: 'NOT_FOUND',
      statusCode: 404
    });
  });

  test('serializes with details', () => {
    const error = new HttpError(400, 'Bad Request', 'BAD_REQUEST', { field: 'name' });
    const json = error.toJSON();

    expect(json).toEqual({
      error: 'Bad Request',
      code: 'BAD_REQUEST',
      statusCode: 400,
      details: { field: 'name' }
    });
  });
});

describe('ValidationError', () => {
  test('creates validation error', () => {
    const errors = [{ path: 'email', message: 'Invalid email', code: 'invalid_string' }];
    const error = new ValidationError('Validation failed', errors);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.errors).toEqual(errors);
  });

  test('creates from ZodError', () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number().min(18)
    });

    try {
      schema.parse({ email: 'invalid', age: 10 });
    } catch (zodError) {
      const error = ValidationError.fromZodError(zodError as ZodError);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.statusCode).toBe(400);
      expect(error.errors).toHaveLength(2);
      expect(error.errors[0].path).toBe('email');
      expect(error.errors[1].path).toBe('age');
    }
  });

  test('formats Zod error paths correctly', () => {
    const schema = z.object({
      user: z.object({
        profile: z.object({
          name: z.string().min(1)
        })
      })
    });

    try {
      schema.parse({ user: { profile: { name: '' } } });
    } catch (zodError) {
      const error = ValidationError.fromZodError(zodError as ZodError);

      expect(error.errors[0].path).toBe('user.profile.name');
    }
  });
});

describe('httpErrors factory', () => {
  test('badRequest (400)', () => {
    const error = httpErrors.badRequest();
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');

    const custom = httpErrors.badRequest('Custom message');
    expect(custom.message).toBe('Custom message');
  });

  test('unauthorized (401)', () => {
    const error = httpErrors.unauthorized();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');

    const custom = httpErrors.unauthorized('Token expired');
    expect(custom.message).toBe('Token expired');
  });

  test('forbidden (403)', () => {
    const error = httpErrors.forbidden();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  test('notFound (404)', () => {
    const error = httpErrors.notFound();
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');

    const custom = httpErrors.notFound('User not found');
    expect(custom.message).toBe('User not found');
  });

  test('conflict (409)', () => {
    const error = httpErrors.conflict();
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');

    const custom = httpErrors.conflict('Email already exists');
    expect(custom.message).toBe('Email already exists');
  });

  test('unprocessableEntity (422)', () => {
    const error = httpErrors.unprocessableEntity();
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('UNPROCESSABLE_ENTITY');
  });

  test('tooManyRequests (429)', () => {
    const error = httpErrors.tooManyRequests();
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('TOO_MANY_REQUESTS');

    const custom = httpErrors.tooManyRequests('Rate limit exceeded');
    expect(custom.message).toBe('Rate limit exceeded');
  });

  test('internalServerError (500)', () => {
    const error = httpErrors.internalServerError();
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
  });

  test('notImplemented (501)', () => {
    const error = httpErrors.notImplemented();
    expect(error.statusCode).toBe(501);
    expect(error.code).toBe('NOT_IMPLEMENTED');
  });

  test('serviceUnavailable (503)', () => {
    const error = httpErrors.serviceUnavailable();
    expect(error.statusCode).toBe(503);
    expect(error.code).toBe('SERVICE_UNAVAILABLE');
  });

  test('all errors accept custom details', () => {
    const error = httpErrors.badRequest('Custom', { foo: 'bar' });
    expect(error.details).toEqual({ foo: 'bar' });
  });

  test('validation error from ZodError', () => {
    const schema = z.object({ email: z.string().email() });

    try {
      schema.parse({ email: 'invalid' });
    } catch (zodError) {
      const error = httpErrors.validation(zodError as ZodError);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('ErrorHandling', () => {
  test('sets and gets error handler', () => {
    const handling = new ErrorHandling();
    const handler = async (error: Error, req: Request) => {
      return new Response('Custom error', { status: 500 });
    };

    handling.setErrorHandler(handler);
    expect(handling.getErrorHandler()).toBe(handler);
  });

  test('sets and gets not found handler', () => {
    const handling = new ErrorHandling();
    const handler = async (req: Request) => {
      return { error: 'Custom 404' };
    };

    handling.setNotFoundHandler(handler);
    expect(handling.getNotFoundHandler()).toBe(handler);
  });

  test('handles HttpError with default handler', async () => {
    const handling = new ErrorHandling();
    const error = httpErrors.badRequest('Invalid input');
    const req = new Request('http://localhost/test');

    const response = await handling.handleError(error, req);

    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json).toEqual({
      error: 'Invalid input',
      code: 'BAD_REQUEST',
      statusCode: 400
    });
  });

  test('handles ValidationError with default handler', async () => {
    const handling = new ErrorHandling();
    const schema = z.object({ email: z.string().email() });

    try {
      schema.parse({ email: 'invalid' });
    } catch (zodError) {
      const error = ValidationError.fromZodError(zodError as ZodError);
      const req = new Request('http://localhost/test');

      const response = await handling.handleError(error, req);

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.statusCode).toBe(400);
      expect(json.code).toBe('VALIDATION_ERROR');
      expect(json.details).toBeDefined();
    }
  });

  test('handles ZodError directly', async () => {
    const handling = new ErrorHandling();
    const schema = z.object({ email: z.string().email() });

    try {
      schema.parse({ email: 'invalid' });
    } catch (zodError) {
      const req = new Request('http://localhost/test');
      const response = await handling.handleError(zodError as Error, req);

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.code).toBe('VALIDATION_ERROR');
    }
  });

  test('handles unknown errors with default handler', async () => {
    const handling = new ErrorHandling();
    const error = new Error('Something went wrong');
    const req = new Request('http://localhost/test');

    const response = await handling.handleError(error, req);

    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.statusCode).toBe(500);
    expect(json.code).toBe('INTERNAL_ERROR');
  });

  test('uses custom error handler when set', async () => {
    const handling = new ErrorHandling();
    const customHandler = async (error: Error, req: Request) => {
      return new Response(
        JSON.stringify({ custom: true, message: error.message }),
        { status: 418, headers: { 'content-type': 'application/json' } }
      );
    };

    handling.setErrorHandler(customHandler);

    const error = new Error('Test error');
    const req = new Request('http://localhost/test');

    const response = await handling.handleError(error, req);

    expect(response.status).toBe(418);

    const json = await response.json();
    expect(json).toEqual({ custom: true, message: 'Test error' });
  });

  test('handles 404 with default handler', async () => {
    const handling = new ErrorHandling();
    const req = new Request('http://localhost/unknown');

    const response = await handling.handleNotFound(req);

    expect(response.status).toBe(404);

    const json = await response.json();
    expect(json.statusCode).toBe(404);
    expect(json.code).toBe('NOT_FOUND');
    expect(json.path).toBe('/unknown');
  });

  test('uses custom not found handler when set', async () => {
    const handling = new ErrorHandling();
    const customHandler = async (req: Request) => {
      return { custom: true, path: new URL(req.url).pathname };
    };

    handling.setNotFoundHandler(customHandler);

    const req = new Request('http://localhost/unknown');
    const response = await handling.handleNotFound(req);

    expect(response.status).toBe(404);

    const json = await response.json();
    expect(json).toEqual({ custom: true, path: '/unknown' });
  });
});

describe('createErrorResponse', () => {
  test('creates error response', async () => {
    const response = createErrorResponse(400, 'Bad Request', 'BAD_REQUEST');

    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json).toEqual({
      error: 'Bad Request',
      code: 'BAD_REQUEST',
      statusCode: 400
    });
  });

  test('creates error response with details', async () => {
    const response = createErrorResponse(400, 'Validation failed', 'VALIDATION_ERROR', {
      field: 'email'
    });

    const json = await response.json();
    expect(json.details).toEqual({ field: 'email' });
  });
});

describe('assert', () => {
  test('does not throw when condition is truthy', () => {
    expect(() => {
      assert(true, httpErrors.badRequest());
      assert(1, httpErrors.badRequest());
      assert('string', httpErrors.badRequest());
    }).not.toThrow();
  });

  test('throws when condition is falsy', () => {
    expect(() => {
      assert(false, httpErrors.badRequest('Failed'));
    }).toThrow('Failed');

    expect(() => {
      assert(0, httpErrors.unauthorized());
    }).toThrow();

    expect(() => {
      assert(null, httpErrors.notFound());
    }).toThrow();
  });

  test('throws correct error type', () => {
    try {
      assert(false, httpErrors.notFound('User not found'));
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(404);
    }
  });
});

describe('errorBoundary', () => {
  test('passes through successful function calls', async () => {
    const fn = async (x: number) => x * 2;
    const wrapped = errorBoundary(fn);

    const result = await wrapped(5);
    expect(result).toBe(10);
  });

  test('allows errors to propagate by default', async () => {
    const fn = async () => {
      throw new Error('Test error');
    };
    const wrapped = errorBoundary(fn);

    await expect(wrapped()).rejects.toThrow('Test error');
  });

  test('uses custom error handler when provided', async () => {
    const fn = async () => {
      throw new Error('Test error');
    };
    const wrapped = errorBoundary(fn, (error) => {
      return { caught: true, message: error.message };
    });

    const result = await wrapped();
    expect(result).toEqual({ caught: true, message: 'Test error' });
  });

  test('custom error handler can transform errors', async () => {
    const fn = async () => {
      throw httpErrors.badRequest('Invalid input');
    };
    const wrapped = errorBoundary(fn, (error) => {
      if (error instanceof HttpError) {
        return { statusCode: error.statusCode, message: error.message };
      }
      return { statusCode: 500, message: 'Unknown error' };
    });

    const result = await wrapped();
    expect(result).toEqual({ statusCode: 400, message: 'Invalid input' });
  });
});
