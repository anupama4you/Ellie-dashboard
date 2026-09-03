# Admin-Configurable Dashboard Feature Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin hide/show whole dashboard sections (starting with Appointments and Staff) per client, from the existing admin client-edit page, with zero behavior change for clients who aren't touched.

**Architecture:** One jsonb column (`businesses.dashboard_features`) where an absent key means "enabled." A small registry file (`src/lib/dashboardFeatures.ts`) is the single source of truth for what's toggleable; the dashboard layout, Sidebar nav, Appointments page, and Briefing page all read through it to decide what to render. Admin edits it via a new checkbox card on `/admin/clients/[id]`.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase (Postgres jsonb column), Vitest for unit tests.

**Spec:** [docs/superpowers/specs/2026-09-04-dashboard-feature-visibility-design.md](../specs/2026-09-04-dashboard-feature-visibility-design.md)

## Global Constraints

- Existing clients (empty `dashboard_features`) must see **zero** behavior change — every registry key defaults to enabled when absent.
- This feature never touches Vapi assistant/tool config or the Briefing draft/live pipeline (`draft_briefing`, `applyDraftAndPushPrompt()`) — dashboard-visibility only.
- Toggles are whole-section only (no per-field granularity).
- Admin UI lives on the existing `/admin/clients/[id]` page — no new route.
- A disabled section must be unreachable by direct URL, not just hidden from nav.

---

## Task 1: Feature registry, migration, and unit tests

**Files:**
- Create: `supabase/migrations/20260904000000_dashboard_features.sql`
- Create: `src/lib/dashboardFeatures.ts`
- Test: `src/lib/dashboardFeatures.test.ts`

**Interfaces:**
- Consumes: nothing (foundational task).
- Produces:
  - `type FeatureKey = 'appointments' | 'staff'`
  - `type DashboardFeatures = Partial<Record<FeatureKey, boolean>>`
  - `const FEATURE_REGISTRY: { key: FeatureKey; label: string; description: string }[]`
  - `function isFeatureEnabled(business: { dashboard_features?: DashboardFeatures | null } | null | undefined, key: FeatureKey): boolean`
  - `function resolveDashboardFeatures(business: { dashboard_features?: DashboardFeatures | null } | null | undefined): Record<FeatureKey, boolean>`
  - DB column: `businesses.dashboard_features jsonb not null default '{}'::jsonb`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260904000000_dashboard_features.sql`:

```sql
-- Run this in your Supabase SQL editor.
-- Lets admins hide whole dashboard sections per client (e.g. a salon using
-- Timely for bookings doesn't need Appointments or Staff on their
-- dashboard at all). A key absent from the object means "enabled" — so
-- every existing business keeps its full current dashboard with zero
-- backfill, and future toggles need no new migration, just a new
-- FEATURE_REGISTRY entry in src/lib/dashboardFeatures.ts.

alter table public.businesses
  add column if not exists dashboard_features jsonb not null default '{}'::jsonb;
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/dashboardFeatures.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isFeatureEnabled, resolveDashboardFeatures } from './dashboardFeatures'

describe('isFeatureEnabled', () => {
  it('defaults to enabled when the key is absent', () => {
    expect(isFeatureEnabled({ dashboard_features: {} }, 'appointments')).toBe(true)
  })

  it('defaults to enabled when dashboard_features is null', () => {
    expect(isFeatureEnabled({ dashboard_features: null }, 'staff')).toBe(true)
  })

  it('defaults to enabled when business itself is null', () => {
    expect(isFeatureEnabled(null, 'staff')).toBe(true)
  })

  it('is disabled only on an explicit false', () => {
    expect(isFeatureEnabled({ dashboard_features: { appointments: false } }, 'appointments')).toBe(false)
  })

  it('treats an explicit true the same as absent', () => {
    expect(isFeatureEnabled({ dashboard_features: { staff: true } }, 'staff')).toBe(true)
  })
})

describe('resolveDashboardFeatures', () => {
  it('resolves every registry key, defaulting to true', () => {
    expect(resolveDashboardFeatures({ dashboard_features: { staff: false } })).toEqual({
      appointments: true,
      staff: false,
    })
  })

  it('resolves all-true for a business with no dashboard_features set', () => {
    expect(resolveDashboardFeatures({})).toEqual({
      appointments: true,
      staff: true,
    })
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dashboardFeatures.test.ts`
Expected: FAIL — `Cannot find module './dashboardFeatures'` (the file doesn't exist yet).

- [ ] **Step 4: Write the implementation**

Create `src/lib/dashboardFeatures.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dashboardFeatures.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Apply the migration locally**

Run: `npx supabase migration up` (or apply `supabase/migrations/20260904000000_dashboard_features.sql` directly in the Supabase SQL editor for the dev project, matching how existing `supabase-schema-*.sql`/migration files in this repo are applied).
Expected: `businesses` table now has a `dashboard_features` column, `not null default '{}'`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260904000000_dashboard_features.sql src/lib/dashboardFeatures.ts src/lib/dashboardFeatures.test.ts
git commit -m "$(cat <<'EOF'
Add dashboard_features column and feature-visibility registry

Foundation for admin-configurable dashboard sections: a jsonb column
where an absent key means "enabled," so every existing client's
dashboard is unaffected until an admin explicitly disables something.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Filter the sidebar nav by feature

**Files:**
- Modify: `src/components/Sidebar.tsx:11-20` (NAV array), `src/components/Sidebar.tsx:45-56` (Props type), `src/components/Sidebar.tsx:193` (render)
- Modify: `src/app/(dashboard)/layout.tsx:1-16` (imports, wiring), `src/app/(dashboard)/layout.tsx:72-91` (Sidebar props)

**Interfaces:**
- Consumes: `FeatureKey`, `resolveDashboardFeatures` from `src/lib/dashboardFeatures.ts` (Task 1).
- Produces: `Sidebar`'s new `features: Record<FeatureKey, boolean>` prop, read by later tasks' manual verification only (no other task imports from Sidebar).

- [ ] **Step 1: Add a `feature` key to the nav entry that needs gating, and a `features` prop to Sidebar**

In `src/components/Sidebar.tsx`, add the import and tag the Appointments entry:

```ts
import { LayoutDashboard, Phone, CalendarDays, Clock, MessageSquare, BarChart3, Building2, Plug, Settings, LogOut, ShieldCheck, X, Menu, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react'
import type { FeatureKey } from '@/lib/dashboardFeatures'
```

Replace the `NAV` array:

```ts
const NAV = [
  { href: '/',             label: 'Dashboard',           icon: LayoutDashboard },
  { href: '/calls',        label: 'Calls',               icon: Phone           },
  { href: '/appointments', label: 'Appointments',        icon: CalendarDays,   feature: 'appointments' as FeatureKey },
  { href: '/recordings',   label: 'Recordings',          icon: Clock           },
  { href: '/sms',          label: 'SMS log',             icon: MessageSquare   },
  { href: '/analytics',    label: 'Analytics',           icon: BarChart3       },
  { href: '/briefing',     label: 'Business', icon: Building2       },
  { href: '/integrations', label: 'Integrations',        icon: Plug            },
  { href: '/settings',     label: 'Settings',            icon: Settings        },
]
```

Add `features` to `Props` (after `phoneNumber`):

```ts
type Props = {
  businessName: string
  userEmail: string
  coveragePct: number
  streakDays: number
  isAdmin?: boolean
  usage?: PlanUsageSummary | null
  linePaused: boolean
  hasAssistant: boolean
  transferPhoneNumber: string | null
  phoneNumber: string | null
  features: Record<FeatureKey, boolean>
}
```

Add `features` to the destructured function params:

```ts
export default function Sidebar({
  businessName, userEmail, coveragePct, streakDays, isAdmin, usage,
  linePaused, hasAssistant, transferPhoneNumber, phoneNumber, features,
}: Props) {
```

- [ ] **Step 2: Filter NAV before rendering**

In `src/components/Sidebar.tsx`, replace:

```ts
{NAV.map(({ href, label, icon: Icon }) => {
```

with:

```ts
{NAV.filter(item => !item.feature || features[item.feature]).map(({ href, label, icon: Icon }) => {
```

- [ ] **Step 3: Wire `features` through the layout**

In `src/app/(dashboard)/layout.tsx`, add the import:

```ts
import { resolveDashboardFeatures } from '@/lib/dashboardFeatures'
```

Compute it alongside the other `biz`-derived values (right after `const isAdmin = ...` line) and pass it to `Sidebar`:

```ts
const isAdmin = Boolean(user?.email && user.email === process.env.ADMIN_EMAIL)
const features = resolveDashboardFeatures(biz)
```

```tsx
<Sidebar
  businessName={biz?.name ?? 'Your business'}
  userEmail={user?.email ?? ''}
  coveragePct={coveragePct}
  streakDays={streakDays}
  isAdmin={isAdmin}
  linePaused={biz?.line_paused ?? false}
  hasAssistant={!!biz?.vapi_assistant_id}
  transferPhoneNumber={biz?.transfer_phone_number ?? null}
  phoneNumber={biz?.twilio_phone_number ?? null}
  features={features}
  usage={usage ? {
```

(`resolveDashboardFeatures(biz)` is null-safe — `biz` can be `null` per `getCurrentBusiness()`'s return type, and `isFeatureEnabled` already treats a `null`/`undefined` business as "everything enabled," matching every other `biz?.` fallback already in this file.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, sign in as an existing test client whose `dashboard_features` is empty. Confirm the sidebar looks identical to before (all nav items present, Appointments included).

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "$(cat <<'EOF'
Filter sidebar nav by per-business dashboard features

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Guard the Appointments page and hide its staff UI

**Files:**
- Modify: `src/app/(dashboard)/appointments/page.tsx:1-14` (imports), `:82` (feature guard), `:129-148` (conditional staff fetch)

**Interfaces:**
- Consumes: `isFeatureEnabled` from `src/lib/dashboardFeatures.ts` (Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Import `redirect` and `isFeatureEnabled`**

In `src/app/(dashboard)/appointments/page.tsx`, add to the top of the file:

```ts
import { redirect } from 'next/navigation'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
```

- [ ] **Step 2: Redirect away when Appointments is disabled**

Replace:

```ts
  const { business: biz } = await getCurrentBusiness()
  const timeZone = biz?.timezone ?? 'Australia/Adelaide'
```

with:

```ts
  const { business: biz } = await getCurrentBusiness()
  if (!isFeatureEnabled(biz, 'appointments')) redirect('/')

  const timeZone = biz?.timezone ?? 'Australia/Adelaide'
  const showStaff = isFeatureEnabled(biz, 'staff')
```

- [ ] **Step 3: Skip the staff query when the `staff` feature is off**

Replace:

```ts
  const [{ data: appointments }, { data: servicesRaw }, { data: staffRaw }] = await Promise.all([
    supabase
      .from('appointments')
      .select('*')
      .eq('business_id', biz?.id)
      .neq('status', 'cancelled')
      .gte('scheduled_at', rangeStart.toISOString())
      .lte('scheduled_at', rangeEnd.toISOString())
      .order('scheduled_at', { ascending: true }),
    supabase.from('business_services').select('name, duration_minutes, price_cents').eq('business_id', biz?.id),
    // All rows, not just active — a past appointment tied to a deactivated staff member should still show their name.
    supabase.from('business_staff').select('id, name, active').eq('business_id', biz?.id).order('sort_order'),
  ])
```

with:

```ts
  const [{ data: appointments }, { data: servicesRaw }, { data: staffRaw }] = await Promise.all([
    supabase
      .from('appointments')
      .select('*')
      .eq('business_id', biz?.id)
      .neq('status', 'cancelled')
      .gte('scheduled_at', rangeStart.toISOString())
      .lte('scheduled_at', rangeEnd.toISOString())
      .order('scheduled_at', { ascending: true }),
    supabase.from('business_services').select('name, duration_minutes, price_cents').eq('business_id', biz?.id),
    // All rows, not just active — a past appointment tied to a deactivated staff member should still show their name.
    // Skipped entirely when the `staff` feature is off — nothing here writes
    // staff data back, so an empty list only affects what's displayed
    // (name pill, picker in AddAppointmentModal/AppointmentActions both
    // already guard on `staff.length > 0`), not what's stored.
    showStaff
      ? supabase.from('business_staff').select('id, name, active').eq('business_id', biz?.id).order('sort_order')
      : Promise.resolve({ data: [] as { id: string; name: string; active: boolean }[] }),
  ])
```

No other change is needed on this page — `allStaff`/`activeStaff`/`staffNameById` (already derived from `staffRaw`) become empty automatically, which collapses to the same "no staff configured" rendering path the page already supports for single-provider businesses (staff name pill, `AddAppointmentModal`'s and `AppointmentActions`' staff pickers all already gate on `staff.length > 0`).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

In the admin panel (once Task 5 lands) or directly in Supabase, set a test client's `dashboard_features` to `{"appointments": false}`. Confirm:
- `/appointments` redirects to `/` when visited directly.
- The nav item is gone (from Task 2).

Then set it to `{"staff": false}` (with `appointments` enabled) and confirm on `/appointments`:
- No staff name pill on any appointment.
- "Add appointment" and "edit appointment" modals show no staff picker.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/appointments/page.tsx
git commit -m "$(cat <<'EOF'
Gate the Appointments page and its staff UI on dashboard features

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Hide the Staff subsection in Briefing

**Files:**
- Modify: `src/app/(dashboard)/briefing/page.tsx`
- Modify: `src/components/BriefingEditor.tsx:78-84` (Props type), `:92-96` (destructure), `:414-469` (Team section)

**Interfaces:**
- Consumes: `isFeatureEnabled` from `src/lib/dashboardFeatures.ts` (Task 1).
- Produces: `BriefingEditor`'s new `showStaff?: boolean` prop.

- [ ] **Step 1: Compute and pass `showStaff` from the Briefing page**

In `src/app/(dashboard)/briefing/page.tsx`, add the import:

```ts
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
```

Note: the `business_staff` query stays exactly as it is — staff data must still be fetched and round-tripped through `saveBriefing()` even when the section is hidden, so an unrelated save (e.g. editing hours) can't silently wipe an existing staff roster out of `draft_briefing`. Only the *rendering* is gated, via the new prop below.

Add, right after `const resolved = resolveBriefing(...)`:

```ts
  const showStaff = isFeatureEnabled(biz, 'staff')
```

Add `showStaff={showStaff}` to the `<BriefingEditor>` call:

```tsx
        <BriefingEditor
          businessId={biz.id}
          businessName={biz.name}
          initialGreeting={resolved.greetingScript}
          initialCustomInstructions={resolved.customInstructions}
          initialHours={resolved.hours}
          initialTransferRules={resolved.transferRules}
          initialTransferPhoneNumber={resolved.transferPhoneNumber}
          initialServices={resolved.services}
          initialStaff={resolved.staff}
          initialFaqs={resolved.faqs}
          initialCompanyInfo={resolved.companyInfo}
          isPendingReview={resolved.isDraft}
          showStaff={showStaff}
        />
```

- [ ] **Step 2: Add the `showStaff` prop to BriefingEditor**

In `src/components/BriefingEditor.tsx`, add to the `Props` type (after `isPendingReview?: boolean`):

```ts
  isPendingReview?: boolean
  showStaff?: boolean
}
```

Add to the destructured params, with a default of `true` so every other caller (there are none today, but this keeps the prop optional and safe) keeps current behavior:

```ts
export default function BriefingEditor({
  businessId, businessName, initialGreeting, initialCustomInstructions,
  initialHours, initialTransferRules, initialTransferPhoneNumber, initialServices, initialStaff, initialFaqs, initialCompanyInfo,
  isPendingReview, showStaff = true,
}: Props) {
```

- [ ] **Step 3: Wrap the Team section**

In `src/components/BriefingEditor.tsx`, wrap the existing Team `<section>` (currently lines 414-469, from the `{/* Team */}` comment through its closing `</section>`) in a `showStaff` check:

```tsx
          {/* Team */}
          {showStaff && (
          <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Team</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>Ellie can offer and book against a specific person</p>
              </div>
              <button
                onClick={() => setStaff(s => [...s, { name: '', active: true, hours: null }])}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <Plus size={12} /> Add
              </button>
            </div>
            {staff.length === 0 && <p className="px-5 py-6 text-sm" style={{ color: 'var(--t3)' }}>No team members added — Ellie will treat this as a single-provider business</p>}
            {staff.map((member, i) => (
              <div key={i} className="flex flex-col gap-2 px-5 py-3" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <div className="flex items-center gap-2">
                  <input
                    value={member.name}
                    onChange={e => setStaff(s => s.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    placeholder="Staff member's name"
                    className="flex-1 text-sm rounded-lg px-2.5 py-1.5 min-w-0"
                    style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <button
                    onClick={() => setStaff(s => s.map((x, j) => j === i ? { ...x, active: !x.active } : x))}
                    role="switch" aria-checked={member.active}
                    title={member.active ? 'Active — Ellie can offer them' : 'Inactive — hidden from Ellie, past appointments unaffected'}
                    className="w-[38px] h-[22px] rounded-full relative shrink-0"
                    style={{ background: member.active ? 'var(--signal)' : 'var(--border)' }}
                  >
                    <span className="absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all" style={{ left: member.active ? 19 : 3 }} />
                  </button>
                  <button onClick={() => setStaff(s => s.filter((_, j) => j !== i))} className="shrink-0" style={{ color: 'var(--coral)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>

                <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--t3)' }}>
                  <input
                    type="checkbox"
                    checked={member.hours != null}
                    onChange={e => setStaff(s => s.map((x, j) => j === i ? { ...x, hours: e.target.checked ? hours : null } : x))}
                  />
                  Custom hours (unchecked = works the business&apos;s hours above)
                </label>
                {member.hours && (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    <HoursGrid hours={member.hours} onChange={next => setStaff(s => s.map((x, j) => j === i ? { ...x, hours: next } : x))} />
                  </div>
                )}
              </div>
            ))}
          </section>
          )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

With a test client's `dashboard_features` set to `{"staff": false}`, visit `/briefing` and confirm the Team section is gone entirely (no header, no "Add" button, no empty-state text). Save an unrelated field (e.g. toggle a business hour) and confirm — by checking `draft_briefing` in Supabase — that any pre-existing `staff` array in the draft is unchanged, not emptied.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/briefing/page.tsx src/components/BriefingEditor.tsx
git commit -m "$(cat <<'EOF'
Hide the Briefing Staff section when the staff feature is off

Staff data is still fetched and round-tripped through saves — only
rendering is gated — so disabling the feature can't silently wipe an
existing staff roster out of draft_briefing via an unrelated save.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Admin UI to toggle features per client

**Files:**
- Modify: `src/app/admin/clients/[id]/page.tsx` (imports, `features` computation, new inline server action, new card in the right column)

**Interfaces:**
- Consumes: `FeatureKey`, `FEATURE_REGISTRY`, `resolveDashboardFeatures` from `src/lib/dashboardFeatures.ts` (Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Import the registry and resolve current features**

At the top of `src/app/admin/clients/[id]/page.tsx`, add:

```ts
import { FEATURE_REGISTRY, resolveDashboardFeatures } from '@/lib/dashboardFeatures'
```

Right after the existing primitive captures (after the `bizAccountDisabled` line), add:

```ts
  const dashboardFeatures = resolveDashboardFeatures(biz)
```

- [ ] **Step 2: Add the server action**

Add this inline action alongside the other `'use server'` closures in the same file (e.g. right after `toggleAccountDisabledAction`):

```ts
  /** Only explicit `false`s are stored — an unchecked box disables that key, a checked one is simply omitted (absent = enabled). */
  async function updateDashboardFeaturesAction(formData: FormData) {
    'use server'
    const admin = createAdminClient()
    const dashboard_features = Object.fromEntries(
      FEATURE_REGISTRY
        .filter(({ key }) => formData.get(key) !== 'on')
        .map(({ key }) => [key, false]),
    )
    await admin.from('businesses').update({ dashboard_features }).eq('id', bizId)
    redirect(`/admin/clients/${bizId}?saved=1`)
  }
```

- [ ] **Step 3: Add the Features card**

In the right column (`{/* Right column: plan/trial + account + danger zone */}`), insert a new card between the "Account" card's closing `</div>` and the `{/* Danger zone ... */}` comment:

```tsx
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--b3)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Dashboard Features</h2>
              </div>
              <form action={updateDashboardFeaturesAction} className="p-5 flex flex-col gap-3">
                {FEATURE_REGISTRY.map(({ key, label, description }) => (
                  <label key={key} className="flex items-start gap-2.5 text-sm cursor-pointer">
                    <input type="checkbox" name={key} defaultChecked={dashboardFeatures[key]} className="mt-0.5" />
                    <span>
                      <span className="font-medium block" style={{ color: 'var(--text)' }}>{label}</span>
                      <span className="text-xs block mt-0.5" style={{ color: 'var(--t3)' }}>{description}</span>
                    </span>
                  </label>
                ))}
                <AdminSubmitButton
                  pendingLabel="Saving…"
                  className="w-full rounded-xl py-2.5 text-sm font-semibold mt-1 transition-all"
                  style={{ color: 'var(--violet)', background: 'rgba(109,74,255,0.07)', border: '1px solid rgba(109,74,255,0.18)' }}>
                  Save Features
                </AdminSubmitButton>
              </form>
            </div>

```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open `/admin/clients/[id]` for a test client. Confirm:
- Both checkboxes are checked by default (existing client, empty `dashboard_features`).
- Unchecking "Appointments" and saving redirects with `?saved=1`, and the client's `businesses.dashboard_features` row now reads `{"appointments": false}`.
- Re-opening the page shows the "Appointments" box unchecked and "Staff" still checked.
- Re-checking "Appointments" and saving clears it back to `{}`.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/clients/\[id\]/page.tsx
git commit -m "$(cat <<'EOF'
Add admin UI to toggle per-client dashboard features

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: End-to-end verification for the salon-client scenario

**Files:** none (verification only, no code changes expected)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: nothing (terminal task).

- [ ] **Step 1: Run the full automated suite**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 2: Full manual walkthrough on a disposable test client**

Using a test client created via `/admin/clients/new` (or an existing non-production test row):

1. In `/admin/clients/[id]`, uncheck both "Appointments" and "Staff", save.
2. Log in as that client (or impersonate via the client's dashboard URL if that's the existing admin workflow). Confirm:
   - Sidebar has no "Appointments" item.
   - Visiting `/appointments` directly redirects to `/`.
   - `/briefing` has no "Team" section.
   - Every other page (Calls, Recordings, SMS log, Analytics, Business/Briefing minus Team, Integrations, Settings) is unchanged.
3. In `/admin/clients/[id]`, re-check both boxes, save. Confirm the client's dashboard is back to normal (nav item returns, `/appointments` loads, Team section is back with whatever staff was there before — unchanged, not reset).
4. Open a second, untouched test client (empty `dashboard_features`) and confirm its dashboard renders exactly as it did before this feature shipped — nav, Appointments, Briefing all present.

- [ ] **Step 3: Note completion**

No commit for this task — it's verification only. If any step in the walkthrough fails, fix it as part of the task whose file caused it (do not silently patch here) and re-run this task's checklist.
