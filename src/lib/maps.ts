import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrCreateShortLink } from './shortLinks'

export type MapsLinkInput = {
  id: string
  name: string
  google_maps_url?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
}

/**
 * Prefers the business's own pasted Google Maps share link (accurate — points
 * straight at their real listing) and only falls back to a constructed
 * search-query URL from address fields if they haven't set one. Null if
 * neither is available.
 */
export function mapsLink(biz: MapsLinkInput): string | null {
  if (biz.google_maps_url?.trim()) return biz.google_maps_url.trim()
  const location = [biz.address, biz.city, biz.state, biz.postcode].filter(Boolean).join(', ')
  if (!location) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${biz.name}, ${location}`)}`
}

/**
 * Same as mapsLink(), routed through a self-hosted short link — a real
 * Google Maps share URL (or the constructed search-query fallback) commonly
 * runs 80-150+ chars on its own, which is often the single biggest reason a
 * booking confirmation/reschedule SMS spills past the 160-char GSM-7
 * segment boundary into a second (or third) billed segment. Static per
 * business, so getOrCreateShortLink reuses the one code minted for it
 * rather than creating a new row on every send.
 */
export async function shortMapsLink(
  supabase: SupabaseClient,
  biz: MapsLinkInput,
  baseUrl: string,
): Promise<string | null> {
  const url = mapsLink(biz)
  if (!url) return null
  return getOrCreateShortLink(supabase, url, biz.id, baseUrl)
}
