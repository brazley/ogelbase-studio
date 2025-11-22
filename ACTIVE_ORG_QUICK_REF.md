# Active Organization Tracking - Quick Reference

## 🎯 What We Built

A complete system for tracking which organization context each user is working in.

## 📁 Key Files

### Backend
- **Types**: `/apps/studio/lib/api/auth/types.ts` - `AuthenticatedUser`, `UserOrganization`
- **Migration**: `/apps/studio/database/migrations/008_add_active_org_tracking.sql`
- **Validate API**: `/apps/studio/pages/api/auth/validate.ts` - Returns user + orgs
- **Set Org API**: `/apps/studio/pages/api/auth/set-active-org.ts` - Persists choice

### Frontend (In Progress - Marcus)
- **Component**: `/apps/studio/components/interfaces/Organization/OrganizationSwitcher.tsx`
- **Context**: `/apps/studio/lib/auth.tsx` - Enhanced with org state
- **Tests**: `/apps/studio/tests/components/OrganizationSwitcher.test.tsx`

## 🔌 API Usage

### Get User with Organizations
```typescript
GET /api/auth/validate
Authorization: Bearer <token>

Response:
{
  user: {
    id: "uuid",
    email: "user@example.com",
    activeOrgId: "org-uuid",
    organizations: [
      {
        organization_id: "org-uuid",
        organization_slug: "acme",
        organization_name: "Acme Corp",
        role: "owner",
        joined_at: "2025-01-01T00:00:00Z"
      }
    ]
  }
}
```

### Set Active Organization
```typescript
POST /api/auth/set-active-org
Authorization: Bearer <token>
Content-Type: application/json

{
  "organizationId": "org-uuid"
}

Response:
{
  "success": true,
  "activeOrgId": "org-uuid"
}
```

## 🗄️ Database

### Schema
```sql
-- New column on platform.users
active_org_id UUID REFERENCES platform.organizations(id)

-- Helper function
SELECT platform.set_user_active_org(
  p_user_id := 'user-uuid',
  p_org_id := 'org-uuid'
);
```

### Query Pattern
```sql
-- Get user's active org
SELECT
  u.active_org_id,
  o.slug as org_slug,
  o.name as org_name,
  om.role
FROM platform.users u
JOIN platform.organizations o ON u.active_org_id = o.id
JOIN platform.organization_members om
  ON om.organization_id = o.id
  AND om.user_id = u.id
WHERE u.id = $1;
```

## 🔄 Workflow

1. **User loads app** → `/api/auth/validate` returns orgs + activeOrgId
2. **User switches org** → Component calls `/api/auth/set-active-org`
3. **Backend validates** → Checks org membership
4. **Database updates** → Sets `active_org_id`
5. **Frontend updates** → AuthContext refreshes
6. **Navigation** → App routes to `/org/[slug]`

## 🎨 Component Usage (When Complete)

```tsx
import { OrganizationSwitcher } from '@/components/interfaces/Organization/OrganizationSwitcher'
import { useAuth } from '@/lib/auth'

function MyPage() {
  const { user } = useAuth()

  return (
    <div>
      <OrganizationSwitcher className="my-4" />

      {user?.activeOrgId && (
        <p>Active org: {user.organizations?.find(
          o => o.organization_id === user.activeOrgId
        )?.organization_slug}</p>
      )}
    </div>
  )
}
```

## 🧪 Testing

### Unit Test Pattern
```typescript
it('switches organization', async () => {
  const { getByRole } = render(<OrganizationSwitcher />)

  const select = getByRole('combobox')
  fireEvent.change(select, { target: { value: 'new-org-id' } })

  await waitFor(() => {
    expect(mockSetActiveOrg).toHaveBeenCalledWith('new-org-id')
  })
})
```

### E2E Test Pattern
```typescript
test('user can switch organizations', async ({ page }) => {
  await page.goto('/org/acme')
  await page.click('[data-testid="org-switcher"]')
  await page.click('text=Contoso Corp')
  await expect(page).toHaveURL('/org/contoso')
})
```

## ⚠️ Edge Cases

### No Organizations
```typescript
// User has no orgs yet
user.organizations = []
user.activeOrgId = null

// Component should:
// - Not render switcher
// - Show "Create organization" prompt
```

### Invalid Active Org
```typescript
// User's activeOrgId points to org they're no longer member of
// Backend should:
// - Clear invalid activeOrgId
// - Set to first available org
// - Or leave null if no orgs
```

### Concurrent Switches
```typescript
// User rapidly switches orgs
// Component should:
// - Disable switcher while switching
// - Queue or debounce rapid switches
// - Show loading state
```

## 🔐 Security

- Backend validates org membership before allowing switch
- RLS policies use `current_setting('app.active_org_id')` for context
- Session middleware sets org context for each request
- No client-side-only org switching

## 📊 Metrics to Track

- Org switch frequency (detect users context-switching often)
- Failed org switches (detect permission issues)
- Users with multiple orgs (feature usage)
- Time to first org switch (onboarding metric)

## 🚀 Deployment Checklist

- [ ] Run migration 008 on database
- [ ] Verify backfill completed for existing users
- [ ] Deploy API endpoints
- [ ] Deploy frontend components
- [ ] Test org switching in staging
- [ ] Monitor error logs for failed switches
- [ ] Update user documentation

---

**Quick Links**:
- Full Status: `/WS2-T1-STATUS.md`
- Marcus Handoff: `/MARCUS_HANDOFF_WS2T1.md`
- Migration File: `/apps/studio/database/migrations/008_add_active_org_tracking.sql`
