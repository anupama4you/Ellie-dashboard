import type { SupabaseClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from '@/lib/crypto'

const OAUTH_BASE = 'https://oauth2.googleapis.com'
const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'
const SCOPE = 'https://www.googleapis.com/auth/calendar'

function redirectUri(): string {
  return `${process.env.APP_URL!.replace(/\/$/, '')}/api/google-calendar/callback`
}

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPE,
    state,
  })
  return `${AUTH_BASE}?${params}`
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number }

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`)
  return res.json()
}

/** Best-effort — revokes Google's grant so disconnecting locally also actually revokes access on Google's side. */
export async function revokeToken(token: string): Promise<void> {
  await fetch(`${OAUTH_BASE}/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {})
}

export async function getUserEmail(accessToken: string): Promise<string | undefined> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return undefined
  const data = await res.json()
  return data.email
}

export type CalendarConnection = {
  calendar_id: string
  access_token_encrypted: string
  refresh_token_encrypted: string
  token_expiry: string
  status: string
}

/**
 * Returns a live access token for the business's connected Google Calendar,
 * refreshing (and persisting the refreshed token) if it's within 5 minutes
 * of expiry. Returns null if there's no connection, or it's not usable —
 * callers should treat that as "fall back to self-computed behaviour",
 * never as a hard failure.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ accessToken: string; calendarId: string } | null> {
  const { data: conn } = await supabase
    .from('calendar_connections')
    .select('calendar_id, access_token_encrypted, refresh_token_encrypted, token_expiry, status')
    .eq('business_id', businessId)
    .single<CalendarConnection>()

  if (!conn || conn.status !== 'connected') return null

  const expiresSoon = new Date(conn.token_expiry).getTime() - Date.now() < 5 * 60_000
  if (!expiresSoon) {
    return { accessToken: decrypt(conn.access_token_encrypted), calendarId: conn.calendar_id }
  }

  try {
    const refreshToken = decrypt(conn.refresh_token_encrypted)
    const refreshed = await refreshAccessToken(refreshToken)
    const tokenExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()

    await supabase
      .from('calendar_connections')
      .update({
        access_token_encrypted: encrypt(refreshed.access_token),
        token_expiry: tokenExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('business_id', businessId)

    return { accessToken: refreshed.access_token, calendarId: conn.calendar_id }
  } catch (err) {
    console.error('Failed to refresh Google Calendar token:', err)
    await supabase.from('calendar_connections').update({ status: 'error' }).eq('business_id', businessId)
    return null
  }
}

export type FreeBusyInterval = { start: string; end: string }

export async function freeBusyQuery(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<FreeBusyInterval[]> {
  const res = await fetch(`${CALENDAR_BASE}/freeBusy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    }),
  })
  if (!res.ok) throw new Error(`Google freeBusy failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.calendars?.[calendarId]?.busy ?? []
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: { summary: string; description?: string; start: Date; end: Date },
): Promise<{ id: string; htmlLink?: string }> {
  const res = await fetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start.toISOString() },
      end: { dateTime: event.end.toISOString() },
    }),
  })
  if (!res.ok) throw new Error(`Google event creation failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export type GoogleCalendarEvent = {
  id: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  htmlLink?: string
}

export async function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
  })
  const res = await fetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Google events list failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.items ?? []
}
