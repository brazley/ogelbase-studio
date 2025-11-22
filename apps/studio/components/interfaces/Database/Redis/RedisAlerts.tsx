/**
 * Redis Alerts Component
 *
 * Displays recent Redis alerts with severity indicators and links to runbooks.
 * Shows up to 5 most recent alerts with status badges.
 *
 * @example
 * <RedisAlerts alerts={alertsList} onViewAll={() => router.push('/alerts')} />
 */

import { AlertTriangle, CheckCircle2, Info, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { Badge, Button, cn } from 'ui'
import { Alert, AlertSeverity } from 'types/redis'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export interface RedisAlertsProps {
  alerts: Alert[]
  onViewAll?: () => void
  className?: string
}

const severityConfig: Record<
  AlertSeverity,
  { icon: typeof AlertTriangle; color: string; bgColor: string; variant: any }
> = {
  critical: {
    icon: AlertTriangle,
    color: 'text-destructive',
    bgColor: 'bg-destructive-200/50',
    variant: 'destructive',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-200/50',
    variant: 'warning',
  },
  info: {
    icon: Info,
    color: 'text-blue-600',
    bgColor: 'bg-blue-200/50',
    variant: 'default',
  },
}

export const RedisAlerts = ({ alerts, onViewAll, className }: RedisAlertsProps) => {
  if (!alerts || alerts.length === 0) {
    return (
      <div className={cn('rounded-md border bg-surface-100 p-4', className)}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-foreground">Recent Alerts</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-brand-600 mb-2" />
          <p className="text-xs text-foreground-light">All systems operational</p>
          <p className="text-xs text-foreground-muted mt-1">No active alerts</p>
        </div>
      </div>
    )
  }

  const recentAlerts = alerts.slice(0, 5)

  return (
    <div className={cn('rounded-md border bg-surface-100 p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">Recent Alerts</h3>
        {onViewAll && alerts.length > 5 && (
          <Button type="text" size="tiny" onClick={onViewAll}>
            View All
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {recentAlerts.map((alert, index) => {
          const config = severityConfig[alert.severity]
          const Icon = config.icon
          const timestamp = dayjs(alert.timestamp)
          const timeAgo = timestamp.fromNow()

          return (
            <div
              key={`${alert.metric}-${index}`}
              className={cn(
                'rounded-md border p-3 transition-colors hover:border-stronger',
                config.bgColor
              )}
            >
              <div className="flex items-start gap-3">
                <Icon className={cn('h-4 w-4 flex-shrink-0 mt-0.5', config.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground leading-tight">
                      {alert.message}
                    </p>
                    <Badge variant={config.variant} className="flex-shrink-0">
                      {alert.severity}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-foreground-muted mb-2">
                    <span>{alert.metric}</span>
                    <span>•</span>
                    <span title={timestamp.format('YYYY-MM-DD HH:mm:ss')}>{timeAgo}</span>
                  </div>

                  {/* Threshold vs Actual */}
                  <div className="flex items-center gap-3 text-xs mb-2">
                    <div>
                      <span className="text-foreground-muted">Threshold: </span>
                      <span className="font-mono font-medium text-foreground">
                        {alert.threshold}
                      </span>
                    </div>
                    <div>
                      <span className="text-foreground-muted">Actual: </span>
                      <span className={cn('font-mono font-medium', config.color)}>
                        {alert.actual}
                      </span>
                    </div>
                  </div>

                  {/* Recommendation */}
                  {alert.recommendation && (
                    <div className="rounded bg-surface-200 p-2 text-xs text-foreground-light">
                      <span className="font-medium">Recommendation: </span>
                      {alert.recommendation}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {alerts.length > 5 && (
        <div className="mt-3 pt-3 border-t text-center">
          <p className="text-xs text-foreground-muted">Showing 5 of {alerts.length} alerts</p>
        </div>
      )}
    </div>
  )
}
