import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

const CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function generateCode(length = 7): string {
  return Array.from(randomBytes(length), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

/**
 * A business's booking/website links are static across every call — this
 * reuses the existing short link for the same (businessId, targetUrl) pair
 * rather than minting a new row (and a new URL to memorize in the prompt)
 * every time it's called. `baseUrl` is the caller's resolved site origin
 * (e.g. from `siteUrl()` in a route/action, or `APP_URL` in a script) since
 * this file has to stay usable from plain Node scripts, not just request
 * handlers.
 */
export async function getOrCreateShortLink(
  supabase: SupabaseClient,
  targetUrl: string,
  businessId: string | null,
  baseUrl: string,
): Promise<string> {
  let existingQuery = supabase.from('short_links').select('code').eq('target_url', targetUrl)
  existingQuery = businessId ? existingQuery.eq('business_id', businessId) : existingQuery.is('business_id', null)
  const { data: existing } = await existingQuery.maybeSingle()
  if (existing?.code) return `${baseUrl.replace(/\/$/, '')}/l/${existing.code}`

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    const { error } = await supabase.from('short_links').insert({ code, target_url: targetUrl, business_id: businessId })
    if (!error) return `${baseUrl.replace(/\/$/, '')}/l/${code}`
    if (!/duplicate key/i.test(error.message)) throw new Error(error.message)
  }
  throw new Error('Failed to generate a unique short code after 5 attempts')
}
