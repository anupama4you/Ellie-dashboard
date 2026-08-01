/**
 * Raw fetch against the Addressr API (via RapidAPI) — no SDK, matching the
 * pattern in lib/twilio.ts and lib/resend.ts. Addressr matches against the
 * real GNAF (Geocoded National Address File) dataset, so a match means the
 * address genuinely exists, not just that it's plausibly formatted.
 */
type AddressrMatch = { sla: string; ssla: string; score: number; pid: string }

async function searchAddresses(query: string): Promise<AddressrMatch[]> {
  const apiKey = process.env.RAPIDAPI_ADDRESS_KEY
  if (!apiKey) throw new Error('RAPIDAPI_ADDRESS_KEY is not set')

  // Addressr searches all of Australia — an unscoped "Smith Street" pulls in
  // Queensland/Victoria/WA results ahead of anything in SA. This business
  // only services Adelaide, so every query is biased to South Australia.
  const res = await fetch(`https://addressr.p.rapidapi.com/addresses?q=${encodeURIComponent(`${query} SA`)}`, {
    headers: {
      'X-Rapidapi-Key': apiKey,
      'X-Rapidapi-Host': 'addressr.p.rapidapi.com',
    },
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Address search failed: ${res.status} ${detail}`)
  }

  return res.json()
}

// Adelaide metro is commonly bounded to the 5000–5199 postcode range —
// everything from 5200 up is Adelaide Hills, Fleurieu, Barossa, or further
// regional SA. Good enough for "roughly in our service area", not a legal boundary.
const METRO_POSTCODE_MAX = 5199

function parseSuburbPostcode(sla: string): { suburb: string; postcode: string } | null {
  // e.g. "106 JETTY RD, GLENELG SA 5045" -> { suburb: "GLENELG", postcode: "5045" }
  const match = sla.match(/,\s*([A-Z\s]+?)\s+SA\s+(\d{4})\s*$/)
  if (!match) return null
  return { suburb: match[1].trim(), postcode: match[2] }
}

function isMetro(postcode: string): boolean {
  return Number(postcode) <= METRO_POSTCODE_MAX
}

export type AddressLookupResult =
  | { status: 'not_found' }
  | { status: 'confirmed'; address: string; suburb: string; postcode: string; isMetro: boolean }
  | { status: 'ambiguous'; candidates: { suburb: string; postcode: string }[] }

/**
 * Looks up a caller-given address and decides whether it's a confident
 * single match or genuinely ambiguous (no suburb given, or a street name
 * that exists in more than one locality) — so the assistant can ask a
 * clarifying question instead of guessing which one they meant.
 *
 * When a street name collides across several small country towns *and* one
 * real Adelaide-metro suburb (common — "Smith St" exists in half a dozen SA
 * towns), the metro one wins outright rather than being offered alongside
 * towns this business will never actually service.
 */
export async function lookupAddress(query: string): Promise<AddressLookupResult> {
  const matches = await searchAddresses(query)
  if (matches.length === 0) return { status: 'not_found' }

  // Keep only the closest-scoring matches — a long tail of loosely-related
  // results shouldn't count as real candidates.
  const topScore = matches[0].score
  const strong = matches.filter(m => m.score >= topScore * 0.9)

  const distinctLocalities = new Map<string, { suburb: string; postcode: string }>()
  for (const m of strong) {
    const parsed = parseSuburbPostcode(m.sla)
    if (parsed) distinctLocalities.set(`${parsed.suburb}|${parsed.postcode}`, parsed)
  }

  if (distinctLocalities.size > 1) {
    const all = [...distinctLocalities.values()]
    const metroOnly = all.filter(c => isMetro(c.postcode))

    // Exactly one metro candidate among several regional ones for the same
    // street name — that's the one a caller from an Adelaide-servicing
    // business almost certainly means, not a genuine ambiguity.
    if (metroOnly.length === 1) {
      const winner = metroOnly[0]
      const best = strong.find(m => {
        const parsed = parseSuburbPostcode(m.sla)
        return parsed?.suburb === winner.suburb && parsed?.postcode === winner.postcode
      })
      if (best) {
        return { status: 'confirmed', address: best.sla, suburb: winner.suburb, postcode: winner.postcode, isMetro: true }
      }
    }

    // Otherwise it's genuinely ambiguous — prefer offering metro candidates
    // first (more likely to be what a local caller means), only falling
    // back to regional ones if nothing in the service area matched at all.
    const candidates = metroOnly.length > 0 ? metroOnly : all
    return { status: 'ambiguous', candidates: candidates.slice(0, 4) }
  }

  const best = matches[0]
  const parsed = parseSuburbPostcode(best.sla)
  if (!parsed) return { status: 'not_found' }

  return {
    status: 'confirmed',
    address: best.sla,
    suburb: parsed.suburb,
    postcode: parsed.postcode,
    isMetro: isMetro(parsed.postcode),
  }
}
