import type { Config } from '@netlify/functions'

// Thin cron trigger only — the actual scheduling logic lives in
// src/app/api/campaign-scheduler/route.ts so it can import the same
// @/lib/* code the rest of the app uses (Netlify's function bundler
// doesn't resolve Next.js's tsconfig path aliases). This function's only
// job is to ping that route on a schedule.
export default async () => {
  const appUrl = Netlify.env.get('APP_URL')
  const secret = Netlify.env.get('CAMPAIGN_SCHEDULER_SECRET')

  if (!appUrl) {
    console.error('campaign-scheduler-tick: APP_URL is not set')
    return
  }
  if (!secret) {
    console.error('campaign-scheduler-tick: CAMPAIGN_SCHEDULER_SECRET is not set')
    return
  }

  try {
    const res = await fetch(`${appUrl}/api/campaign-scheduler`, {
      method: 'POST',
      headers: { 'x-scheduler-secret': secret },
    })
    if (!res.ok) {
      console.error(`campaign-scheduler-tick: /api/campaign-scheduler returned ${res.status}`)
      return
    }
    const result = await res.json()
    console.log('campaign-scheduler-tick:', result)
  } catch (err) {
    console.error('campaign-scheduler-tick: failed to reach /api/campaign-scheduler:', err)
  }
}

export const config: Config = {
  schedule: '*/5 * * * *',
}
