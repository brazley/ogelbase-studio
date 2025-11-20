# Platform Mode Configuration Guide

## Overview
This guide explains how to enable and use the full platform UI features in your self-hosted Supabase Studio with platform database integration.

## What Changed

### 1. Environment Configuration
**File**: `/apps/studio/.env.production`

```bash
# Platform mode enabled - allows organization/project management UI
NEXT_PUBLIC_IS_PLATFORM=true

# Platform API URL (points to our platform database API routes)
NEXT_PUBLIC_API_URL=https://ogelbase-studio.vercel.app/api
```

**Why**: Setting `IS_PLATFORM=true` unlocks:
- Organization dropdown in header
- Full project settings menu (compute, infrastructure, etc.)
- Project creation UI
- Organization management pages
- Project switcher in command menu

### 2. AccountLayout Redirect Removed
**File**: `/apps/studio/components/layouts/AccountLayout/AccountLayout.tsx`

**Change**: Commented out the redirect that was blocking account pages when `!IS_PLATFORM`

```typescript
// Note: Removed redirect when !IS_PLATFORM to allow account pages in self-hosted mode
// useEffect(() => {
//   if (!IS_PLATFORM) {
//     router.push('/project/default')
//   }
// }, [router])
```

**Why**: This redirect was preventing access to `/account/*` routes in self-hosted mode.

### 3. Organizations API Updated
**File**: `/apps/studio/pages/api/platform/organizations/index.ts`

**Change**: Updated to query the platform database instead of returning hardcoded data

```typescript
const handleGetAll = async (req: NextApiRequest, res: NextApiResponse) => {
  // Query all organizations from platform database
  const { data, error } = await queryPlatformDatabase<PlatformOrganization>({
    query: 'SELECT * FROM platform.organizations ORDER BY name',
    parameters: [],
  })

  return res.status(200).json(data || [])
}
```

**Why**: The UI needs real organization data from your platform database.

## Platform Features Now Available

### 1. Organization Dropdown
- **Location**: Top header (left side)
- **Access**: Click the organization name in the header
- **Features**:
  - Switch between organizations
  - View organization settings
  - Access organization billing/usage

### 2. Project Creation
- **URL**: `/new/[org-slug]` or `/new`
- **Access**:
  - Click "New Project" button on organization page
  - Navigate to `/organizations` and create new project
- **Features**:
  - Choose organization
  - Set project name
  - Configure database password
  - Select region
  - Choose compute size (if not on free plan)

### 3. Project List/Home Screen
- **URL**: `/org/[slug]`
- **Access**: Navigate from organizations page or header dropdown
- **Features**:
  - View all projects in organization
  - Search and filter projects
  - Quick access to project settings
  - View project status and health

### 4. Full Project Settings Menu
When viewing a project (`/project/[ref]/settings/*`), you now see:

#### Project Settings
- General
- Compute and Disk
- Infrastructure
- Integrations
- Data API
- API Keys
- JWT Keys
- Log Drains
- Add Ons
- Vault (Beta)

#### Configuration
- Database (redirects to database settings)
- Authentication (redirects to auth providers)
- Storage (redirects to storage settings)
- Edge Functions (redirects to function secrets)

#### Billing
- Subscription (org-level)
- Usage (project-specific)

### 5. Project Switcher
- **Access**: Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)
- **Search**: Type "Switch project" or "Configure organization"
- **Features**:
  - Quick project navigation
  - Organization configuration access
  - Keyboard-driven workflow

## Accessing Platform Features

### First-Time Setup
1. Navigate to `/organizations` - you should see your organizations from the platform database
2. If no organizations exist, you'll be redirected to `/new` to create one
3. After creating/selecting an organization, you can create projects at `/new/[org-slug]`

### Daily Workflow
1. **Home**: Start at `/organizations` to see all your organizations
2. **Select Org**: Click an organization to see its projects at `/org/[slug]`
3. **Create Project**: Click "New Project" button
4. **Manage Project**: Click on a project to access its dashboard
5. **Settings**: Navigate to project settings to configure compute, infrastructure, etc.

### Navigation Shortcuts
- **Cmd+K**: Open command menu
  - Type "Switch project" to see all projects
  - Type "Configure organization" to access org settings
- **Header Dropdown**: Click organization name to switch orgs
- **Breadcrumbs**: Click breadcrumb items to navigate up the hierarchy

## Authentication Flow

### How It Works Now
With `IS_PLATFORM=true`, the authentication flow is:
1. `withAuth` HOC wraps protected pages
2. In self-hosted mode (`IS_PLATFORM=true` but no Supabase Cloud auth), `withAuth` returns the component directly (line 29-32 in `withAuth.tsx`)
3. No sign-in required for self-hosted deployments
4. Platform API routes use your platform database directly

### Security Note
Self-hosted mode bypasses Supabase Cloud authentication. Ensure your deployment is secured:
- Use Vercel authentication if deploying to Vercel
- Add custom authentication middleware if needed
- Restrict access via network policies
- Use environment variable protection

## Platform Database Schema

Your platform database should have these tables:
- `platform.organizations` - Organization data
- `platform.projects` - Project metadata
- Other platform tables as needed

Example organization structure:
```sql
CREATE TABLE platform.organizations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  billing_email TEXT,
  plan JSONB DEFAULT '{"id": "free", "name": "Free"}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Troubleshooting

### Organization Dropdown Not Showing
- Verify `NEXT_PUBLIC_IS_PLATFORM=true` in your environment
- Check browser console for API errors
- Confirm organizations exist in `platform.organizations` table
- Restart your dev server after env changes

### Can't Access Project Creation
- Navigate to `/organizations` first
- Select or create an organization
- Then navigate to `/new/[org-slug]`
- Check that `useOrganizationsQuery` is working (browser dev tools → Network)

### Settings Menu Limited
- Verify `IS_PLATFORM=true` is set
- Clear browser cache
- Check `generateSettingsMenu` in `SettingsMenu.utils.tsx`
- Ensure you're viewing the settings page after refresh

### API Errors
- Check `NEXT_PUBLIC_API_URL` points to your deployment
- Verify platform database connection string is correct
- Check browser Network tab for failed API calls
- Ensure platform API routes are deployed

## Deployment Checklist

Before deploying to production:
- [ ] Set `NEXT_PUBLIC_IS_PLATFORM=true`
- [ ] Configure `NEXT_PUBLIC_API_URL` to production URL
- [ ] Verify platform database has organizations table
- [ ] Test organization creation and listing
- [ ] Verify project creation works
- [ ] Check all settings menu items are accessible
- [ ] Test project switching
- [ ] Confirm no authentication redirects occur
- [ ] Add custom authentication if needed for security

## Next Steps

1. **Create Organizations**: Populate `platform.organizations` with your org data
2. **Create Projects**: Use the UI at `/new/[slug]` to create projects
3. **Configure Settings**: Access full settings menu for each project
4. **Custom Authentication**: Add custom auth middleware if needed for production
5. **API Integration**: Ensure all platform API routes connect to your database

## Support

If you encounter issues:
1. Check browser console for errors
2. Verify environment variables are loaded (`console.log(process.env.NEXT_PUBLIC_IS_PLATFORM)`)
3. Check Network tab for failed API calls
4. Review this guide's troubleshooting section
5. Verify platform database schema matches expected structure
