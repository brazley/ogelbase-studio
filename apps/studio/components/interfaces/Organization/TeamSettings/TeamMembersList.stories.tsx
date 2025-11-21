import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TeamMembersList } from './TeamMembersList'
import { PlatformMember } from 'data/platform-members'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
})

const mockMembers: PlatformMember[] = [
  {
    id: 'member-1',
    user_id: 'user-1',
    organization_id: 'org-1',
    role: 'owner',
    invited_at: '2024-01-01T00:00:00Z',
    accepted_at: '2024-01-01T00:00:00Z',
    email: 'owner@company.com',
    first_name: 'Alice',
    last_name: 'Johnson',
    username: 'alice',
  },
  {
    id: 'member-2',
    user_id: 'user-2',
    organization_id: 'org-1',
    role: 'admin',
    invited_at: '2024-01-02T00:00:00Z',
    accepted_at: '2024-01-02T00:00:00Z',
    email: 'admin@company.com',
    first_name: 'Bob',
    last_name: 'Smith',
    username: 'bob',
  },
  {
    id: 'member-3',
    user_id: 'user-3',
    organization_id: 'org-1',
    role: 'developer',
    invited_at: '2024-01-03T00:00:00Z',
    accepted_at: '2024-01-03T00:00:00Z',
    email: 'dev@company.com',
    first_name: 'Charlie',
    last_name: 'Brown',
    username: 'charlie',
  },
  {
    id: 'member-4',
    user_id: 'user-4',
    organization_id: 'org-1',
    role: 'read_only',
    invited_at: '2024-01-04T00:00:00Z',
    accepted_at: '2024-01-04T00:00:00Z',
    email: 'viewer@company.com',
    first_name: 'Diana',
    last_name: 'Prince',
    username: 'diana',
  },
]

const meta: Meta<typeof TeamMembersList> = {
  title: 'Organization/TeamSettings/TeamMembersList',
  component: TeamMembersList,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="p-8 max-w-6xl">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A comprehensive table displaying organization members with role badges, edit capabilities, and member management actions.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof TeamMembersList>

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Default view showing a team with multiple members across different role levels.',
      },
    },
  },
}

export const WithRoleBadges: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Each role is displayed with a distinctive colored badge and icon:\n' +
          '- Owner: Amber with alert shield\n' +
          '- Admin: Blue with check shield\n' +
          '- Developer: Green with shield\n' +
          '- Read Only: Gray with user icon',
      },
    },
  },
}

export const Loading: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Loading state with skeleton loaders while fetching member data.',
      },
    },
  },
}

export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Empty state shown when there are no team members in the organization.',
      },
    },
  },
}

export const WithCurrentUser: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The current user is highlighted with a "You" badge and cannot perform actions on themselves.',
      },
    },
  },
}

export const MemberActions: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Members can be managed through dropdown actions:\n' +
          '- Change role (opens role selector dialog)\n' +
          '- Remove member (opens confirmation dialog)\n' +
          '- Actions respect permission hierarchy (only owners can manage owners)',
      },
    },
  },
}

export const ResponsiveDesign: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
    docs: {
      description: {
        story: 'The table is fully responsive and works well on mobile devices.',
      },
    },
  },
}
