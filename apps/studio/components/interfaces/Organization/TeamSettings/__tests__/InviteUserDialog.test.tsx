import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InviteUserDialog } from '../InviteUserDialog'

// Mock dependencies
vi.mock('common', () => ({
  useParams: () => ({ slug: 'test-org' }),
}))

vi.mock('lib/profile', () => ({
  useProfile: () => ({ profile: { id: 'user-1' } }),
}))

vi.mock('data/platform-members/platform-members-query', () => ({
  usePlatformMembersQuery: () => ({
    data: [
      {
        id: 'member-1',
        user_id: 'user-1',
        email: 'existing@example.com',
        role: 'admin',
      },
    ],
  }),
}))

vi.mock('data/platform-members/platform-member-invite-mutation', () => ({
  useInvitePlatformMemberMutation: () => ({
    mutate: vi.fn(),
    isLoading: false,
  }),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('InviteUserDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the trigger button', () => {
    render(<InviteUserDialog />, { wrapper: createWrapper() })
    expect(screen.getByText('Invite member')).toBeInTheDocument()
  })

  it('opens dialog when trigger is clicked', async () => {
    const user = userEvent.setup()
    render(<InviteUserDialog />, { wrapper: createWrapper() })

    await user.click(screen.getByText('Invite member'))

    await waitFor(() => {
      expect(screen.getByText('Invite a member to this organization')).toBeInTheDocument()
    })
  })

  it('validates email format', async () => {
    const user = userEvent.setup()
    render(<InviteUserDialog />, { wrapper: createWrapper() })

    await user.click(screen.getByText('Invite member'))

    const emailInput = await screen.findByPlaceholderText('user@example.com')
    await user.type(emailInput, 'invalid-email')

    const submitButton = screen.getByRole('button', { name: /send invitation/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Must be a valid email address')).toBeInTheDocument()
    })
  })

  it('shows all role options', async () => {
    const user = userEvent.setup()
    render(<InviteUserDialog />, { wrapper: createWrapper() })

    await user.click(screen.getByText('Invite member'))

    const roleSelect = await screen.findByRole('combobox')
    await user.click(roleSelect)

    await waitFor(() => {
      expect(screen.getByText('Owner')).toBeInTheDocument()
      expect(screen.getByText('Admin')).toBeInTheDocument()
      expect(screen.getByText('Developer')).toBeInTheDocument()
      expect(screen.getByText('Read Only')).toBeInTheDocument()
    })
  })

  it('disables button when canInvite is false', () => {
    render(<InviteUserDialog canInvite={false} />, { wrapper: createWrapper() })

    const button = screen.getByText('Invite member')
    expect(button).toBeDisabled()
  })

  it('accepts custom trigger component', () => {
    const customTrigger = <button>Custom Invite</button>
    render(<InviteUserDialog trigger={customTrigger} />, { wrapper: createWrapper() })

    expect(screen.getByText('Custom Invite')).toBeInTheDocument()
  })
})
