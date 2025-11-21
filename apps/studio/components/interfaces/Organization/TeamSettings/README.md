# Team Members UI Components

Modern, accessible, and beautiful team management components for OgelBase organizations.

## 📦 Components

### InviteUserDialog

A fully-featured dialog for inviting new members to your organization.

**Features:**
- Email validation with inline error messages
- Role selection with descriptions
- Duplicate member detection
- Loading states and error handling
- Fully accessible (WCAG AA compliant)
- Keyboard navigation support

**Usage:**
```tsx
import { InviteUserDialog } from './InviteUserDialog'

// Default usage
<InviteUserDialog canInvite={true} />

// Custom trigger
<InviteUserDialog
  canInvite={true}
  trigger={<Button>Add Member</Button>}
/>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `trigger` | `React.ReactNode` | Default button | Custom trigger element |
| `canInvite` | `boolean` | `true` | Whether user can invite members |

---

### TeamMembersList

A comprehensive table displaying all organization members with management capabilities.

**Features:**
- Beautiful role badges with colors and icons
- Inline role editing
- Member removal with confirmation
- Current user highlighting
- Permission-aware actions
- Empty and loading states
- Responsive design

**Usage:**
```tsx
import { TeamMembersList } from './TeamMembersList'

<TeamMembersList />
```

**Role Badge Colors:**
- 🟡 **Owner** - Amber with alert shield icon
- 🔵 **Admin** - Blue with check shield icon
- 🟢 **Developer** - Green with shield icon
- ⚪ **Read Only** - Gray with user icon

---

## 🎨 Design System Compliance

All components use the approved design system:

### UI Components Used
- ✅ `Dialog_Shadcn_` - Modal dialogs
- ✅ `Input_Shadcn_` - Text inputs
- ✅ `Select_Shadcn_` - Dropdowns
- ✅ `Button` - Action buttons
- ✅ `Table_Shadcn_` - Data tables
- ✅ `Badge` - Role indicators
- ✅ `DropdownMenu_Shadcn_` - Context menus
- ✅ `AlertDialog_Shadcn_` - Confirmations
- ✅ `Form_Shadcn_` - Form handling

### Validation
- React Hook Form + Zod for type-safe validation
- Email format validation
- Duplicate detection
- Permission checks

---

## 🔌 API Integration

### Data Hooks

Located in `/apps/studio/data/platform-members/`:

#### `usePlatformMembersQuery`
Fetches all members for an organization.

```tsx
const { data: members, isLoading, error } = usePlatformMembersQuery({
  slug: 'my-org'
})
```

#### `useInvitePlatformMemberMutation`
Invites a new member to the organization.

```tsx
const { mutate: inviteMember, isLoading } = useInvitePlatformMemberMutation()

inviteMember({
  slug: 'my-org',
  email: 'user@example.com',
  role: 'developer'
})
```

#### `useUpdatePlatformMemberMutation`
Updates a member's role.

```tsx
const { mutate: updateRole } = useUpdatePlatformMemberMutation()

updateRole({
  slug: 'my-org',
  member_id: 'member-123',
  role: 'admin'
})
```

#### `useRemovePlatformMemberMutation`
Removes a member from the organization.

```tsx
const { mutate: removeMember } = useRemovePlatformMemberMutation()

removeMember({
  slug: 'my-org',
  member_id: 'member-123'
})
```

---

## 🔐 Permissions

### Role Hierarchy

```
Owner > Admin > Developer > Read Only
```

### Permission Rules

| Action | Owner | Admin | Developer | Read Only |
|--------|-------|-------|-----------|-----------|
| View members | ✅ | ✅ | ✅ | ✅ |
| Invite members | ✅ | ✅ | ❌ | ❌ |
| Edit non-owner roles | ✅ | ✅ | ❌ | ❌ |
| Edit owner roles | ✅ | ❌ | ❌ | ❌ |
| Remove non-owners | ✅ | ✅ | ❌ | ❌ |
| Remove owners | ✅ | ❌ | ❌ | ❌ |

### Security Considerations
- Users cannot modify their own role
- Users cannot remove themselves (must use leave endpoint)
- Permission checks happen on both frontend and backend
- All mutations invalidate the member list cache

---

## ♿ Accessibility

### Keyboard Navigation
- `Tab` - Navigate between form fields and buttons
- `Enter` - Submit forms, open dialogs
- `Escape` - Close dialogs
- `Arrow keys` - Navigate dropdowns

### Screen Reader Support
- Semantic HTML structure
- ARIA labels on interactive elements
- Form validation announcements
- Status messages via toast notifications

### Focus Management
- Auto-focus on email input when dialog opens
- Focus trap within modals
- Visible focus indicators
- Logical tab order

---

## 🧪 Testing

### Unit Tests

Located in `__tests__/`:

```bash
# Run all tests
npm test TeamSettings

# Run specific test
npm test InviteUserDialog.test.tsx
```

**Test Coverage:**
- ✅ Component rendering
- ✅ Form validation
- ✅ Role selection
- ✅ Permission checks
- ✅ Empty states
- ✅ Loading states
- ✅ Error handling
- ✅ User interactions

### Storybook

```bash
# Launch Storybook
npm run storybook
```

**Stories Available:**
- `InviteUserDialog` - All states and variants
- `TeamMembersList` - Various data scenarios
- Interactive examples with controls

---

## 🎯 Implementation Checklist

- [x] InviteUserDialog component
- [x] TeamMembersList component
- [x] Data hooks for API integration
- [x] Form validation (email, role)
- [x] Permission enforcement
- [x] Role badges with colors
- [x] Edit role functionality
- [x] Remove member functionality
- [x] Loading states
- [x] Empty states
- [x] Error handling
- [x] Accessibility (WCAG AA)
- [x] Unit tests
- [x] Storybook stories
- [x] TypeScript types
- [x] Documentation

---

## 🚀 Integration Example

```tsx
import { TeamSettingsNew } from './TeamSettingsNew'

// In your route/page component
export default function OrganizationTeamPage() {
  return <TeamSettingsNew />
}
```

This provides a complete, production-ready team management interface.

---

## 📝 API Endpoints

### Backend Routes

All endpoints are in `/apps/studio/pages/api/platform/organizations/[slug]/members.ts`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/platform/organizations/{slug}/members` | List all members |
| POST | `/api/platform/organizations/{slug}/members` | Invite a member |
| PUT | `/api/platform/organizations/{slug}/members` | Update member role |
| DELETE | `/api/platform/organizations/{slug}/members` | Remove a member |

---

## 🔄 State Management

- React Query for server state
- Automatic cache invalidation on mutations
- Optimistic updates for better UX
- Toast notifications for user feedback

---

## 🎨 Styling

All styling uses Tailwind CSS utility classes following the design system:

- Consistent spacing (design tokens)
- Accessible color contrasts
- Responsive breakpoints
- Dark mode ready
- Smooth transitions

---

## 🐛 Common Issues

### Issue: "User is already a member"
**Solution:** Check for duplicate emails before sending invitation.

### Issue: Actions not showing
**Solution:** Verify user has admin or owner role.

### Issue: Role dropdown disabled
**Solution:** Only owners can change owner roles.

---

## 📚 Related Documentation

- [API Design](../../../../../../API-V2-QUICK-REFERENCE.md)
- [Design System](../../../../../../packages/ui/README.md)
- [Authentication](../../../../../../AUTH_FLOW_ANALYSIS.md)

---

**Built with ❤️ by Luna Rodriguez**
*Design system compliant • Accessible • Production ready*
