# Marcus - Organization Switcher Component Implementation

## Context
You're building the organization switcher UI for Sprint 1, Workstream 2. Backend is complete - we have the auth types, API endpoints, and database layer ready.

## What's Already Done ✅

### Backend (Dylan)
- **Auth Types** (`/apps/studio/lib/api/auth/types.ts`):
  - `AuthenticatedUser` interface with `activeOrgId` and `organizations[]`
  - `UserOrganization` interface with org details and role

- **API Endpoints**:
  - `GET /api/auth/validate` - Returns user with organizations array
  - `POST /api/auth/set-active-org` - Persists org choice to DB

- **Database**:
  - Migration 008 adds `active_org_id` to `platform.users`
  - Helper functions for safe org switching with membership validation

## Your Mission 🎯

Build the React components and state management for organization switching.

### 1. OrganizationSwitcher Component
**File**: `/apps/studio/components/interfaces/Organization/OrganizationSwitcher.tsx`

```typescript
// Requirements:
- Dropdown showing all user's organizations
- Display org slug + role badge
- Show "Switching..." loading state
- Call POST /api/auth/set-active-org on selection
- Update local auth context optimistically
- Navigate to /org/[slug] after switch
- Handle errors gracefully with toast

// Design:
- Use existing Supabase UI components for consistency
- Show active org with visual indicator
- Disable dropdown while switching
- Keep it compact for header placement
```

### 2. Enhanced AuthContext
**File**: `/apps/studio/lib/auth.tsx`

Current state: Uses `AuthProviderInternal` from 'common' package.

Your task:
```typescript
// Extend the existing AuthContext to add:
interface AuthContextType {
  user: AuthenticatedUser | null
  setActiveOrganization: (orgId: string) => Promise<void>
  refreshUser: () => Promise<void>
  loading: boolean
}

// Implementation notes:
- Wrap the existing AuthProviderInternal
- Add state for user's organizations and activeOrgId
- Load user data from /api/auth/validate on mount
- Provide setActiveOrganization that:
  1. Updates local state optimistically
  2. Calls /api/auth/set-active-org
  3. Handles errors by reverting optimistic update
```

### 3. Integration Points

Add OrganizationSwitcher to:

**A. AppLayout Header** (`/apps/studio/components/layouts/AppLayout/AppLayout.tsx`)
- Top-right area of navigation
- Always visible when user has orgs
- Compact display

**B. Organization Settings** (existing org pages)
- Contextual placement
- Full-width display variant

**C. Project List Page** (if it exists)
- Quick access for switching context

### 4. URL Sync (Optional Enhancement)

Create page: `/apps/studio/pages/org/[slug]/index.tsx`

```typescript
// Sync URL param with active org:
- On mount, if URL slug != activeOrgId, switch org
- Navigate to /org/[slug] after org switch
- Handle invalid slugs gracefully
```

### 5. Unit Tests
**File**: `/apps/studio/tests/components/OrganizationSwitcher.test.tsx`

```typescript
// Test coverage:
- Renders org list correctly
- Shows active org indicator
- Calls setActiveOrganization on change
- Shows loading state while switching
- Handles errors appropriately
- Works with 0, 1, and 10+ orgs
```

## API Contract Reference

### GET /api/auth/validate Response:
```typescript
{
  user: {
    id: string
    email: string
    first_name: string
    last_name: string
    username?: string | null
    activeOrgId?: string | null
    organizations?: [
      {
        organization_id: string
        organization_slug: string
        organization_name: string
        role: 'owner' | 'admin' | 'developer' | 'billing_admin' | 'member'
        joined_at: string
      }
    ]
  }
  expires_at: string
}
```

### POST /api/auth/set-active-org:
```typescript
// Request:
{
  organizationId: string
}

// Response:
{
  success: boolean
  activeOrgId: string
}

// Errors:
- 401: Invalid token
- 403: Not a member of org
- 400: Missing org ID
- 500: Internal error
```

## Success Criteria ✅

- [ ] OrganizationSwitcher component built
- [ ] AuthContext provides org state and setActiveOrganization
- [ ] Integrated in 3+ locations
- [ ] URL sync works (optional)
- [ ] Unit tests passing (>80% coverage)
- [ ] No TypeScript errors
- [ ] Uses existing UI component library
- [ ] Handles edge cases (0 orgs, switching errors)

## Coordination

**Depends on**: Backend complete (Dylan ✅)
**Blocks**: Jordan's middleware (WS2-T2) - needs frontend to test
**Test with**: Sofia (WS2-T5) for E2E flows
**Review with**: Kaia (WS2-T3) for state patterns

## Timeline

- Day 1: Component + AuthContext
- Day 2: Integration + testing
- Day 3: Polish + edge cases

## Notes

- The existing auth setup uses `AuthProviderInternal` from 'common' - wrap, don't replace
- Users might have 0 orgs (new accounts) - handle gracefully
- The backend validates org membership before switching - trust the API
- Use optimistic updates for snappy UX
- Keep the component small and focused

**Let's ship this!** 🚀

Dylan
