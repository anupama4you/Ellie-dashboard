# Admin-configurable dashboard feature visibility

Status: approved for planning
Date: 2026-09-04

## Context

Two onboarding clients exposed a gap: the dashboard currently shows every
section to every client, with no way to turn parts of it off.

- A salon client uses Timely for bookings and manually sends customers a
  Timely link — Ellie never books directly for them, and they don't want
  staff information anywhere on the dashboard.
- A separate, larger client (multi-location, future ERP integration,
  outbound calling) will need its own set of dashboard sections that don't
  apply to smaller single-location clients, and vice versa.

This is sub-project 1 of a four-part decomposition (admin-configurable
visibility → multi-location support → outbound calling campaigns → ERP
integration, the last left as a future extension point). This spec covers
only the visibility-control mechanism. It is intentionally decoupled from
Vapi assistant/tool configuration — whether Ellie *actually* has the
`bookAppointment` tool attached stays a separate, manual admin step via the
existing Prompt tab (`applyDraftAndPushPrompt()`), unaffected by this
feature.

## Goals

- Admin can hide/show a defined set of dashboard sections on a per-client
  basis, from the existing admin client-edit page.
- Existing clients see no change on rollout — everything defaults to
  visible.
- A hidden section is unreachable both via nav and via direct URL, not just
  visually removed.
- The mechanism generalizes to future toggles (e.g. an "Outbound
  Campaigns" section in sub-project 3) without a new migration per toggle.

## Non-goals

- No effect on Vapi assistant tools, system prompt, or the Briefing
  draft/live pipeline.
- No per-field granularity (e.g. hiding one field within a page) — toggles
  are whole-section only, per the two concrete cases at hand
  (`appointments`, `staff`).
- No client-facing UI to see/change their own feature set — admin-only.

## Data model

One new column, following the repo's existing single-purpose-migration
convention (`supabase-schema-*.sql` / `supabase/migrations/*.sql`):

```sql
alter table public.businesses
  add column if not exists dashboard_features jsonb not null default '{}'::jsonb;
```

Semantics: a key **absent** from the object means *enabled*. Admin sets a
key to `false` to disable it; `true` is never written but is treated the
same as absent for forward-compatibility. This means:

- Existing rows (`{}`) keep 100% of today's dashboard with zero backfill.
- Adding a new toggle in the future (sub-project 3) needs no migration —
  just a new registry entry; every existing business implicitly has it
  enabled.

## Feature registry

New file `src/lib/dashboardFeatures.ts` — the single source of truth for
what can be toggled:

```ts
export type FeatureKey = 'appointments' | 'staff'

export const FEATURE_REGISTRY: { key: FeatureKey; label: string; description: string }[] = [
  { key: 'appointments', label: 'Appointments', description: 'Appointments nav page and in-dashboard booking list.' },
  { key: 'staff',        label: 'Staff',         description: 'Staff subsection in Briefing and the staff column/filter on Appointments.' },
]

export function isFeatureEnabled(business: { dashboard_features?: Record<string, boolean> | null }, key: FeatureKey): boolean {
  return business.dashboard_features?.[key] !== false
}
```

A thin `resolveDashboardFeatures(business)` helper returns
`Record<FeatureKey, boolean>` for callers (layout, Sidebar) that want the
whole set at once rather than checking one key.

## Enforcement points

- **`src/app/(dashboard)/layout.tsx`**: resolves the business's features
  once (already fetches `business` via `getCurrentBusiness()`) and passes
  the resolved set as a new `features` prop to `Sidebar`.
- **`src/components/Sidebar.tsx`**: filters the static `NAV` array against
  `features.appointments` before rendering — a disabled feature's nav item
  doesn't render. `Staff` has no nav entry today, so nothing changes here
  for that key.
- **`src/app/(dashboard)/appointments/page.tsx`**: checks
  `isFeatureEnabled(business, 'appointments')` server-side at the top of
  the page and `redirect('/')`s if disabled, so the route is unreachable
  even by direct URL. Independently, when `staff` is disabled, the page
  omits the staff column/name (line ~403-435) and the staff picker/filter
  (lines ~233, ~493-494) — it does not need the `staff` business_staff
  query at all in that case.
- **`src/app/(dashboard)/briefing/page.tsx`**: when `staff` is disabled,
  skips the `business_staff` query and omits `initialStaff`/the Staff
  subsection from what's passed to the briefing form component. Briefing's
  save action (`actions.ts`) is left untouched — if a business already has
  staff rows, hiding the section doesn't delete or corrupt that data, it
  just stops being editable through the UI while hidden.

## Admin UI

New "Features" section added to the existing
`src/app/admin/clients/[id]/page.tsx` (which already hosts plan/trial/etc.
controls for a client) — a checkbox per `FEATURE_REGISTRY` entry, checked
by default (absent key = enabled), reflecting the business's current
`dashboard_features`.

New server action in `src/app/admin/clients/[id]/actions.ts`, following
the existing action patterns in that file (e.g. `generateInviteLinkAction`):

```ts
export async function updateDashboardFeaturesAction(businessId: string, features: Record<FeatureKey, boolean>)
```

Writes only the `false` keys into `dashboard_features` (omits `true`
entries, keeping stored data minimal and consistent with "absent =
enabled"). Takes effect immediately on save — no Apply & Push step, since
nothing here touches the Briefing draft/live pipeline or Vapi.

## Testing

- Unit test for `isFeatureEnabled`: default-true when key absent,
  respects an explicit `false`, treats explicit `true` same as absent.
- Manual verification pass on a test client:
  - Toggle off `appointments` + `staff` in admin → nav item disappears,
    `/appointments` direct navigation redirects to `/`, Briefing's Staff
    subsection is gone.
  - An untouched client's dashboard renders identically to before this
    change (nav, Appointments page, Briefing page all unchanged).

## Open questions

None outstanding — all scope decisions were confirmed during
brainstorming (whole-section granularity, default-on for existing
clients, admin-only placement on the existing client-edit page, and no
coupling to Vapi tool config).
