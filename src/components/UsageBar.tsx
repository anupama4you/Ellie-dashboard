/**
 * Just the progress-bar visual — extracted because AnalyticsCharts, Sidebar,
 * and admin ClientRow each used to hand-roll this same two-div bar
 * independently (with inconsistent thresholds: 70/90 vs 80/100). Text
 * labels/copy stay bespoke per caller since they already differ in format
 * across those three surfaces; this only dedupes the part that would
 * otherwise triple when a second metric (SMS, alongside call minutes) was
 * added. `pct` null (uncapped) renders an empty track.
 */
export default function UsageBar({
  pct,
  trackColor = 'var(--paper)',
  height = 'md',
}: {
  pct: number | null
  trackColor?: string
  height?: 'sm' | 'md'
}) {
  const barPct = Math.min(pct ?? 0, 100)
  const color = (pct ?? 0) >= 90 ? 'var(--coral)' : (pct ?? 0) >= 70 ? 'var(--amber)' : 'var(--signal)'
  const h = height === 'sm' ? 'h-1.5' : 'h-2'

  return (
    <div className={`${h} rounded-full overflow-hidden`} style={{ background: trackColor }}>
      <div className={`h-full rounded-full transition-all duration-700`} style={{ width: `${barPct}%`, background: color }} />
    </div>
  )
}
