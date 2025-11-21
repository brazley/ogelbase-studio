import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuditLogsViewer } from './AuditLogsViewer'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Infinity,
    },
  },
})

const meta: Meta<typeof AuditLogsViewer> = {
  title: 'Organization/AuditLogsViewer',
  component: AuditLogsViewer,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="p-8">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
# Audit Logs Viewer

A comprehensive audit log viewer for platform mode installations. Shows complete activity trail
across all platform entities with advanced filtering, pagination, and CSV export.

## Features

- **Entity Filtering**: Filter by project, organization, user, addon, billing
- **Action Filtering**: Filter by specific actions (create, update, delete, etc.)
- **Date Range**: Select custom date ranges with quick helpers
- **Search**: Client-side search across all log fields
- **Pagination**: 50 logs per page with navigation
- **CSV Export**: Download filtered logs for external analysis
- **Color-Coded**: Actions are color-coded (create=green, update=blue, delete=red)
- **Relative Time**: Shows "2 hours ago" alongside absolute timestamps
- **Change Diffs**: Inline before/after comparison with arrows

## API Integration

Uses Rafael's unified audit API:
\`\`\`
GET /api/platform/audit/logs
\`\`\`

Query Parameters:
- \`entity_type\`: Filter by entity type
- \`action\`: Filter by action
- \`user_id\`: Filter by user
- \`start_date\`: Filter from date (ISO format)
- \`end_date\`: Filter to date (ISO format)
- \`limit\`: Results per page (default: 50, max: 1000)
- \`offset\`: Pagination offset

## Usage

\`\`\`tsx
import { AuditLogsViewer } from 'components/interfaces/Organization/AuditLogs'

function AuditPage() {
  return <AuditLogsViewer />
}
\`\`\`

## Design System

Uses Supabase design system components:
- \`Table\` from \`components/to-be-cleaned/Table\`
- \`Badge\` with semantic variants
- \`Select_Shadcn_\` for dropdowns
- \`LogsDatePicker\` for date ranges
- \`Button\` for actions
`,
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof AuditLogsViewer>

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Default view with all filters visible and 7-day date range.',
      },
    },
    mockData: [
      {
        url: '/api/platform/audit/logs*',
        method: 'GET',
        status: 200,
        response: {
          data: [
            {
              id: '1',
              user_id: 'user-abc123',
              entity_type: 'project',
              entity_id: 'proj-xyz789',
              action: 'create',
              changes: { name: { before: null, after: 'New Analytics Dashboard' } },
              ip_address: '192.168.1.100',
              user_agent: 'Mozilla/5.0',
              created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
            },
            {
              id: '2',
              user_id: 'user-def456',
              entity_type: 'organization',
              entity_id: 'org-abc123',
              action: 'member.add',
              changes: { email: 'newdev@company.com', role: 'developer' },
              ip_address: '203.0.113.45',
              user_agent: 'Mozilla/5.0',
              created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
            },
            {
              id: '3',
              user_id: 'user-ghi789',
              entity_type: 'billing',
              entity_id: 'sub-def456',
              action: 'billing.subscription_change',
              changes: { plan: { before: 'free', after: 'pro' } },
              ip_address: '198.51.100.23',
              user_agent: 'Mozilla/5.0',
              created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
            },
            {
              id: '4',
              user_id: 'user-abc123',
              entity_type: 'project',
              entity_id: 'proj-xyz789',
              action: 'settings.update',
              changes: {
                database_url: { before: 'postgres://old', after: 'postgres://new' },
                max_connections: { before: 100, after: 200 },
              },
              ip_address: '192.168.1.100',
              user_agent: 'Mozilla/5.0',
              created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
            },
            {
              id: '5',
              user_id: 'user-jkl012',
              entity_type: 'addon',
              entity_id: 'addon-redis-1',
              action: 'addon.add',
              changes: { type: 'redis', size: '1GB' },
              ip_address: '203.0.113.67',
              user_agent: 'Mozilla/5.0',
              created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
            },
          ],
          pagination: {
            total: 5,
            limit: 50,
            offset: 0,
            hasMore: false,
          },
        },
      },
    ],
  },
}

export const EmptyState: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Empty state when no audit logs are found for the selected filters.',
      },
    },
    mockData: [
      {
        url: '/api/platform/audit/logs*',
        method: 'GET',
        status: 200,
        response: {
          data: [],
          pagination: {
            total: 0,
            limit: 50,
            offset: 0,
            hasMore: false,
          },
        },
      },
    ],
  },
}

export const ErrorState: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Error state when the API fails to load logs.',
      },
    },
    mockData: [
      {
        url: '/api/platform/audit/logs*',
        method: 'GET',
        status: 500,
        response: {
          error: 'Failed to query audit logs',
          code: 'QUERY_FAILED',
          message: 'Database query failed. Please check server logs for details.',
        },
      },
    ],
  },
}

export const WithPagination: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Logs with pagination - showing 50 logs with more available.',
      },
    },
    mockData: [
      {
        url: '/api/platform/audit/logs*',
        method: 'GET',
        status: 200,
        response: {
          data: Array.from({ length: 50 }, (_, i) => ({
            id: `log-${i + 1}`,
            user_id: `user-${Math.floor(Math.random() * 10)}`,
            entity_type: ['project', 'organization', 'user', 'addon', 'billing'][
              Math.floor(Math.random() * 5)
            ],
            entity_id: `entity-${i + 1}`,
            action: ['create', 'update', 'delete', 'member.add', 'settings.update'][
              Math.floor(Math.random() * 5)
            ],
            changes: { example: { before: 'old', after: 'new' } },
            ip_address: `192.168.1.${Math.floor(Math.random() * 255)}`,
            user_agent: 'Mozilla/5.0',
            created_at: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
          })),
          pagination: {
            total: 237,
            limit: 50,
            offset: 0,
            hasMore: true,
          },
        },
      },
    ],
  },
}

export const FilteredByProject: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Logs filtered to show only project-related actions.',
      },
    },
    mockData: [
      {
        url: '/api/platform/audit/logs*',
        method: 'GET',
        status: 200,
        response: {
          data: [
            {
              id: '1',
              user_id: 'user-abc123',
              entity_type: 'project',
              entity_id: 'proj-xyz789',
              action: 'create',
              changes: { name: { before: null, after: 'New Project' } },
              ip_address: '192.168.1.100',
              user_agent: 'Mozilla/5.0',
              created_at: new Date().toISOString(),
            },
            {
              id: '2',
              user_id: 'user-abc123',
              entity_type: 'project',
              entity_id: 'proj-xyz789',
              action: 'settings.update',
              changes: { public: { before: false, after: true } },
              ip_address: '192.168.1.100',
              user_agent: 'Mozilla/5.0',
              created_at: new Date(Date.now() - 1000).toISOString(),
            },
            {
              id: '3',
              user_id: 'user-def456',
              entity_type: 'project',
              entity_id: 'proj-xyz789',
              action: 'delete',
              changes: null,
              ip_address: '203.0.113.45',
              user_agent: 'Mozilla/5.0',
              created_at: new Date(Date.now() - 2000).toISOString(),
            },
          ],
          pagination: {
            total: 3,
            limit: 50,
            offset: 0,
            hasMore: false,
          },
        },
      },
    ],
  },
}

export const BillingActions: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Logs showing billing-related actions like subscription changes and payment methods.',
      },
    },
    mockData: [
      {
        url: '/api/platform/audit/logs*',
        method: 'GET',
        status: 200,
        response: {
          data: [
            {
              id: '1',
              user_id: 'user-admin',
              entity_type: 'billing',
              entity_id: 'sub-123',
              action: 'billing.subscription_change',
              changes: { plan: { before: 'free', after: 'team' } },
              ip_address: '192.168.1.1',
              user_agent: 'Mozilla/5.0',
              created_at: new Date(Date.now() - 60000).toISOString(),
            },
            {
              id: '2',
              user_id: 'user-admin',
              entity_type: 'billing',
              entity_id: 'pm-456',
              action: 'billing.payment_method_add',
              changes: { type: 'card', last4: '4242' },
              ip_address: '192.168.1.1',
              user_agent: 'Mozilla/5.0',
              created_at: new Date(Date.now() - 120000).toISOString(),
            },
            {
              id: '3',
              user_id: 'user-admin',
              entity_type: 'billing',
              entity_id: 'pm-789',
              action: 'billing.payment_method_remove',
              changes: { type: 'card', last4: '1234' },
              ip_address: '192.168.1.1',
              user_agent: 'Mozilla/5.0',
              created_at: new Date(Date.now() - 180000).toISOString(),
            },
          ],
          pagination: {
            total: 3,
            limit: 50,
            offset: 0,
            hasMore: false,
          },
        },
      },
    ],
  },
}

export const ComplexChanges: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Logs with complex change objects showing detailed before/after state for multiple fields.',
      },
    },
    mockData: [
      {
        url: '/api/platform/audit/logs*',
        method: 'GET',
        status: 200,
        response: {
          data: [
            {
              id: '1',
              user_id: 'user-admin',
              entity_type: 'project',
              entity_id: 'proj-main',
              action: 'compute.update',
              changes: {
                cpu: { before: 2, after: 4 },
                memory: { before: '4GB', after: '8GB' },
                disk: { before: '50GB', after: '100GB' },
              },
              ip_address: '192.168.1.1',
              user_agent: 'Mozilla/5.0',
              created_at: new Date().toISOString(),
            },
            {
              id: '2',
              user_id: 'user-admin',
              entity_type: 'organization',
              entity_id: 'org-main',
              action: 'settings.update',
              changes: {
                name: { before: 'Old Company', after: 'New Company' },
                billing_email: { before: 'old@company.com', after: 'new@company.com' },
                region: { before: 'us-east-1', after: 'us-west-1' },
              },
              ip_address: '192.168.1.1',
              user_agent: 'Mozilla/5.0',
              created_at: new Date(Date.now() - 1000).toISOString(),
            },
          ],
          pagination: {
            total: 2,
            limit: 50,
            offset: 0,
            hasMore: false,
          },
        },
      },
    ],
  },
}
