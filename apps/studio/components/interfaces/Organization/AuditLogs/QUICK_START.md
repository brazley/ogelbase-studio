# AuditLogsViewer - Quick Start Guide

## Installation

The component is already integrated. Just import and use:

```tsx
import { AuditLogsViewer } from 'components/interfaces/Organization/AuditLogs'
```

## Basic Usage

### 1. Add to a Page

```tsx
// pages/organization/[slug]/audit.tsx
import { AuditLogsViewer } from 'components/interfaces/Organization/AuditLogs'

export default function AuditPage() {
  return <AuditLogsViewer />
}
```

That's it! The component handles everything else.

## What You Get Out of the Box

### Filters
- **Entity Type**: project, organization, user, addon, billing
- **Action**: create, update, delete, and more
- **Date Range**: With quick helpers (24h, 7d, 30d)
- **Search**: Real-time search across all fields

### Features
- **Pagination**: 50 logs per page
- **CSV Export**: Download filtered logs
- **Relative Time**: "2 hours ago" timestamps
- **Color-Coded**: Actions have semantic colors
- **IP Tracking**: See where actions originated
- **Change Diffs**: Before/after comparison

## API Requirements

### Endpoint
The component expects Rafael's audit API at:
```
GET /api/platform/audit/logs
```

### Response Format
```json
{
  "data": [
    {
      "id": "log-123",
      "user_id": "user-abc",
      "entity_type": "project",
      "entity_id": "proj-xyz",
      "action": "create",
      "changes": {
        "name": { "before": null, "after": "New Project" }
      },
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0",
      "created_at": "2025-11-21T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

## Customization

### Change Page Size

```tsx
// Edit line ~153 in AuditLogsViewer.tsx
const [pageSize] = useState(50)  // Change to 100, 25, etc.
```

### Modify Date Range Defaults

```tsx
// Edit lines ~150-152 in AuditLogsViewer.tsx
const [dateRange, setDateRange] = useState({
  from: currentTime.subtract(7, 'day').toISOString(),  // Change to 30, 1, etc.
  to: currentTime.toISOString(),
})
```

### Add Custom Filters

```tsx
// Edit lines ~154-159 to add your custom filter
const [filters, setFilters] = useState({
  entityType: 'all',
  action: 'all',
  userId: '',
  search: '',
  // Add your custom filter here
  myCustomFilter: '',
})
```

## Troubleshooting

### No logs showing
1. Check API is running: `curl http://localhost:3000/api/platform/audit/logs`
2. Check browser console for errors
3. Verify `DATABASE_URL` is set in `.env`
4. Check date range isn't too narrow

### Filters not working
1. Clear browser cache
2. Check API parameters in Network tab
3. Verify entity_type values match backend enum

### Pagination issues
1. Check `hasMore` in API response
2. Verify `offset` calculation
3. Check `total` count is correct

### CSV export empty
1. Check logs are loaded first
2. Verify filtered logs exist
3. Check browser console for errors

## Performance Tips

### For Large Log Sets
- Use entity type filters to narrow results
- Select shorter date ranges
- Consider server-side search instead of client-side

### For Slow Networks
- Increase stale time (line ~202): `staleTime: 60000`
- Enable query deduplication
- Consider infinite scroll instead of pagination

## Styling

The component uses Supabase design system tokens. To customize:

```tsx
// Override with Tailwind classes
<div className="my-custom-class">
  <AuditLogsViewer />
</div>
```

Or create a wrapper:
```tsx
// components/CustomAuditLogs.tsx
export function CustomAuditLogs() {
  return (
    <div className="p-8 bg-gray-50">
      <h1 className="text-2xl mb-4">My Audit Logs</h1>
      <AuditLogsViewer />
    </div>
  )
}
```

## Common Patterns

### Filter by Specific User

```tsx
// Pre-fill user filter
import { useState, useEffect } from 'react'

function UserAuditLogs({ userId }: { userId: string }) {
  return <AuditLogsViewer />
  // Note: You'll need to modify the component to accept props
  // or use URL parameters
}
```

### Auto-refresh Every 30 Seconds

```tsx
// Add to AuditLogsViewer
useEffect(() => {
  const interval = setInterval(() => {
    refetch()
  }, 30000)
  return () => clearInterval(interval)
}, [refetch])
```

### Filter by Date from URL

```tsx
// pages/audit.tsx
import { useRouter } from 'next/router'

function AuditPage() {
  const router = useRouter()
  const { start_date, end_date } = router.query

  // Pass to component via props or context
  return <AuditLogsViewer />
}
```

## Testing

### Run Tests
```bash
npm test AuditLogsViewer
```

### View in Storybook
```bash
npm run storybook
```
Navigate to: Organization → AuditLogsViewer

## API Examples

### Get Recent Logs
```bash
curl "http://localhost:3000/api/platform/audit/logs?limit=10"
```

### Filter by Entity
```bash
curl "http://localhost:3000/api/platform/audit/logs?entity_type=project&limit=50"
```

### Filter by Action
```bash
curl "http://localhost:3000/api/platform/audit/logs?action=create&limit=50"
```

### Filter by User
```bash
curl "http://localhost:3000/api/platform/audit/logs?user_id=user-123&limit=50"
```

### Date Range
```bash
curl "http://localhost:3000/api/platform/audit/logs?start_date=2025-11-01T00:00:00Z&end_date=2025-11-21T23:59:59Z"
```

### Pagination
```bash
# Page 1
curl "http://localhost:3000/api/platform/audit/logs?limit=50&offset=0"

# Page 2
curl "http://localhost:3000/api/platform/audit/logs?limit=50&offset=50"

# Page 3
curl "http://localhost:3000/api/platform/audit/logs?limit=50&offset=100"
```

## TypeScript

The component is fully typed. Import types:

```tsx
import type { AuditLogEntry } from 'lib/api/platform/audit'

function processLog(log: AuditLogEntry) {
  console.log(log.action, log.entity_type)
}
```

## Integration Checklist

Before going live:
- [ ] API endpoint deployed
- [ ] Database schema created
- [ ] Environment variables set
- [ ] Component imported in page
- [ ] Routing configured
- [ ] Authentication tested
- [ ] Permissions verified
- [ ] Performance tested
- [ ] Error handling confirmed
- [ ] CSV export works

## Support

### Documentation
- Full docs: `apps/studio/components/interfaces/Organization/AuditLogs/README.md`
- Implementation: `apps/studio/TICKET-19-IMPLEMENTATION.md`
- Tests: `apps/studio/components/interfaces/Organization/AuditLogs/AuditLogsViewer.test.tsx`

### Examples
- Storybook: `apps/studio/components/interfaces/Organization/AuditLogs/AuditLogsViewer.stories.tsx`
- API docs: `apps/studio/pages/api/platform/audit/logs.ts`

### Related Code
- Legacy component: `components/interfaces/Organization/AuditLogs/AuditLogs.tsx`
- API helpers: `lib/api/platform/audit.ts`
- Date picker: `components/interfaces/Settings/Logs/Logs.DatePickers`

---

**Need help?** Check the full documentation or contact the platform team.
