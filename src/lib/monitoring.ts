import * as Sentry from '@sentry/node'

/**
 * Central place to report an error worth knowing about in production —
 * console.error alone means nobody finds out until a customer complains.
 * Safe to call even with no SENTRY_DSN configured (Sentry.captureException
 * silently no-ops when Sentry.init() was never given a real dsn).
 */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  console.error(err)
  Sentry.captureException(err, context ? { extra: context } : undefined)
}
