/**
 * Redis Metrics Dashboard Page
 *
 * Main page for Redis performance monitoring in Supabase Studio.
 * Route: /project/[ref]/database/redis
 *
 * Displays real-time metrics for Redis cache performance including:
 * - Cache hit rate
 * - Latency metrics (p50, p95, p99)
 * - Memory usage
 * - Connection pool status
 * - Hotkey detection
 * - Performance alerts
 */

import { useRouter } from 'next/router'
import DatabaseLayout from 'components/layouts/DatabaseLayout/DatabaseLayout'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { RedisDashboard } from 'components/interfaces/Database/Redis'
import type { NextPageWithLayout } from 'types'

const RedisPage: NextPageWithLayout = () => {
  const router = useRouter()
  const { ref } = router.query

  if (!ref || typeof ref !== 'string') {
    return null
  }

  return (
    <div className="mx-auto max-w-7xl">
      <RedisDashboard projectRef={ref} />
    </div>
  )
}

RedisPage.getLayout = (page) => (
  <DefaultLayout>
    <DatabaseLayout title="Redis">{page}</DatabaseLayout>
  </DefaultLayout>
)

export default RedisPage
