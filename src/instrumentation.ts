/**
 * Server-side error monitoring — runs once when a new server instance starts.
 * Uses plain @sentry/node (not @sentry/nextjs) deliberately: this project runs
 * a customised Next.js build (see AGENTS.md), and @sentry/nextjs's webpack/
 * turbopack integration is written against stock Next.js internals that may
 * not hold here. Plain @sentry/node has no build-time integration at all —
 * it just captures errors handed to it — so there's nothing for a fork
 * mismatch to break.
 *
 * No-ops safely if SENTRY_DSN isn't set (e.g. local dev) — Sentry.init()
 * with an empty dsn just disables reporting rather than throwing.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const Sentry = await import('@sentry/node')
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  })
}

// Next.js calls this for every server-side error it catches (Server
// Components, Route Handlers, Server Actions) — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[]> },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  if (!process.env.SENTRY_DSN) {
    console.error('[onRequestError]', context.routePath, context.routeType, err)
    return
  }
  const Sentry = await import('@sentry/node')
  Sentry.captureException(err, {
    tags: { routePath: context.routePath, routeType: context.routeType, routerKind: context.routerKind },
    extra: { path: request.path, method: request.method },
  })
}
