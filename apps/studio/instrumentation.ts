import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')

    // Initialize observability stack (tracing, metrics, logging)
    // Only runs in platform mode
    const { initializeObservability } = await import('./lib/observability')
    initializeObservability()

    // Initialize cache warming on startup
    // Runs in background, non-blocking
    if (process.env.REDIS_URL) {
      const { warmCache } = await import('./lib/api/cache/warming')
      warmCache()
        .then(() => {
          console.log('[Instrumentation] Cache warming initiated successfully')
        })
        .catch((error) => {
          console.error('[Instrumentation] Cache warming failed to start:', error)
          // Don't fail server startup if cache warming fails
        })
    } else {
      console.log('[Instrumentation] REDIS_URL not set, skipping cache warming')
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
