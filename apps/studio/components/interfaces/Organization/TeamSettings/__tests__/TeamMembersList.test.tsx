import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TeamMembersList } from '../TeamMembersList'

// Mock dependencies
vi.mock('common', () => ({
  useParams: () => ({ slug: 'test-org' }),
}))

vi.mock('lib/profile', () => ({
  useProfile: () => ({ profile: { id: 'user-1' } }),
}))

const mockMembers = [
  {
    id: 'member-1',
    user_id: 'user-1',
    organization_id: 'org-1',
    role: 'owner' as const,
    invited_at: '2024-01-01',
    accepted_at: '2024-01-01',
    email: 'owner@example.com',
    first_name: 'John',
    last_name: 'Doe',
    username: 'johndoe',
  },
  {
    id: 'member-2',
    user_id: 'user-2',
    organization_id: 'org-1',
    role: 'developer' as const,
    invited_at: '2024-01-02',
    accepted_at: '2024-01-02',
    email: 'dev@example.com',
    first_name: 'Jane',
    last_name: 'Smith',
    username: 'janesmith',
  },
]

vi.mock('data/platform-members/platform-members-query', () => ({
  usePlatformMembersQuery: () => ({
    data: mockMembers,
    error: null,
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('data/platform-members/platform-member-update-mutation', () => ({
  useUpdatePlatformMemberMutation: () => ({
    mutate: vi.fn(),
  }),
}))

vi.mock('data/platform-members/platform-member-remove-mutation', () => ({
  useRemovePlatformMemberMutation: () => ({
    mutate: vi.fn(),
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

describe('TeamMembersList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the members table', () => {
    render(<TeamMembersList />, { wrapper: createWrapper() })

    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
    expect(screen.getByText('dev@example.com')).toBeInTheDocument()
  })

  it('displays role badges correctly', () => {
    render(<TeamMembersList />, { wrapper: createWrapper() })

    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(screen.getByText('Developer')).toBeInTheDocument()
  })

  it('shows "You" badge for current user', () => {
    render(<TeamMembersList />, { wrapper: createWrapper() })

    expect(screen.getByText('You')).toBeInTheDocument()
  })

  it('displays member count', () => {
    render(<TeamMembersList />, { wrapper: createWrapper() })

    expect(screen.getByText('2 members')).toBeInTheDocument()
  })

  it('shows empty state when no members', () => {
    vi.mocked(require('data/platform-members/platform-members-query').usePlatformMembersQuery).mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      isError: false,
    })

    render(<TeamMembersList />, { wrapper: createWrapper() })

    expect(screen.getByText('No team members yet')).toBeInTheDocument()
  })

  it('does not show actions for current user', () => {
    render(<TeamMembersList />, { wrapper: createWrapper() })

    const rows = screen.getAllByRole('row')
    const currentUserRow = rows.find((row) => row.textContent?.includes('You'))

    expect(currentUserRow).toBeDefined()
    // Current user's row should not have the actions dropdown
    const dropdownButtons = screen.queryAllByRole('button', { name: /manage member/i })
    expect(dropdownButtons.length).toBe(1) // Only for the other member
  })

  it('opens remove dialog when remove action is clicked', async () => {
    const user = userEvent.setup()
    render(<TeamMembersList />, { wrapper: createWrapper() })

    // Find the actions dropdown for the non-current user
    const actionButtons = screen.getAllByRole('button')
    const moreButton = actionButtons.find((btn) => btn.querySelector('svg'))

    if (moreButton) {
      await user.click(moreButton)

      await waitFor(() => {
        const removeButton = screen.getByText('Remove member')
        expect(removeButton).toBeInTheDocument()
      })
    }
  })

  it('renders member names correctly', () => {
    render(<TeamMembersList />, { wrapper: createWrapper() })

    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
  })
})
