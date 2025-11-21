# Audit Logs Components

This directory contains two audit log viewers for different purposes:

## Components

### `AuditLogs.tsx` (Legacy)
- Uses Supabase's organization audit logs API (`/platform/organizations/{slug}/audit`)
- Shows organization-level audit events from Supabase's native audit system
- Includes role-based access control and team plan requirements
- Features detailed log inspection panel

**Use this for:** Organization-level Supabase events (member changes, project operations, etc.)

### `AuditLogsViewer.tsx` (Platform Mode - New)
- Uses Rafael's unified platform audit API (`/api/platform/audit/logs`)
- Shows all platform entity audit logs (projects, organizations, users, addons, billing)
- Supports comprehensive filtering by entity type, action, user, and date range
- Includes CSV export functionality
- Features pagination for large log sets (50 per page)
- Color-coded action badges (create=green, update=blue, delete=red)

**Use this for:** Platform mode installations, comprehensive audit trails across all entities

## API Comparison

| Feature | AuditLogs (Legacy) | AuditLogsViewer (Platform) |
|---------|-------------------|---------------------------|
| Endpoint | `/platform/organizations/{slug}/audit` | `/api/platform/audit/logs` |
| Scope | Organization only | All platform entities |
| Filtering | Users, Projects, Date | Entity Type, Action, User, Date |
| Pagination | ❌ | ✅ (50 per page) |
| Export | ❌ | ✅ (CSV) |
| Changes Diff | Side panel | Inline with arrows |
| Access Control | Team/Enterprise plan | Platform mode |

## Usage Examples

### Legacy Organization Audit Logs
```tsx
import { AuditLogs } from 'components/interfaces/Organization/AuditLogs'

// In your organization settings page
<AuditLogs />
```

### Platform Audit Logs Viewer
```tsx
import { AuditLogsViewer } from 'components/interfaces/Organization/AuditLogs'

// In your platform admin page
<AuditLogsViewer />
```

## Data Structures

### Legacy Format (Supabase Native)
```typescript
{
  action: {
    name: string
    metadata: { status?: number }[]
  }
  actor: {
    id: string
    type: 'user'
    metadata: { email?: string }[]
  }
  target: {
    description: string
    metadata: { org_slug?: string, project_ref?: string }
  }
  occurred_at: string
}
```

### Platform Format (Rafael's API)
```typescript
{
  id: string
  user_id: string
  entity_type: 'project' | 'organization' | 'user' | 'addon' | 'billing'
  entity_id: string
  action: string
  changes: Record<string, { before: unknown, after: unknown }> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}
```

## Styling & Design System

Both components use the Supabase design system:
- **Tables**: `components/to-be-cleaned/Table`
- **Badges**: `Badge` from `ui` (with variants: brand, default, destructive, warning)
- **Buttons**: `Button` from `ui`
- **Selects**: `Select_Shadcn_` components
- **Date Pickers**: `LogsDatePicker` from `components/interfaces/Settings/Logs`

### Action Badge Colors
The `AuditLogsViewer` uses semantic colors:
- 🟢 **Create/Add** - `brand` variant (green)
- 🔵 **Update/Change** - `default` variant (blue)
- 🔴 **Delete/Remove** - `destructive` variant (red)
- 🟡 **Other** - `warning` variant (yellow)

## Features Comparison

### AuditLogsViewer Exclusive Features
1. **CSV Export** - Download audit logs for external analysis
2. **Pagination** - Handle large log sets efficiently (50 per page)
3. **Entity Type Filtering** - Filter by project, org, user, addon, billing
4. **Action Filtering** - Granular action-level filtering
5. **Search** - Local client-side search across all fields
6. **Relative Timestamps** - "2 hours ago" format
7. **IP Address Display** - See where actions originated
8. **Changes Diff** - Inline before/after comparison with arrows

### AuditLogs Exclusive Features
1. **User Avatars** - GitHub profile images for team members
2. **Role Display** - Shows user roles alongside actions
3. **Plan-based Access** - Respects Team/Enterprise plan requirements
4. **Auto-refresh** - 5-minute automatic refresh for live monitoring
5. **Details Panel** - Side panel with full metadata inspection

## Testing

Both components have comprehensive test coverage:
- `AuditLogs.test.tsx` - Tests for legacy component
- `AuditLogsViewer.test.tsx` - Tests for platform component

Run tests:
```bash
npm test AuditLogs
```

## Migration Guide

If migrating from `AuditLogs` to `AuditLogsViewer`:

1. **API Change**: Update backend to use Rafael's audit logging system
2. **Data Migration**: Transform existing logs to new format
3. **Component Swap**: Replace `<AuditLogs />` with `<AuditLogsViewer />`
4. **Access Control**: Update permissions to check platform mode instead of plan tier

Example transformation:
```typescript
// Old format
const oldLog = {
  action: { name: 'member.add' },
  actor: { id: 'user-123' },
  target: { description: 'Organization', metadata: { org_slug: 'my-org' } },
  occurred_at: '2025-11-21T10:00:00Z'
}

// New format
const newLog = {
  id: 'log-456',
  user_id: 'user-123',
  entity_type: 'organization',
  entity_id: 'my-org',
  action: 'member.add',
  changes: { email: 'newuser@example.com' },
  ip_address: '192.168.1.1',
  user_agent: 'Mozilla/5.0',
  created_at: '2025-11-21T10:00:00Z'
}
```

## Performance Considerations

- **AuditLogsViewer** uses pagination to handle large datasets efficiently
- Local search filtering happens client-side after data is fetched
- Query caching with 30-second stale time reduces unnecessary API calls
- CSV export is client-side to avoid server overhead

## Accessibility

Both components follow accessibility best practices:
- Semantic HTML table structure
- ARIA labels on interactive elements
- Keyboard navigation support
- Color contrast meeting WCAG AA standards
- Screen reader friendly content

## Future Enhancements

Potential improvements:
- Real-time log streaming with WebSocket
- Advanced query builder for complex filters
- Log retention policy indicators
- Batch actions (bulk export, delete)
- Custom column visibility toggle
- Saved filter presets
