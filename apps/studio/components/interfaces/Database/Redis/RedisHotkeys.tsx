/**
 * Redis Hotkeys List Component
 *
 * Displays top 10 most frequently accessed keys with their access rates.
 * Shows visual indicators for keys exceeding thresholds.
 *
 * @example
 * <RedisHotkeys hotkeys={hotkeysList} threshold={1000} />
 */

import { Flame, TrendingUp } from 'lucide-react'
import { Badge, cn } from 'ui'
import { HotkeyMetric } from 'types/redis'

export interface RedisHotkeysProps {
  hotkeys: HotkeyMetric[]
  threshold: number
  className?: string
}

export const RedisHotkeys = ({ hotkeys, threshold, className }: RedisHotkeysProps) => {
  if (!hotkeys || hotkeys.length === 0) {
    return (
      <div className={cn('rounded-md border bg-surface-100 p-4', className)}>
        <h3 className="text-sm font-medium text-foreground mb-3">Top 10 Hotkeys</h3>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Flame className="h-8 w-8 text-foreground-muted mb-2" />
          <p className="text-xs text-foreground-light">No hotkeys detected</p>
          <p className="text-xs text-foreground-muted mt-1">
            Keys exceeding {threshold} accesses/min will appear here
          </p>
        </div>
      </div>
    )
  }

  // Take top 10 and calculate max for relative bar sizing
  const top10 = hotkeys.slice(0, 10)
  const maxAccesses = Math.max(...top10.map((h) => h.accessesPerMinute))

  return (
    <div className={cn('rounded-md border bg-surface-100 p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">Top 10 Hotkeys</h3>
        <Badge variant="outline" className="text-xs">
          {hotkeys.length} total
        </Badge>
      </div>

      <div className="space-y-2">
        {top10.map((hotkey, index) => {
          const barWidth = (hotkey.accessesPerMinute / maxAccesses) * 100
          const isHot = hotkey.isHot

          return (
            <div
              key={`${hotkey.key}-${index}`}
              className="group rounded-md p-2 transition-colors hover:bg-surface-200"
            >
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs font-mono text-foreground-muted tabular-nums w-5 flex-shrink-0">
                    {index + 1}.
                  </span>
                  <span
                    className="text-xs font-mono text-foreground truncate"
                    title={hotkey.key}
                  >
                    {hotkey.key}
                  </span>
                  {isHot && (
                    <span title="Hot key!">
                      <Flame className="h-3 w-3 text-destructive flex-shrink-0" />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={cn(
                      'text-xs font-mono font-medium tabular-nums',
                      isHot ? 'text-destructive' : 'text-foreground'
                    )}
                  >
                    {hotkey.accessesPerMinute.toLocaleString()}
                  </span>
                  <span className="text-xs text-foreground-muted">/min</span>
                </div>
              </div>

              {/* Frequency bar */}
              <div className="h-1.5 rounded-full bg-surface-200 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    isHot ? 'bg-destructive' : 'bg-brand-500'
                  )}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {hotkeys.length > 10 && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-foreground-muted text-center">
            Showing top 10 of {hotkeys.length} tracked keys
          </p>
        </div>
      )}
    </div>
  )
}
