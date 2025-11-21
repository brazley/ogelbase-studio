import { useQuery } from '@tanstack/react-query'
import { useParams } from 'common'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import utc from 'dayjs/plugin/utc'
import { Download, RefreshCw, Search, X } from 'lucide-react'
import { useState } from 'react'

import Table from 'components/to-be-cleaned/Table'
import { ScaffoldContainer, ScaffoldSection } from 'components/layouts/Scaffold'
import ShimmeringLoader from 'components/ui/ShimmeringLoader'
import { get } from 'data/fetchers'
import {
  Alert_Shadcn_,
  AlertTitle_Shadcn_,
  AlertDescription_Shadcn_,
  Badge,
  Button,
  Select_Shadcn_,
  SelectContent_Shadcn_,
  SelectGroup_Shadcn_,
  SelectItem_Shadcn_,
  SelectTrigger_Shadcn_,
  SelectValue_Shadcn_,
  WarningIcon,
} from 'ui'
import { Input } from 'ui-patterns/DataInputs/Input'
import { LogsDatePicker } from 'components/interfaces/Settings/Logs/Logs.DatePickers'
import type { AuditLogEntry } from 'lib/api/platform/audit'

// Enable relative time and UTC
dayjs.extend(relativeTime)
dayjs.extend(utc)

/**
 * Response shape from Rafael's /api/platform/audit/logs
 */
interface AuditLogsResponse {
  data: AuditLogEntry[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

/**
 * Filters for the audit logs
 */
interface AuditFilters {
  entityType: string
  action: string
  userId: string
  search: string
}

/**
 * Action type categorization for badge colors
 */
const getActionCategory = (action: string): 'create' | 'update' | 'delete' | 'other' => {
  if (action.includes('create') || action.includes('add')) return 'create'
  if (action.includes('update') || action.includes('change')) return 'update'
  if (action.includes('delete') || action.includes('remove')) return 'delete'
  return 'other'
}

/**
 * Badge variant based on action category
 */
const getActionBadgeVariant = (
  category: 'create' | 'update' | 'delete' | 'other'
): 'brand' | 'default' | 'destructive' | 'warning' => {
  switch (category) {
    case 'create':
      return 'brand' // green
    case 'update':
      return 'default' // blue
    case 'delete':
      return 'destructive' // red
    case 'other':
      return 'warning' // yellow
  }
}

/**
 * Format changes diff for display
 */
const formatChanges = (changes: Record<string, unknown> | null): string => {
  if (!changes) return 'No changes recorded'

  try {
    const formatted = Object.entries(changes)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null && 'before' in value && 'after' in value) {
          // Change log format: { before: x, after: y }
          const change = value as { before: unknown; after: unknown }
          return `${key}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`
        }
        return `${key}: ${JSON.stringify(value)}`
      })
      .join(', ')

    return formatted || 'No changes recorded'
  } catch {
    return JSON.stringify(changes)
  }
}

/**
 * Export logs to CSV
 */
const exportToCSV = (logs: AuditLogEntry[]) => {
  const headers = ['Time', 'User ID', 'Entity Type', 'Entity ID', 'Action', 'Changes', 'IP Address']
  const rows = logs.map((log) => [
    dayjs(log.created_at).format('YYYY-MM-DD HH:mm:ss'),
    log.user_id,
    log.entity_type,
    log.entity_id,
    log.action,
    formatChanges(log.changes),
    log.ip_address || '-',
  ])

  const csv = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `audit-logs-${dayjs().format('YYYY-MM-DD-HHmmss')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Fetch audit logs from Rafael's API
 */
async function fetchAuditLogs(
  filters: {
    entity_type?: string
    action?: string
    user_id?: string
    start_date?: string
    end_date?: string
    limit: number
    offset: number
  },
  signal?: AbortSignal
): Promise<AuditLogsResponse> {
  const queryParams = new URLSearchParams()

  if (filters.entity_type && filters.entity_type !== 'all') {
    queryParams.set('entity_type', filters.entity_type)
  }
  if (filters.action && filters.action !== 'all') {
    queryParams.set('action', filters.action)
  }
  if (filters.user_id) {
    queryParams.set('user_id', filters.user_id)
  }
  if (filters.start_date) {
    queryParams.set('start_date', filters.start_date)
  }
  if (filters.end_date) {
    queryParams.set('end_date', filters.end_date)
  }
  queryParams.set('limit', String(filters.limit))
  queryParams.set('offset', String(filters.offset))

  const { data, error } = await get(
    `/platform/audit/logs?${queryParams.toString()}`,
    { signal }
  )

  if (error) throw error
  return data as AuditLogsResponse
}

/**
 * Audit Logs Viewer Component
 *
 * Shows complete activity trail for platform entities
 * Uses Rafael's /api/platform/audit/logs endpoint
 */
export const AuditLogsViewer = () => {
  const { slug } = useParams()
  const currentTime = dayjs().utc()

  // State
  const [page, setPage] = useState(0)
  const [pageSize] = useState(50)
  const [dateRange, setDateRange] = useState({
    from: currentTime.subtract(7, 'day').toISOString(),
    to: currentTime.toISOString(),
  })
  const [filters, setFilters] = useState<AuditFilters>({
    entityType: 'all',
    action: 'all',
    userId: '',
    search: '',
  })

  // Query audit logs
  const {
    data,
    isLoading,
    isError,
    error,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['audit-logs', slug, dateRange, filters, page, pageSize],
    queryFn: ({ signal }) =>
      fetchAuditLogs(
        {
          entity_type: filters.entityType,
          action: filters.action,
          user_id: filters.userId || undefined,
          start_date: dateRange.from,
          end_date: dateRange.to,
          limit: pageSize,
          offset: page * pageSize,
        },
        signal
      ),
    keepPreviousData: true,
    staleTime: 30000, // 30 seconds
  })

  const logs = data?.data ?? []
  const pagination = data?.pagination ?? { total: 0, hasMore: false, limit: pageSize, offset: 0 }

  // Filter logs by search locally
  const filteredLogs = logs.filter((log) => {
    if (!filters.search) return true
    const searchLower = filters.search.toLowerCase()
    return (
      log.user_id.toLowerCase().includes(searchLower) ||
      log.entity_id.toLowerCase().includes(searchLower) ||
      log.action.toLowerCase().includes(searchLower) ||
      log.entity_type.toLowerCase().includes(searchLower)
    )
  })

  // Unique values for filters
  const entityTypes = ['all', 'project', 'organization', 'user', 'addon', 'billing']
  const actions = [
    'all',
    'create',
    'update',
    'delete',
    'member.add',
    'member.remove',
    'member.role_change',
    'addon.add',
    'addon.remove',
    'addon.update',
    'compute.update',
    'disk.update',
  ]

  // Calculate pages
  const totalPages = Math.ceil(pagination.total / pageSize)
  const canGoPrevious = page > 0
  const canGoNext = pagination.hasMore

  return (
    <ScaffoldContainer>
      <ScaffoldSection isFullWidth>
        <div className="space-y-4 flex flex-col">
          {/* Filters Bar */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center">
              <p className="text-xs text-foreground-light">Filter by</p>

              {/* Entity Type Filter */}
              <Select_Shadcn_
                value={filters.entityType}
                onValueChange={(value) => {
                  setFilters({ ...filters, entityType: value })
                  setPage(0)
                }}
              >
                <SelectTrigger_Shadcn_ className="w-[160px]">
                  <SelectValue_Shadcn_ placeholder="Entity Type" />
                </SelectTrigger_Shadcn_>
                <SelectContent_Shadcn_>
                  <SelectGroup_Shadcn_>
                    {entityTypes.map((type) => (
                      <SelectItem_Shadcn_ key={type} value={type}>
                        {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem_Shadcn_>
                    ))}
                  </SelectGroup_Shadcn_>
                </SelectContent_Shadcn_>
              </Select_Shadcn_>

              {/* Action Filter */}
              <Select_Shadcn_
                value={filters.action}
                onValueChange={(value) => {
                  setFilters({ ...filters, action: value })
                  setPage(0)
                }}
              >
                <SelectTrigger_Shadcn_ className="w-[160px]">
                  <SelectValue_Shadcn_ placeholder="Action" />
                </SelectTrigger_Shadcn_>
                <SelectContent_Shadcn_>
                  <SelectGroup_Shadcn_>
                    {actions.map((action) => (
                      <SelectItem_Shadcn_ key={action} value={action}>
                        {action === 'all' ? 'All Actions' : action}
                      </SelectItem_Shadcn_>
                    ))}
                  </SelectGroup_Shadcn_>
                </SelectContent_Shadcn_>
              </Select_Shadcn_>

              {/* Date Range Picker */}
              <LogsDatePicker
                hideWarnings
                value={dateRange}
                onSubmit={(value) => {
                  setDateRange(value)
                  setPage(0)
                }}
                helpers={[
                  {
                    text: 'Last 24 hours',
                    calcFrom: () => dayjs().subtract(1, 'day').toISOString(),
                    calcTo: () => dayjs().toISOString(),
                  },
                  {
                    text: 'Last 7 days',
                    calcFrom: () => dayjs().subtract(7, 'day').toISOString(),
                    calcTo: () => dayjs().toISOString(),
                  },
                  {
                    text: 'Last 30 days',
                    calcFrom: () => dayjs().subtract(30, 'day').toISOString(),
                    calcTo: () => dayjs().toISOString(),
                  },
                ]}
              />

              {/* Search Input */}
              <div className="relative">
                <Input
                  size="tiny"
                  icon={<Search size={14} />}
                  placeholder="Search logs..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="w-[200px]"
                  actions={
                    filters.search ? (
                      <Button
                        type="text"
                        size="tiny"
                        icon={<X size={14} />}
                        onClick={() => setFilters({ ...filters, search: '' })}
                      />
                    ) : undefined
                  }
                />
              </div>

              {/* Results count */}
              {!isLoading && (
                <>
                  <div className="h-[20px] border-r border-strong !ml-2 !mr-2" />
                  <p className="text-xs text-foreground-light">
                    {filteredLogs.length} of {pagination.total} logs
                  </p>
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                type="default"
                size="tiny"
                icon={<Download size={14} />}
                onClick={() => exportToCSV(filteredLogs)}
                disabled={filteredLogs.length === 0}
              >
                Export CSV
              </Button>
              <Button
                type="default"
                size="tiny"
                disabled={isLoading || isRefetching}
                icon={<RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />}
                onClick={() => refetch()}
              >
                {isRefetching ? 'Refreshing' : 'Refresh'}
              </Button>
            </div>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-2">
              <ShimmeringLoader />
              <ShimmeringLoader className="w-3/4" />
              <ShimmeringLoader className="w-1/2" />
            </div>
          )}

          {/* Error state */}
          {isError && (
            <Alert_Shadcn_ variant="destructive">
              <WarningIcon />
              <AlertTitle_Shadcn_>Failed to load audit logs</AlertTitle_Shadcn_>
              <AlertDescription_Shadcn_>
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </AlertDescription_Shadcn_>
            </Alert_Shadcn_>
          )}

          {/* Empty state */}
          {!isLoading && !isError && filteredLogs.length === 0 && (
            <div className="bg-surface-100 border rounded p-8 flex flex-col items-center justify-center">
              <p className="text-foreground-light text-center">
                {logs.length === 0
                  ? 'No audit logs found for the selected date range'
                  : 'No audit logs match your search criteria'}
              </p>
            </div>
          )}

          {/* Logs Table */}
          {!isLoading && !isError && filteredLogs.length > 0 && (
            <>
              <div className="border rounded-md overflow-hidden">
                <Table
                  head={[
                    <Table.th key="time" className="py-3 w-[180px]">
                      Time
                    </Table.th>,
                    <Table.th key="user" className="py-3 w-[200px]">
                      User
                    </Table.th>,
                    <Table.th key="action" className="py-3 w-[160px]">
                      Action
                    </Table.th>,
                    <Table.th key="entity" className="py-3 w-[140px]">
                      Entity Type
                    </Table.th>,
                    <Table.th key="entity-id" className="py-3">
                      Entity ID
                    </Table.th>,
                    <Table.th key="changes" className="py-3">
                      Changes
                    </Table.th>,
                  ]}
                  body={filteredLogs.map((log) => {
                    const category = getActionCategory(log.action)
                    const badgeVariant = getActionBadgeVariant(category)
                    const timeAgo = dayjs(log.created_at).fromNow()
                    const timeFormatted = dayjs(log.created_at).format('MMM DD, HH:mm:ss')

                    return (
                      <Table.tr key={log.id} className="hover:bg-surface-100 transition">
                        <Table.td>
                          <div className="flex flex-col">
                            <span className="text-sm">{timeFormatted}</span>
                            <span className="text-xs text-foreground-light">{timeAgo}</span>
                          </div>
                        </Table.td>
                        <Table.td>
                          <div className="flex flex-col">
                            <span className="text-sm font-mono text-xs truncate max-w-[180px]">
                              {log.user_id}
                            </span>
                            {log.ip_address && (
                              <span className="text-xs text-foreground-light">{log.ip_address}</span>
                            )}
                          </div>
                        </Table.td>
                        <Table.td>
                          <Badge variant={badgeVariant} className="font-mono text-xs">
                            {log.action}
                          </Badge>
                        </Table.td>
                        <Table.td>
                          <span className="text-sm capitalize">{log.entity_type}</span>
                        </Table.td>
                        <Table.td>
                          <span className="text-sm font-mono text-xs truncate block max-w-[200px]">
                            {log.entity_id}
                          </span>
                        </Table.td>
                        <Table.td>
                          <div className="text-xs text-foreground-light max-w-[300px] truncate">
                            {formatChanges(log.changes)}
                          </div>
                        </Table.td>
                      </Table.tr>
                    )
                  })}
                />
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-foreground-light">
                  Page {page + 1} of {Math.max(1, totalPages)} ({pagination.total} total logs)
                </p>
                <div className="flex gap-2">
                  <Button
                    type="default"
                    size="tiny"
                    onClick={() => setPage(page - 1)}
                    disabled={!canGoPrevious}
                  >
                    Previous
                  </Button>
                  <Button
                    type="default"
                    size="tiny"
                    onClick={() => setPage(page + 1)}
                    disabled={!canGoNext}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </ScaffoldSection>
    </ScaffoldContainer>
  )
}
