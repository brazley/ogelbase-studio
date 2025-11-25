import { describe, test, expect } from 'bun:test';
import { Reply } from '../src/reply';

describe('Reply', () => {
  test('code() sets status code', () => {
    const reply = new Reply();
    reply.code(201);

    const res = reply.send({ ok: true });
    expect(res.status).toBe(201);
  });

  test('header() sets custom header', () => {
    const reply = new Reply();
    reply.header('x-custom', 'value');

    const res = reply.send({});
    expect(res.headers.get('x-custom')).toBe('value');
  });

  test('type() sets content-type', () => {
    const reply = new Reply();
    reply.type('text/plain');

    const res = reply.send('hello');
    expect(res.headers.get('content-type')).toBe('text/plain');
  });

  test('redirect() returns redirect response', () => {
    const reply = new Reply();
    const res = reply.redirect(301, '/new-location');

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/new-location');
  });

  test('setCookie() serializes cookie', () => {
    const reply = new Reply();
    reply.setCookie('session', 'token123', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 86400
    });

    const res = reply.send({});
    const cookie = res.headers.get('set-cookie')!;

    expect(cookie).toContain('session=token123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=strict');
    expect(cookie).toContain('Max-Age=86400');
  });

  test('method chaining works', () => {
    const reply = new Reply();

    const res = reply
      .code(201)
      .header('x-custom', 'value')
      .type('application/json')
      .send({ created: true });

    expect(res.status).toBe(201);
    expect(res.headers.get('x-custom')).toBe('value');
    expect(res.headers.get('content-type')).toBe('application/json');
  });
});
