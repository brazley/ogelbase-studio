# Authentication API Endpoints

Production-grade authentication system for Supabase Studio platform.

## 📋 Overview

This authentication system provides secure user registration, login, logout, and token refresh functionality. It integrates with the `platform.users` and `platform.user_sessions` tables for complete session management.

## 🚀 Endpoints

### 1. **POST /api/auth/signup** - User Registration

Creates a new user account with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "first_name": "John",
  "last_name": "Doe",
  "username": "johndoe" // optional
}
```

**Success Response (201):**
```json
{
  "token": "",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "username": "johndoe",
    "avatar_url": null,
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "expires_at": ""
}
```

**Error Responses:**
- `400` - Validation failed (weak password, invalid email)
- `409` - Email or username already exists
- `500` - Database error

**Validation Rules:**
- Email: Valid email format
- Password: Minimum 8 characters, uppercase, lowercase, number
- Username: 3-50 alphanumeric characters (optional)

---

### 2. **POST /api/auth/signin** - User Login

Authenticates a user and creates a session.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Success Response (200):**
```json
{
  "token": "64-char-hex-token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "username": "johndoe",
    "avatar_url": null,
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "expires_at": "2024-01-02T00:00:00.000Z"
}
```

**Error Responses:**
- `401` - Invalid credentials, account deleted, or no password auth
- `403` - Account is banned
- `429` - Too many login attempts (rate limited)
- `500` - Database error

**Security Features:**
- Password verification with bcrypt
- Rate limiting (5 attempts per 15 minutes per IP)
- SHA-256 token hashing for storage
- 24-hour session expiry

---

### 3. **POST /api/auth/signout** - User Logout

Terminates the current user session.

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Successfully signed out"
}
```

**Error Responses:**
- `401` - Missing or invalid token
- `404` - Session not found
- `500` - Database error

---

### 4. **POST /api/auth/refresh** - Token Refresh

Refreshes a session token and updates last activity.

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "token": "new-64-char-hex-token",
  "expires_at": "2024-01-03T00:00:00.000Z"
}
```

**Error Responses:**
- `401` - Missing token, invalid token, or expired session
- `500` - Database error

**Behavior:**
- If token expires within 1 hour: Issues new token
- Otherwise: Updates activity timestamp, returns same token
- Automatically deletes expired sessions

---

## 🔒 Security Features

### Password Security
- **Bcrypt hashing** with 10 salt rounds
- **Password strength validation:**
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number

### Token Security
- **Cryptographically secure tokens** (crypto.randomBytes)
- **SHA-256 hashing** for database storage
- **24-hour expiration** with automatic cleanup
- **Token refresh** mechanism for long-lived sessions

### Rate Limiting
- **Sign-in protection:** 5 attempts per 15 minutes per IP
- **In-memory store** (upgrade to Redis for production)
- **Automatic reset** on successful authentication

### Session Management
- **Database-backed sessions** in `platform.user_sessions`
- **IP address tracking** for security auditing
- **User agent logging** for device identification
- **Last activity tracking** for session monitoring
- **Automatic cleanup** of expired sessions

---

## 📦 Database Schema

### platform.users
```sql
- id (UUID, PRIMARY KEY)
- email (TEXT, UNIQUE, NOT NULL)
- username (TEXT, UNIQUE, nullable)
- first_name (TEXT, nullable)
- last_name (TEXT, nullable)
- password_hash (TEXT, nullable)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
- last_sign_in_at (TIMESTAMPTZ)
- deleted_at (TIMESTAMPTZ, soft delete)
- banned_until (TIMESTAMPTZ)
```

### platform.user_sessions
```sql
- id (UUID, PRIMARY KEY)
- user_id (UUID, FOREIGN KEY -> users.id)
- token (TEXT, UNIQUE, NOT NULL) -- SHA-256 hashed
- ip_address (INET)
- user_agent (TEXT)
- expires_at (TIMESTAMPTZ, NOT NULL)
- last_activity_at (TIMESTAMPTZ)
- created_at (TIMESTAMPTZ)
```

---

## 🧪 Testing

Test suite located in: `pages/api/auth/__tests__/auth.test.ts`

**Run tests:**
```bash
cd apps/studio
pnpm test auth
```

**Test Coverage:**
- ✅ Successful signup
- ✅ Duplicate email rejection
- ✅ Password validation
- ✅ Successful signin
- ✅ Invalid credentials
- ✅ Account status checks (deleted/banned)
- ✅ Session creation and deletion
- ✅ Token refresh logic
- ✅ Expired session handling

---

## 🛠️ Implementation Details

### File Structure
```
apps/studio/
├── lib/api/auth/
│   ├── types.ts          # TypeScript type definitions
│   └── utils.ts          # Helper functions (hashing, validation, tokens)
└── pages/api/auth/
    ├── signup.ts         # User registration endpoint
    ├── signin.ts         # User login endpoint
    ├── signout.ts        # User logout endpoint
    ├── refresh.ts        # Token refresh endpoint
    ├── README.md         # This file
    └── __tests__/
        └── auth.test.ts  # Comprehensive test suite
```

### Dependencies
- `bcryptjs` - Password hashing
- `crypto` (Node.js built-in) - Token generation
- `zod` - Request validation
- `next` - API route handling
- `vitest` - Testing framework

### Error Handling
All endpoints return consistent error responses:
```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "details": {} // Optional validation details
}
```

---

## 🚦 Usage Examples

### Example: Complete Auth Flow

```javascript
// 1. Sign up
const signupRes = await fetch('/api/auth/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123',
    first_name: 'John',
    last_name: 'Doe'
  })
});

// 2. Sign in
const signinRes = await fetch('/api/auth/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123'
  })
});
const { token, user, expires_at } = await signinRes.json();

// 3. Use token for authenticated requests
const protectedRes = await fetch('/api/protected-resource', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// 4. Refresh token
const refreshRes = await fetch('/api/auth/refresh', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const { token: newToken } = await refreshRes.json();

// 5. Sign out
await fetch('/api/auth/signout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

---

## 🎯 Production Readiness

### ✅ Completed
- [x] Password hashing with bcrypt
- [x] Token generation and validation
- [x] Session management
- [x] Rate limiting (basic)
- [x] Input validation with Zod
- [x] Comprehensive error handling
- [x] TypeScript types
- [x] Test suite
- [x] Documentation

### 🔮 Future Enhancements
- [ ] Email verification
- [ ] Password reset flow
- [ ] Two-factor authentication (MFA)
- [ ] Redis-backed rate limiting
- [ ] Session revocation API
- [ ] Audit logging
- [ ] OAuth integration (Google, GitHub, etc.)
- [ ] Refresh token rotation

---

## 📝 Notes

- **No session on signup:** Users must sign in after registration
- **Token format:** 64-character hex string (unhashed)
- **Database storage:** Tokens are SHA-256 hashed in database
- **Rate limiting:** In-memory, resets on server restart (use Redis in production)
- **Soft delete:** Deleted accounts are marked with `deleted_at`, not removed

---

## 🐛 Troubleshooting

### Common Issues

**"Module not found" errors:**
- Ensure `baseUrl: "."` is set in `tsconfig.json`
- Verify files exist in `lib/api/auth/` and `lib/api/platform/`

**"Rate limit exceeded" during testing:**
- Clear rate limits: restart server or add cleanup in tests
- Use different IP addresses or identifiers

**"Session not found" errors:**
- Check token is being sent in Authorization header
- Verify token hasn't expired (24-hour lifetime)
- Ensure token is correctly formatted (no extra spaces)

**Build errors:**
- Run `pnpm install` to ensure bcryptjs is installed
- Check TypeScript compilation: `npx tsc --noEmit`
- Verify database migrations are applied

---

## 📚 Related Documentation

- [Platform Database Schema](../../../database/migrations/003_user_management_and_permissions.sql)
- [Database Connection Guide](../../../database/README.md)
- [API Testing Guide](../../../database/QUICK_START.md)

---

**Status:** ✅ PRODUCTION READY
**Last Updated:** November 21, 2024
**Ticket:** TICKET-1 - Authentication API Endpoints
