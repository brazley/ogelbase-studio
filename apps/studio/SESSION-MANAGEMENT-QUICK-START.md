# Session Management - Quick Start Guide

## 🚀 What Was Implemented

Production-grade session validation middleware that integrates with `platform.user_sessions` table.

## 📁 Key Files

### Core Implementation
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/apiAuthenticate.ts` - Session validation
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/apiWrapper.ts` - API integration
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/auth/session.ts` - Session utilities
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/pages/api/auth/cleanup-sessions.ts` - Cleanup endpoint

### Supporting Files
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/auth/types.ts` - Type definitions
- `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/lib/api/__tests__/session.test.ts` - Tests

## 🔐 Using Authentication in Your Endpoints

### Authenticated Endpoint
```typescript
import apiWrapper, { AuthenticatedRequest } from 'lib/api/apiWrapper'
import type { NextApiResponse } from 'next'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Access user context
  const { userId, email, sessionId } = req.user!

  // Your logic here
  return res.json({
    message: `Hello ${email}`,
    userId
  })
}

// Enable authentication
export default (req, res) => apiWrapper(req, res, handler, { withAuth: true })
```

### Unauthenticated Endpoint
```typescript
// No authentication required
export default (req, res) => apiWrapper(req, res, handler, { withAuth: false })
```

## 🛠️ Session Utilities

### Validate a Session
```typescript
import { validateSession } from 'lib/api/auth/session'

const session = await validateSession(token)
if (session) {
  console.log(`Authenticated: ${session.email}`)
}
```

### Get User's Active Sessions
```typescript
import { getUserSessions } from 'lib/api/auth/session'

const sessions = await getUserSessions(userId)
console.log(`User has ${sessions.length} active sessions`)
```

### Revoke Sessions
```typescript
import {
  revokeSession,           // Single session
  revokeOtherSessions,     // All except current
  revokeAllUserSessions    // All sessions
} from 'lib/api/auth/session'

// Revoke single session
await revokeSession(sessionId)

// Revoke all other sessions (keep current)
await revokeOtherSessions(userId, currentSessionId)

// Revoke all sessions (complete logout)
await revokeAllUserSessions(userId)
```

### Session Statistics
```typescript
import { getUserSessionStats } from 'lib/api/auth/session'

const stats = await getUserSessionStats(userId)
console.log({
  totalActive: stats.totalActive,
  devicesCount: stats.devicesCount,
  oldestSession: stats.oldestSession,
  newestSession: stats.newestSession
})
```

## 🧹 Session Cleanup

### Setup Cleanup Endpoint

**Environment Variable:**
```bash
INTERNAL_API_SECRET=your-secure-random-secret
```

**Generate Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Call Cleanup Endpoint
```bash
curl -X POST https://your-domain.com/api/auth/cleanup-sessions \
  -H "Authorization: Bearer ${INTERNAL_API_SECRET}"
```

### Setup Cron Job

**Railway:**
```yaml
crons:
  - name: cleanup-sessions
    schedule: "0 */6 * * *"  # Every 6 hours
    command: |
      curl -X POST $RAILWAY_PUBLIC_DOMAIN/api/auth/cleanup-sessions \
        -H "Authorization: Bearer $INTERNAL_API_SECRET"
```

**Vercel:**
```json
{
  "crons": [{
    "path": "/api/auth/cleanup-sessions",
    "schedule": "0 */6 * * *"
  }]
}
```

## 📊 Database Schema

### user_sessions Table
```sql
CREATE TABLE platform.user_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES platform.users(id),
    token TEXT NOT NULL UNIQUE,              -- SHA-256 hash
    refresh_token TEXT UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Important Indexes
```sql
CREATE INDEX idx_user_sessions_token ON platform.user_sessions(token, expires_at);
CREATE INDEX idx_user_sessions_expires ON platform.user_sessions(expires_at);
```

## 🔒 Security Features

✅ **Token Storage:** SHA-256 hashed (never plaintext)
✅ **Expiration:** 24-hour default token lifetime
✅ **Activity Tracking:** Automatic `last_activity_at` updates
✅ **Account Validation:** Checks for deleted/banned accounts
✅ **Cleanup:** Automatic expired session removal
✅ **Concurrent Sessions:** Multiple device support

## 🧪 Testing

### Run Tests
```bash
cd apps/studio
npm test lib/api/__tests__/session.test.ts
```

### Test Coverage
- ✅ Session validation
- ✅ Cleanup operations
- ✅ Session revocation
- ✅ Statistics calculation
- ✅ Error handling

## 📝 Type Definitions

### UserContext
```typescript
interface UserContext {
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
  username: string | null
  sessionId: string
}
```

### Session
```typescript
interface Session {
  id: string
  userId: string
  token: string
  expiresAt: string
  lastActivityAt: string
  ipAddress?: string
  userAgent?: string
  createdAt: string
}
```

## ⚙️ Environment Variables

### Required
```bash
DATABASE_URL=postgresql://...       # Platform database
PG_META_CRYPTO_KEY=...             # Encryption key
```

### Optional
```bash
INTERNAL_API_SECRET=...            # For cleanup endpoint
```

## 🚨 Error Codes

| Code | Meaning |
|------|---------|
| 401  | Invalid/expired session |
| 403  | Account banned |
| 500  | Database/server error |

## 📈 Performance

**Expected Response Times:**
- Session Validation: < 50ms
- Cleanup Operations: < 200ms
- Activity Update: < 10ms
- Session Query: < 30ms

## 🎯 Quick Commands

```bash
# Check TypeScript
npx tsc --noEmit

# Run ESLint
npx eslint lib/api/apiAuthenticate.ts

# Run tests
npm test lib/api/__tests__/session.test.ts

# Build
npm run build
```

## 📚 Full Documentation

See `/Users/quikolas/Documents/GitHub/supabase-master/apps/studio/TICKET-2-SESSION-MANAGEMENT-COMPLETE.md` for comprehensive documentation.

## ✅ Status

**TICKET-2: COMPLETE**
- All quality gates passed ✅
- Tests written ✅
- Documentation complete ✅
- Ready for production ✅

---

**Quick Support:** Check logs for `[apiAuthenticate]`, `[validateSession]`, or `[cleanup-sessions]` prefixes.
