# Mock Authentication - Quick Reference

## TL;DR
Enable platform UI without real authentication by setting `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true` in `.env.local`.

## Quick Start

### 1. Enable Mock Auth
```bash
# In apps/studio/.env.local
NEXT_PUBLIC_IS_PLATFORM=true
NEXT_PUBLIC_ENABLE_MOCK_AUTH=true
```

### 2. Restart Server
```bash
pnpm --filter studio dev
```

### 3. Verify
```bash
cd apps/studio
node test-mock-auth.js
```

## Mock User Details
- **Email**: admin@ogelbase.com
- **ID**: mock-user-id
- **Access Token**: mock-access-token
- **Role**: authenticated

## When to Use

✅ **Use mock auth for:**
- Local development of platform features
- Self-hosted deployments without auth
- Testing UI without backend
- Demo environments

❌ **Don't use mock auth for:**
- Production deployments
- Any environment with real user data
- Security testing
- Multi-user scenarios

## Toggle On/Off

### Enable Mock Auth
```bash
NEXT_PUBLIC_ENABLE_MOCK_AUTH=true
```

### Disable Mock Auth (use real auth)
```bash
NEXT_PUBLIC_ENABLE_MOCK_AUTH=false
# or remove the variable entirely
```

## Files Involved

| File | Purpose | Changes Required |
|------|---------|------------------|
| `apps/studio/.env.local` | Configuration | Add `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true` |
| `apps/studio/lib/auth.tsx` | Auth logic | ✅ Already implemented |
| `packages/common/auth.tsx` | Mock session | ✅ Already implemented |

## Testing

### Quick Check
1. Start dev server
2. Open http://localhost:3000
3. Should see:
   - No login redirect
   - User email: admin@ogelbase.com
   - Platform UI visible

### Detailed Check
```bash
# Run verification script
cd apps/studio
node test-mock-auth.js
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Still shows login page | Verify env vars set, restart server |
| API requests fail | Check Network tab for auth headers |
| Changes not working | Clear browser cache, restart server |
| Environment vars not loading | Ensure file is `.env.local` not `.env` |

## Security Warning

⚠️ **NEVER** enable mock auth in production:
- Real users would bypass authentication
- Security vulnerability
- Data exposure risk

Always verify production environment has:
```bash
NEXT_PUBLIC_ENABLE_MOCK_AUTH=false  # or omitted
```

## Support

- Full implementation details: `apps/studio/MOCK_AUTH_IMPLEMENTATION.md`
- Test script: `apps/studio/test-mock-auth.js`
- Auth code: `apps/studio/lib/auth.tsx`
- Common auth: `packages/common/auth.tsx`
