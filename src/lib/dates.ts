/**
 * Postgres/Vapi timestamps come back as UTC ISO strings. `date.toISOString().slice(0, 10)`
 * silently rolls over to the wrong calendar day in any positive-UTC-offset timezone
 * (e.g. Australia) — local midnight converts to the previous day in UTC. Always
 * derive day-bucket keys from a Date's *local* components instead.
 */
export function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
