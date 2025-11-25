import { describe, test, expect } from 'bun:test';
import { Router } from '../src/router';

describe('Router', () => {
  test('matches static routes', () => {
    const router = new Router();
    const handler = async () => ({ ok: true });

    router.add('GET', '/hello', handler);

    const result = router.find('GET', '/hello');
    expect(result).toBeTruthy();
    expect(result?.handler).toBe(handler);
  });

  test('matches routes with parameters', () => {
    const router = new Router();
    const handler = async () => ({ ok: true });

    router.add('GET', '/users/:id', handler);

    const result = router.find('GET', '/users/123');
    expect(result).toBeTruthy();
    expect(result?.params).toEqual({ id: '123' });
  });
});
