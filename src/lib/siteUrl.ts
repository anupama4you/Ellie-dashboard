import { headers } from 'next/headers'

/**
 * NEXT_PUBLIC_SITE_URL wins when set — trust the environment over guessing.
 * Otherwise fall back to the request's own host/protocol (respecting
 * x-forwarded-proto behind a reverse proxy). Defaults to http rather than
 * https for unrecognized hosts, since this app is also served plain-http on
 * a custom domain, not just localhost.
 */
export async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const protocol = h.get('x-forwarded-proto') ?? 'http'
  return `${protocol}://${host}`
}
