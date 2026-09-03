export type FeatureKey = 'appointments' | 'staff'

export type DashboardFeatures = Partial<Record<FeatureKey, boolean>>

export const FEATURE_REGISTRY: { key: FeatureKey; label: string; description: string }[] = [
  { key: 'appointments', label: 'Appointments', description: 'Appointments nav page and in-dashboard booking list.' },
  { key: 'staff',        label: 'Staff',         description: 'Staff subsection in Briefing and the staff column/filter on Appointments.' },
]

/**
 * A key absent from `dashboard_features` (or an unset column) means
 * enabled — only an explicit `false` disables a section. This keeps every
 * existing business's dashboard unchanged on rollout and lets future
 * toggles ship with no backfill.
 */
export function isFeatureEnabled(
  business: { dashboard_features?: DashboardFeatures | null } | null | undefined,
  key: FeatureKey,
): boolean {
  return business?.dashboard_features?.[key] !== false
}

export function resolveDashboardFeatures(
  business: { dashboard_features?: DashboardFeatures | null } | null | undefined,
): Record<FeatureKey, boolean> {
  return Object.fromEntries(
    FEATURE_REGISTRY.map(({ key }) => [key, isFeatureEnabled(business, key)]),
  ) as Record<FeatureKey, boolean>
}
