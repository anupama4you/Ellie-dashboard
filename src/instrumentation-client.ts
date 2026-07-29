/**
 * Client-side error monitoring — runs before hydration. Plain @sentry/browser
 * (not @sentry/nextjs), same reasoning as src/instrumentation.ts: no
 * build-time integration to conflict with this project's customised Next.js.
 * No-ops safely if NEXT_PUBLIC_SENTRY_DSN isn't set.
 */
import * as Sentry from '@sentry/browser'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 0.1,
})

export function onRouterTransitionStart(url: string) {
  Sentry.addBreadcrumb({ category: 'navigation', message: `Navigated to ${url}`, level: 'info' })
}
