export type MapsLinkInput = {
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
