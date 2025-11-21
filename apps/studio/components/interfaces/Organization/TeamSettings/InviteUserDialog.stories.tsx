import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InviteUserDialog } from './InviteUserDialog'
import { Button } from 'ui'

// Mock the hooks
const mockUseParams = () => ({ slug: 'test-organization' })
const mockUseProfile = () => ({ profile: { id: 'user-123' } })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
})

const meta: Meta<typeof InviteUserDialog> = {
  title: 'Organization/TeamSettings/InviteUserDialog',
  component: InviteUserDialog,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A dialog component for inviting new members to an organization with email validation and role selection.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof InviteUserDialog>

export const Default: Story = {
  args: {
    canInvite: true,
  },
}

export const Disabled: Story = {
  args: {
    canInvite: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'The invite button is disabled when the user lacks permission to invite members.',
      },
    },
  },
}

export const CustomTrigger: Story = {
  args: {
    canInvite: true,
    trigger: (
      <Button type="secondary" size="small">
        Add Team Member
      </Button>
    ),
  },
  parameters: {
    docs: {
      description: {
        story: 'You can provide a custom trigger button instead of the default one.',
      },
    },
  },
}

export const WithValidationError: Story = {
  args: {
    canInvite: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'The dialog validates email format and shows inline error messages for invalid inputs.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    // This would be used with Testing Library in a real scenario
    // to show the validation state
  },
}

export const AllRoleOptions: Story = {
  args: {
    canInvite: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'The role selector includes all available roles: Owner, Admin, Developer, and Read Only with descriptions.',
      },
    },
  },
}
