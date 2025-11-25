# Ticket: Build Fastify-Style Request/Reply Helpers for Ogelfy

**Agent**: Miguel Santos (API & Middleware Engineer)
**Status**: Not Started
**Priority**: High
**Estimated Effort**: 2-3 hours

---

## Context

Ogelfy is a Fastify-inspired web framework built on Bun. Currently has basic `Reply` class in `src/hooks.ts` with minimal methods. Need to extend with full Fastify-style helper methods for ergonomic API development.

**Working Directory**: `/Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy/`

**Current State**:
- Basic Reply class exists in `src/hooks.ts` (lines 40-169)
- Has: `status()`, `header()`, `headers()`, `send()`, `code()`
- RouteContext in `src/types.ts` has: `params`, `query`, `body`
- Test infrastructure uses Bun test (see `__tests__/router.test.ts`)

---

## Deliverables

### 1. Reply Helpers (`src/reply-helpers.ts`)

**Features**:
- Status code methods: `.code()`, `.status()` ✅ (already exist, ensure consistency)
- Header management: `.header()`, `.headers()` ✅ (already exist)
- Content-Type: `.type(contentType)` - shorthand for Content-Type header
- Redirects: `.redirect(url)` and `.redirect(statusCode, url)`
- Cookies: `.setCookie(name, value, options)`, `.clearCookie(name, options)`
- Method chaining: All methods return `this`
- Response building: Enhanced `.send(payload)` that handles Response creation

**Cookie Options Interface**:
```typescript
interface CookieOptions {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: 'strict' | 'lax' | 'none';
  secure?: boolean;
}
```

**Implementation Notes**:
- Extend existing Reply class in `src/hooks.ts` (DON'T create new file, modify existing)
- Add cookie serialization helper: `serializeCookie(name, value, options)`
- Ensure thread-safety and proper header handling
- `.redirect()` should return Response directly (sets `_sent = true`)

### 2. Request Helpers (Extend `RouteContext` in `src/types.ts`)

**Add to RouteContext**:
```typescript
export interface RouteContext {
  params: Record<string, string>;     // ✅ Already exists
  query: Record<string, string>;      // ✅ Already exists
  body?: any;                          // ✅ Already exists
  cookies: Record<string, string>;     // ADD THIS
  ip: string;                          // ADD THIS
  hostname: string;                    // ADD THIS
  protocol: string;                    // ADD THIS
}
```

**Helper Functions** (add to `src/router.ts` or new `src/request-helpers.ts`):
- `parseCookies(req: Request): Record<string, string>` - Parse Cookie header
- `getIP(req: Request): string` - Extract IP from headers (x-forwarded-for, x-real-ip)
- `getHostname(req: Request): string` - Extract hostname from URL
- `getProtocol(req: Request): string` - Extract protocol (http/https)

**Integration Point**:
Update `handleRequest()` in `src/index.ts` (around line 400) to populate new RouteContext fields.

### 3. Tests (`__tests__/reply-helpers.test.ts`)

**Test Coverage** (30+ tests):

**Reply Tests**:
- ✅ Status code: `.code()`, `.status()`
- ✅ Headers: `.header()`, `.headers()`, `.type()`
- ✅ Method chaining works
- ✅ Redirects: `.redirect(url)`, `.redirect(302, url)`, `.redirect(301, url)`
- ✅ Cookies: `.setCookie()` with all options, `.clearCookie()`
- ✅ Cookie serialization: domain, expires, httpOnly, maxAge, path, sameSite, secure
- ✅ Error handling: setting headers after response sent
- ✅ Response building with correct headers

**Request Tests**:
- ✅ Cookie parsing: single, multiple, with special characters
- ✅ IP extraction: x-forwarded-for, x-real-ip, fallback
- ✅ Hostname extraction
- ✅ Protocol detection

**Integration Tests**:
- ✅ Full request/reply cycle with cookies
- ✅ Redirect flow
- ✅ Header manipulation in handlers

### 4. Documentation

**Add to existing files**:
- JSDoc comments for all new methods
- Usage examples in comments
- Type definitions for all interfaces

**Example Usage Documentation** (add as comment block in `src/reply-helpers.ts`):
```typescript
/**
 * USAGE EXAMPLES:
 *
 * // Status and headers
 * return reply.code(200).header('x-custom', 'value').send({ data });
 *
 * // Content-Type shorthand
 * return reply.type('text/html').send('<h1>Hello</h1>');
 *
 * // Redirects
 * return reply.redirect('/new-location');
 * return reply.redirect(301, '/permanent');
 *
 * // Cookies
 * return reply
 *   .setCookie('session', 'token123', {
 *     httpOnly: true,
 *     secure: true,
 *     sameSite: 'strict',
 *     maxAge: 86400
 *   })
 *   .send({ success: true });
 *
 * // Clear cookie
 * return reply.clearCookie('session').send({ loggedOut: true });
 *
 * // Access request helpers in context
 * app.get('/user/:id', async (req, context) => {
 *   console.log('IP:', context.ip);
 *   console.log('Session:', context.cookies.session);
 *   return reply.send({ userId: context.params.id });
 * });
 */
```

---

## Acceptance Criteria

- ✅ All Reply helper methods implemented with method chaining
- ✅ Cookie serialization handles all options correctly
- ✅ Request context includes cookies, IP, hostname, protocol
- ✅ 30+ tests pass (run: `cd /Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy && bun test`)
- ✅ Integration with existing Ogelfy code (no breaking changes)
- ✅ Type-safe interfaces with full TypeScript support
- ✅ Documentation with usage examples

---

## Code Audit Findings

**Existing Code Patterns**:
1. Reply class in `src/hooks.ts` uses:
   - Private properties with `_` prefix
   - Method chaining (returns `this`)
   - Lazy Response building (builds in getter)
   - Error throwing when response already sent

2. Test patterns in `__tests__/router.test.ts`:
   - Bun test framework: `describe`, `test`, `expect`
   - Simple, focused test cases
   - Direct assertions

3. Request handling in `src/index.ts`:
   - Line 343-494: `handleRequest()` method
   - Line 376-379: Query parsing
   - Line 382-398: Body parsing
   - Line 400-405: RouteContext creation ← **MODIFY HERE**

**Integration Points**:
- Modify `src/hooks.ts`: Extend Reply class (lines 40-169)
- Modify `src/types.ts`: Extend RouteContext interface (lines 7-11)
- Modify `src/index.ts`: Update RouteContext creation (around line 400)
- Create `__tests__/reply-helpers.test.ts`: New test file

---

## Implementation Instructions for Miguel Santos

You're extending Ogelfy's request/reply API to match Fastify's ergonomics. The groundwork is solid - Reply class exists, test infrastructure works, routing handles context.

**Your Task**:
1. **Extend Reply class** in `src/hooks.ts`:
   - Add `.type()` method
   - Add `.redirect()` overloads
   - Add `.setCookie()` and `.clearCookie()`
   - Add cookie serialization helper

2. **Extend RouteContext** in `src/types.ts`:
   - Add `cookies`, `ip`, `hostname`, `protocol` fields

3. **Add request helpers**:
   - Cookie parsing from request headers
   - IP extraction (with x-forwarded-for support)
   - Hostname/protocol extraction

4. **Update `handleRequest()`** in `src/index.ts`:
   - Parse cookies and populate context
   - Extract IP, hostname, protocol
   - Around line 400-405 where RouteContext is created

5. **Write comprehensive tests** in `__tests__/reply-helpers.test.ts`:
   - 30+ tests covering all features
   - Follow existing test patterns in `__tests__/router.test.ts`

**Build Quality**:
- Type-safe (full TypeScript)
- Method chaining everywhere
- Error handling (throw on response already sent)
- Edge cases covered (URL encoding in cookies, header precedence for IP)

**Run Tests**:
```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/ogelfy
bun test
```

Make this API feel like Fastify - ergonomic, chainable, intuitive. Go.
