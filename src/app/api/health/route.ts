import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Point an external uptime monitor (UptimeRobot, Better Uptime, a Vercel Cron
 * hitting this + alerting, etc.) at this endpoint. Actually checks the
 * database is reachable rather than just confirming the Next.js process is
 * up — a server that's running but can't reach Supabase is still down from
 * a customer's perspective.
 */
export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {}
  let healthy = true

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { error } = await supabase.from('businesses').select('id').limit(1)
    checks.database = error ? 'error' : 'ok'
    if (error) healthy = false
  } catch {
    checks.database = 'error'
    healthy = false
  }

  return NextResponse.json(
    { status: healthy ? 'ok' : 'error', checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  )
}
