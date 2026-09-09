/**
 * In-memory sliding-window rate limiter. Deliberately not applied to
 * vapi-webhook/stripe-webhook — those are called from shared IP pools
 * operated by Vapi/Stripe on behalf of every one of their customers, so a
 * per-IP limit tight enough to matter risks throttling our own legitimate
 * traffic, and both are already signature/secret-verified. This is for
 * lower-volume, more traditional endpoints (a scheduled job, an OAuth
 * callback, a phone-forwarding webhook for one specific number) where the
 * caller pool is small and predictable.
 *
 * Per-instance, not global — a serverless function's memory doesn't persist
 * across cold starts or get shared across concurrent instances/regions, so
 * this raises the bar against a single flood from one instance rather than
 * guaranteeing a hard global cap. Good enough defense-in-depth for this
 * scale; a distributed store (Redis/Upstash, or a DB-backed counter) would
 * be the next step if traffic ever justifies it.
 */

type Bucket = { count: number; windowStart: number }
const buckets = new Map<string, Bucket>()

// Cap how much memory a sustained attack can make this hold — old buckets
// are evicted lazily on the next check once this limit is hit, oldest first.
const MAX_TRACKED_KEYS = 5000

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number }

/**
 * `key` should already include both the caller identity (IP) and the route,
 * so different endpoints never share a bucket. `windowMs` is the sliding
 * window size, `max` the number of requests allowed within it.
 */
export function checkRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || now - existing.windowStart >= windowMs) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      const oldestKey = buckets.keys().next().value
      if (oldestKey !== undefined) buckets.delete(oldestKey)
    }
    buckets.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 }
  }

  if (existing.count >= max) {
    const retryAfterSeconds = Math.ceil((existing.windowStart + windowMs - now) / 1000)
    return { allowed: false, remaining: 0, retryAfterSeconds }
  }

  existing.count += 1
  return { allowed: true, remaining: max - existing.count, retryAfterSeconds: 0 }
}

/** Best-effort caller IP from standard proxy headers — falls back to a constant so misconfigured proxies degrade to one shared bucket rather than silently disabling the limit entirely. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}
