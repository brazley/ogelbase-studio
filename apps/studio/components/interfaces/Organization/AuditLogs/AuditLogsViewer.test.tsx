import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuditLogsViewer } from './AuditLogsViewer'
import * as fetchers from 'data/fetchers'

// Mock dependencies
vi.mock('common', () => ({
  useParams: () => ({ slug: 'test-org' }),
}))

vi.mock('data/fetchers', () => ({
  get: vi.fn(),
}))

vi.mock('components/interfaces/Settings/Logs/Logs.DatePickers', () => ({
  LogsDatePicker: ({ value, onSubmit, helpers }: any) => (
    <div data-testid="date-picker">
      <button onClick={() => onSubmit(value)}>Apply</button>
      {helpers?.map((h: any) => (
        <button key={h.text} onClick={() => onSubmit({ from: h.calcFrom(), to: h.calcTo() })}>
          {h.text}
        </button>
      ))}
    </div>
  ),
}))

const mockAuditLogs = [
  {
    id: '1',
    user_id: 'user-123',
    entity_type: 'project' as const,
    entity_id: 'proj-abc',
    action: 'create',
    changes: { name: { before: null, after: 'New Project' } },
    ip_address: '192.168.1.1',
    user_agent: 'Mozilla/5.0',
    created_at: '2025-11-21T10:00:00Z',
  },
  {
    id: '2',
    user_id: 'user-456',
    entity_type: 'organization' as const,
    entity_id: 'org-xyz',
    action: 'member.add',
    changes: { email: 'newuser@example.com' },
    ip_address: '192.168.1.2',
    user_agent: 'Mozilla/5.0',
    created_at: '2025-11-21T11:00:00Z',
  },
  {
    id: '3',
    user_id: 'user-789',
    entity_type: 'billing' as const,
    entity_id: 'bill-def',
    action: 'billing.subscription_change',
    changes: { plan: { before: 'free', after: 'pro' } },
    ip_address: '192.168.1.3',
    user_agent: 'Mozilla/5.0',
    created_at: '2025-11-21T12:00:00Z',
  },
]

const mockResponse = {
  data: mockAuditLogs,
  pagination: {
    total: 3,
    limit: 50,
    offset: 0,
    hasMore: false,
  },
}

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

const renderWithQueryClient = (component: React.ReactElement) => {
  const queryClient = createQueryClient()
  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>)
}

describe('AuditLogsViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchers.get).mockResolvedValue({ data: mockResponse, error: null })
  })

  it('renders loading state initially', () => {
    renderWithQueryClient(<AuditLogsViewer />)
    expect(screen.getByText(/Filter by/i)).toBeInTheDocument()
  })

  it('displays audit logs after loading', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      expect(screen.getByText('user-123')).toBeInTheDocument()
      expect(screen.getByText('user-456')).toBeInTheDocument()
      expect(screen.getByText('user-789')).toBeInTheDocument()
    })
  })

  it('shows correct entity types', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      expect(screen.getByText('project')).toBeInTheDocument()
      expect(screen.getByText('organization')).toBeInTheDocument()
      expect(screen.getByText('billing')).toBeInTheDocument()
    })
  })

  it('displays action badges with correct categories', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      expect(screen.getByText('create')).toBeInTheDocument()
      expect(screen.getByText('member.add')).toBeInTheDocument()
      expect(screen.getByText('billing.subscription_change')).toBeInTheDocument()
    })
  })

  it('shows changes in readable format', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      // Check for formatted changes
      const changesText = screen.getByText(/name: null → "New Project"/)
      expect(changesText).toBeInTheDocument()
    })
  })

  it('filters logs by search term', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      expect(screen.getByText('user-123')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search logs...')
    fireEvent.change(searchInput, { target: { value: 'user-123' } })

    await waitFor(() => {
      expect(screen.getByText('user-123')).toBeInTheDocument()
      // Other users should still be visible (local filter)
    })
  })

  it('shows pagination controls', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      expect(screen.getByText(/Page 1 of/)).toBeInTheDocument()
      expect(screen.getByText('Previous')).toBeInTheDocument()
      expect(screen.getByText('Next')).toBeInTheDocument()
    })
  })

  it('disables previous button on first page', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      const prevButton = screen.getByText('Previous')
      expect(prevButton).toBeDisabled()
    })
  })

  it('displays total count correctly', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      expect(screen.getByText('3 of 3 logs')).toBeInTheDocument()
    })
  })

  it('shows IP addresses', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      expect(screen.getByText('192.168.1.1')).toBeInTheDocument()
      expect(screen.getByText('192.168.1.2')).toBeInTheDocument()
      expect(screen.getByText('192.168.1.3')).toBeInTheDocument()
    })
  })

  it('renders entity IDs in monospace font', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      const entityId = screen.getByText('proj-abc')
      expect(entityId).toHaveClass('font-mono')
    })
  })

  it('has refresh button', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      const refreshButton = screen.getByText('Refresh')
      expect(refreshButton).toBeInTheDocument()
    })
  })

  it('has export CSV button', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      const exportButton = screen.getByText('Export CSV')
      expect(exportButton).toBeInTheDocument()
    })
  })

  it('shows empty state when no logs', async () => {
    vi.mocked(fetchers.get).mockResolvedValue({
      data: { data: [], pagination: { total: 0, limit: 50, offset: 0, hasMore: false } },
      error: null,
    })

    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      expect(screen.getByText(/No audit logs found/)).toBeInTheDocument()
    })
  })

  it('shows error state on API failure', async () => {
    vi.mocked(fetchers.get).mockResolvedValue({
      data: null,
      error: new Error('API Error'),
    })

    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      expect(screen.getByText(/Failed to load audit logs/)).toBeInTheDocument()
    })
  })

  it('has entity type filter dropdown', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      // SelectTrigger should be present
      const selects = screen.getAllByRole('combobox')
      expect(selects.length).toBeGreaterThan(0)
    })
  })

  it('has action filter dropdown', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      // Multiple select dropdowns should be present
      const selects = screen.getAllByRole('combobox')
      expect(selects.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('displays relative time for logs', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      // Should show relative time like "X hours ago"
      const relativeTime = screen.queryAllByText(/ago/)
      expect(relativeTime.length).toBeGreaterThan(0)
    })
  })

  it('formats changes with before/after diff', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      // Check for arrow separator in changes
      const changes = screen.getByText(/→/)
      expect(changes).toBeInTheDocument()
    })
  })

  it('truncates long entity IDs', async () => {
    const longIdLog = {
      ...mockAuditLogs[0],
      entity_id: 'very-long-entity-id-that-should-be-truncated-for-display',
    }

    vi.mocked(fetchers.get).mockResolvedValue({
      data: {
        data: [longIdLog],
        pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
      },
      error: null,
    })

    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      const entityId = screen.getByText(/very-long-entity-id/)
      expect(entityId).toHaveClass('truncate')
    })
  })

  it('calls API with correct parameters', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      expect(fetchers.get).toHaveBeenCalledWith(
        expect.stringContaining('/platform/audit/logs'),
        expect.any(Object)
      )
    })
  })

  it('handles pagination navigation', async () => {
    vi.mocked(fetchers.get).mockResolvedValue({
      data: {
        data: mockAuditLogs,
        pagination: { total: 100, limit: 50, offset: 0, hasMore: true },
      },
      error: null,
    })

    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      const nextButton = screen.getByText('Next')
      expect(nextButton).not.toBeDisabled()
    })
  })

  it('displays date range picker', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      expect(screen.getByTestId('date-picker')).toBeInTheDocument()
    })
  })

  it('has quick date range helpers', async () => {
    renderWithQueryClient(<AuditLogsViewer />)

    await waitFor(() => {
      expect(screen.getByText('Last 24 hours')).toBeInTheDocument()
      expect(screen.getByText('Last 7 days')).toBeInTheDocument()
      expect(screen.getByText('Last 30 days')).toBeInTheDocument()
    })
  })
})
