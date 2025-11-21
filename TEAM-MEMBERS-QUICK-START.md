# Team Members UI - Quick Start Guide

## 🚀 5-Minute Integration

### Step 1: Import the Component
```tsx
import { TeamSettingsNew } from 'components/interfaces/Organization/TeamSettings/TeamSettingsNew'

// In your route
export default function TeamPage() {
  return <TeamSettingsNew />
}
```

Done! Everything works out of the box.

---

## 🎯 Component Usage

### Basic Invite Dialog
```tsx
import { InviteUserDialog } from './InviteUserDialog'

<InviteUserDialog canInvite={true} />
```

### Custom Trigger
```tsx
<InviteUserDialog
  canInvite={userCanInvite}
  trigger={<Button>Add Member</Button>}
/>
```

### Members List
```tsx
import { TeamMembersList } from './TeamMembersList'

<TeamMembersList />
```

---

## 🔌 Data Hooks

### Fetch Members
```tsx
import { usePlatformMembersQuery } from 'data/platform-members'

const { data: members, isLoading } = usePlatformMembersQuery({
  slug: 'my-org'
})
```

### Invite Member
```tsx
import { useInvitePlatformMemberMutation } from 'data/platform-members'

const { mutate: invite } = useInvitePlatformMemberMutation()

invite({
  slug: 'my-org',
  email: 'user@example.com',
  role: 'developer'
})
```

### Update Role
```tsx
import { useUpdatePlatformMemberMutation } from 'data/platform-members'

const { mutate: updateRole } = useUpdatePlatformMemberMutation()

updateRole({
  slug: 'my-org',
  member_id: 'member-123',
  role: 'admin'
})
```

### Remove Member
```tsx
import { useRemovePlatformMemberMutation } from 'data/platform-members'

const { mutate: remove } = useRemovePlatformMemberMutation()

remove({
  slug: 'my-org',
  member_id: 'member-123'
})
```

---

## 🎨 Role System

### Available Roles
```typescript
type Role = 'owner' | 'admin' | 'developer' | 'read_only'
```

### Role Colors
```tsx
// Owner - Amber
<Badge variant="outline" className="text-amber-600">Owner</Badge>

// Admin - Blue
<Badge variant="outline" className="text-blue-600">Admin</Badge>

// Developer - Green
<Badge variant="outline" className="text-green-600">Developer</Badge>

// Read Only - Gray
<Badge variant="outline" className="text-gray-600">Read Only</Badge>
```

---

## 🔐 Permission Checks

### Check User Role
```tsx
import { usePlatformMembersQuery } from 'data/platform-members'
import { useProfile } from 'lib/profile'

const { profile } = useProfile()
const { data: members } = usePlatformMembersQuery({ slug })

const currentUser = members?.find(m => m.user_id === profile?.id)
const canInvite = ['owner', 'admin'].includes(currentUser?.role)
```

### Permission Matrix
```typescript
const permissions = {
  owner: {
    view: true,
    invite: true,
    editRoles: true,
    remove: true,
    manageOwners: true
  },
  admin: {
    view: true,
    invite: true,
    editRoles: true,
    remove: true,
    manageOwners: false
  },
  developer: {
    view: true,
    invite: false,
    editRoles: false,
    remove: false,
    manageOwners: false
  },
  read_only: {
    view: true,
    invite: false,
    editRoles: false,
    remove: false,
    manageOwners: false
  }
}
```

---

## 🎯 Common Patterns

### Loading State
```tsx
const { data, isLoading } = usePlatformMembersQuery({ slug })

if (isLoading) return <GenericSkeletonLoader />
```

### Error State
```tsx
const { error, isError } = usePlatformMembersQuery({ slug })

if (isError) return <AlertError error={error} />
```

### Empty State
```tsx
if (!members || members.length === 0) {
  return <EmptyState message="No members yet" />
}
```

---

## 🧪 Testing

### Test Component
```tsx
import { render, screen } from '@testing-library/react'
import { InviteUserDialog } from './InviteUserDialog'

test('renders invite button', () => {
  render(<InviteUserDialog canInvite={true} />)
  expect(screen.getByText('Invite member')).toBeInTheDocument()
})
```

### Test with User Event
```tsx
import userEvent from '@testing-library/user-event'

test('opens dialog on click', async () => {
  const user = userEvent.setup()
  render(<InviteUserDialog canInvite={true} />)

  await user.click(screen.getByText('Invite member'))

  expect(screen.getByText('Invite a member')).toBeInTheDocument()
})
```

---

## 🎨 Customization

### Custom Role Badge
```tsx
import { Badge } from 'ui'
import { Shield } from 'lucide-react'

<Badge variant="outline" className="gap-1.5">
  <Shield size={12} />
  Custom Role
</Badge>
```

### Custom Empty State
```tsx
{!members?.length && (
  <div className="text-center py-12">
    <p className="text-foreground-light">Your custom message</p>
  </div>
)}
```

---

## 📊 TypeScript Types

### Member Type
```typescript
interface PlatformMember {
  id: string
  user_id: string
  organization_id: string
  role: 'owner' | 'admin' | 'developer' | 'read_only'
  invited_at: string
  accepted_at: string | null
  email: string
  first_name: string | null
  last_name: string | null
  username: string | null
}
```

### Query Variables
```typescript
type PlatformMembersVariables = {
  slug?: string
}

type InvitePlatformMemberVariables = {
  slug: string
  email: string
  role: 'owner' | 'admin' | 'developer' | 'read_only'
}
```

---

## 🚨 Error Handling

### Handle Mutation Errors
```tsx
const { mutate: invite } = useInvitePlatformMemberMutation({
  onError: (error) => {
    if (error.message.includes('already a member')) {
      toast.error('This user is already in the organization')
    } else {
      toast.error('Failed to invite member')
    }
  }
})
```

### Handle Query Errors
```tsx
const { error } = usePlatformMembersQuery({ slug })

if (error) {
  console.error('Failed to load members:', error)
  // Show error UI
}
```

---

## 🎯 API Endpoints

### List Members
```
GET /api/platform/organizations/{slug}/members
Response: PlatformMember[]
```

### Invite Member
```
POST /api/platform/organizations/{slug}/members
Body: { email: string, role: Role }
Response: PlatformMember
```

### Update Role
```
PUT /api/platform/organizations/{slug}/members
Body: { member_id: string, role: Role }
Response: { success: boolean, role: Role }
```

### Remove Member
```
DELETE /api/platform/organizations/{slug}/members
Body: { member_id: string }
Response: { success: boolean }
```

---

## 🔧 Troubleshooting

### Issue: Members not loading
**Check:**
1. Organization slug is correct
2. User is authenticated
3. User has permission to view members

### Issue: Cannot invite members
**Check:**
1. `canInvite` prop is true
2. User role is owner or admin
3. Email format is valid

### Issue: Role update failing
**Check:**
1. User has permission (owner for owner roles)
2. Not trying to update own role
3. Member ID is valid

---

## 💡 Pro Tips

### Tip 1: Cache Management
```tsx
// Manually invalidate cache after external changes
const queryClient = useQueryClient()
queryClient.invalidateQueries({
  queryKey: platformMemberKeys.list(slug)
})
```

### Tip 2: Optimistic Updates
```tsx
const { mutate } = useUpdatePlatformMemberMutation({
  onMutate: async (variables) => {
    // Optimistically update UI before API call
    await queryClient.cancelQueries({
      queryKey: platformMemberKeys.list(variables.slug)
    })

    const previousMembers = queryClient.getQueryData(
      platformMemberKeys.list(variables.slug)
    )

    queryClient.setQueryData(
      platformMemberKeys.list(variables.slug),
      (old: any) => {
        // Update the member in the list
      }
    )

    return { previousMembers }
  }
})
```

### Tip 3: Debounced Search
```tsx
import { useDebouncedValue } from 'hooks/useDebouncedValue'

const [search, setSearch] = useState('')
const debouncedSearch = useDebouncedValue(search, 300)

const filteredMembers = members?.filter(m =>
  m.email.includes(debouncedSearch)
)
```

---

## 📚 Resources

- **Full Documentation**: `/README.md` in component directory
- **API Reference**: `/TICKET-16-17-IMPLEMENTATION.md`
- **Architecture**: `/TEAM-MEMBERS-ARCHITECTURE.md`
- **Storybook**: Run `npm run storybook`
- **Tests**: Run `npm test TeamSettings`

---

## ✅ Checklist for Integration

- [ ] Import components
- [ ] Verify organization slug is available
- [ ] Check user authentication
- [ ] Test permission checks
- [ ] Verify API endpoints are working
- [ ] Run tests
- [ ] Check Storybook stories
- [ ] Test on mobile/tablet/desktop

---

**Need help?** Check the comprehensive README or Storybook documentation!

Built by Luna Rodriguez - Production ready, fully tested, accessible.
