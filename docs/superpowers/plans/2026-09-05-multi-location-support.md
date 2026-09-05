# Multi-location support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client operate several locations under one dashboard login, switching between them, with zero visible change for today's single-location clients.

**Architecture:** No new tables or columns — a "client account" is simply the set of `businesses` rows sharing one `user_id` (RLS already tolerates this: `business_id in (select id from businesses where user_id = auth.uid())` is an `in`, not `=`). A `selected_business_id` cookie, validated server-side against the caller's own rows on every read, picks which location is "current"; a location switcher in the Sidebar (rendered only when a user has more than one row) writes that cookie via a server action.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase (Postgres + Auth, `@supabase/ssr`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-multi-location-support-design.md`

## Global Constraints

- No new database tables or columns — every change is application code.
- Cookie name is exactly `selected_business_id`, httpOnly, `sameSite: 'lax'`.
- An id read from a cookie or submitted from a form must be re-validated against the current user's own `businesses` rows server-side before use — never trust it directly in a query filter.
- A user with exactly one `businesses` row must see **zero** visible or behavioral change anywhere in this plan (dashboard, admin client list, admin client page) — every UI addition is conditional on `businesses.length > 1` / a sibling-locations count > 0.
- Follow existing code conventions in each file touched (inline `'use server'` closures in admin pages, `admin-input`/`admin-select` classes, the existing color/style tokens) rather than introducing new patterns.

---

### Task 1: Pure location-resolution logic + tests

**Files:**
- Modify: `src/lib/business.ts`
- Test: `src/lib/business.test.ts` (new)

**Interfaces:**
- Produces: `SELECTED_BUSINESS_COOKIE: string`; `resolveSelectedBusinessId<T extends { id: string }>(businesses: T[], cookieBusinessId: string | undefined): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/business.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveSelectedBusinessId } from './business'

describe('resolveSelectedBusinessId', () => {
  const businesses = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
  ]

  it('returns null when there are no businesses', () => {
    expect(resolveSelectedBusinessId([], 'a')).toBeNull()
  })

  it('returns the oldest (first) business when no cookie is set', () => {
    expect(resolveSelectedBusinessId(businesses, undefined)).toBe('a')
  })

  it('returns the cookie value when it matches one of the businesses', () => {
    expect(resolveSelectedBusinessId(businesses, 'b')).toBe('b')
  })

  it('falls back to the oldest business when the cookie references a business not in the list', () => {
    expect(resolveSelectedBusinessId(businesses, 'not-owned-or-deleted')).toBe('a')
  })

  it('falls back to the only business for a single-location user even with a stale cookie', () => {
    expect(resolveSelectedBusinessId([{ id: 'only' }], 'some-other-id')).toBe('only')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/business.test.ts`
Expected: FAIL — `resolveSelectedBusinessId` is not exported from `./business` (the function doesn't exist yet).

- [ ] **Step 3: Add the constant and pure function to `src/lib/business.ts`**

Add near the top of the file, after the `AppUser` type declaration:

```ts
export const SELECTED_BUSINESS_COOKIE = 'selected_business_id'

/**
 * Picks which of a user's business rows (locations) is "current." A cookie
 * value that matches one of their own rows wins; otherwise (no cookie, a
 * stale cookie from a deleted location, or one belonging to someone else)
 * falls back to the oldest row — the same single business a one-location
 * client has always seen. Pure and DB-free so it's unit-testable without
 * mocking Supabase or Next's cookie jar.
 */
export function resolveSelectedBusinessId<T extends { id: string }>(
  businesses: T[],
  cookieBusinessId: string | undefined,
): string | null {
  if (businesses.length === 0) return null
  if (cookieBusinessId && businesses.some(b => b.id === cookieBusinessId)) return cookieBusinessId
  return businesses[0].id
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/business.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/business.ts src/lib/business.test.ts
git commit -m "$(cat <<'EOF'
Add pure location-selection resolver for multi-location support

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `getUserBusinesses`, `getSelectedBusinessId`, and rewritten `getCurrentBusiness`

**Files:**
- Modify: `src/lib/business.ts`

**Interfaces:**
- Consumes: `resolveSelectedBusinessId`, `SELECTED_BUSINESS_COOKIE` (Task 1)
- Produces: `getUserBusinesses(supabase: SupabaseClient, userId: string): Promise<any[]>` (rows ordered oldest-first); `getSelectedBusinessId(supabase: SupabaseClient, userId: string): Promise<string | null>`; `getCurrentBusiness(): Promise<{ user: AppUser | null; business: any | null; businesses: any[] }>` — note the added `businesses` field on the return value, which callers in later tasks (layout, `setLineActive`, the API routes) rely on.

- [ ] **Step 1: Replace the full contents of `src/lib/business.ts`**

```ts
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

type AppUser = { id: string; email: string | undefined }

export const SELECTED_BUSINESS_COOKIE = 'selected_business_id'

/**
 * Picks which of a user's business rows (locations) is "current." A cookie
 * value that matches one of their own rows wins; otherwise (no cookie, a
 * stale cookie from a deleted location, or one belonging to someone else)
 * falls back to the oldest row — the same single business a one-location
 * client has always seen. Pure and DB-free so it's unit-testable without
 * mocking Supabase or Next's cookie jar.
 */
export function resolveSelectedBusinessId<T extends { id: string }>(
  businesses: T[],
  cookieBusinessId: string | undefined,
): string | null {
  if (businesses.length === 0) return null
  if (cookieBusinessId && businesses.some(b => b.id === cookieBusinessId)) return cookieBusinessId
  return businesses[0].id
}

/** All of a user's locations (businesses rows sharing one user_id), oldest first. */
export async function getUserBusinesses(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  return data ?? []
}

/** The id of whichever of the user's locations is currently selected — see resolveSelectedBusinessId. */
export async function getSelectedBusinessId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const businesses = await getUserBusinesses(supabase, userId)
  const cookieStore = await cookies()
  return resolveSelectedBusinessId(businesses, cookieStore.get(SELECTED_BUSINESS_COOKIE)?.value)
}

/**
 * The dashboard layout and every page under it each need the current user's
 * selected business row (location) plus the full list of their locations,
 * for the location switcher. `cache()` dedupes this to one auth check + one
 * businesses query per request (layout + page render in the same request).
 *
 * proxy.ts already ran a real, server-verified auth.getUser() for this exact
 * request and forwards the result via trusted headers — reuse that instead
 * of paying for a second Auth-server round trip on every page render. Only
 * routes proxy.ts's matcher excludes (currently /api/*) won't have these
 * set, so fall back to a real check there.
 */
export const getCurrentBusiness = cache(async () => {
  const supabase = await createClient()

  const hdrs = await headers()
  const verifiedId = hdrs.get('x-verified-user-id')

  let user: AppUser | null
  if (verifiedId) {
    user = { id: verifiedId, email: hdrs.get('x-verified-user-email') || undefined }
  } else {
    const { data } = await supabase.auth.getUser()
    user = data.user ? { id: data.user.id, email: data.user.email } : null
  }

  if (!user) return { user: null, business: null, businesses: [] }

  const businesses = await getUserBusinesses(supabase, user.id)
  const cookieStore = await cookies()
  const selectedId = resolveSelectedBusinessId(businesses, cookieStore.get(SELECTED_BUSINESS_COOKIE)?.value)
  const business = businesses.find(b => b.id === selectedId) ?? null

  return { user, business, businesses }
})
```

- [ ] **Step 2: Run the existing test suite to confirm nothing else broke**

Run: `npx vitest run src/lib/business.test.ts`
Expected: PASS (still 5 tests — this step only added async DB-dependent functions around the pure one, which aren't independently unit-tested here since they require a live Supabase connection; they're covered by the manual verification pass in Task 10)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. (This will surface any caller currently destructuring `getCurrentBusiness()`'s result in a way incompatible with the added `businesses` field — there should be none, since `businesses` is additive.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/business.ts
git commit -m "$(cat <<'EOF'
Resolve current business from a validated per-user location list

getCurrentBusiness() now returns every business row the logged-in user
owns alongside the currently-selected one, picked via a validated cookie
with an oldest-row fallback — the foundation for multi-location support.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `selectLocationAction` and fix `setLineActive`'s single-business assumption

**Files:**
- Modify: `src/app/(dashboard)/actions.ts`

**Interfaces:**
- Consumes: `getUserBusinesses`, `getSelectedBusinessId`, `SELECTED_BUSINESS_COOKIE` (Task 2/1, from `@/lib/business`)
- Produces: `selectLocationAction(businessId: string): Promise<void>` (redirects to `/` on success; throws on an unowned id)

- [ ] **Step 1: Replace the full contents of `src/app/(dashboard)/actions.ts`**

```ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { setTwilioVoiceUrl, VAPI_INBOUND_VOICE_URL } from '@/lib/twilio'
import { toE164Au } from '@/lib/sms'
import { getUserBusinesses, getSelectedBusinessId, SELECTED_BUSINESS_COOKIE } from '@/lib/business'

/**
 * Pauses or resumes Ellie answering the currently-selected location's
 * number, from the sidebar toggle. Works entirely at the Twilio level —
 * repoints the number's VoiceUrl at a plain call-forwarding TwiML endpoint
 * (paused) or back at Vapi's own inbound handler (active). Deliberately
 * doesn't touch Vapi's phone-number `assistantId`/`fallbackDestination` —
 * that path proved unreliable for Twilio-imported numbers in testing (calls
 * fell through to Twilio's own voicemail instead of the configured fallback).
 */
export async function setLineActive(active: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const businessId = await getSelectedBusinessId(supabase, user.id)
  if (!businessId) throw new Error('No business profile found.')

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, twilio_phone_number, transfer_phone_number')
    .eq('id', businessId)
    .single()
  if (!biz) throw new Error('No business profile found.')
  if (!biz.twilio_phone_number) throw new Error('No phone number connected to this business yet.')

  if (!active && !biz.transfer_phone_number) {
    throw new Error('Set a "Number to transfer calls to" on your Business page before pausing — otherwise callers would have nowhere to go.')
  }

  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL)?.replace(/\/$/, '')
  if (!active && !appUrl) throw new Error('APP_URL is not configured — contact support.')

  const voiceUrl = active
    ? VAPI_INBOUND_VOICE_URL
    : `${appUrl}/api/twilio-forward-call?to=${encodeURIComponent(toE164Au(biz.transfer_phone_number))}`

  await setTwilioVoiceUrl(biz.twilio_phone_number, voiceUrl)

  const { error } = await supabase.from('businesses').update({ line_paused: !active }).eq('id', biz.id)
  if (error) throw new Error(error.message)

  revalidatePath('/')
}

/**
 * Switches which of the current user's locations the dashboard shows.
 * Re-validates ownership against the DB rather than trusting the submitted
 * id — a forged businessId must never let a user view another client's
 * location. Redirecting to `/` (rather than revalidating the current path)
 * keeps things simple: a page mid-render against one location's data (e.g.
 * a specific call's detail pane) can't end up showing another location's
 * record under the same URL.
 */
export async function selectLocationAction(businessId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const businesses = await getUserBusinesses(supabase, user.id)
  if (!businesses.some(b => b.id === businessId)) {
    throw new Error('That location does not belong to your account.')
  }

  const cookieStore = await cookies()
  cookieStore.set(SELECTED_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  redirect('/')
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/actions.ts
git commit -m "$(cat <<'EOF'
Add selectLocationAction; fix setLineActive for multi-location users

setLineActive previously resolved the caller's business via
.eq('user_id', ...).single(), which throws once a user owns more than
one location row. It now resolves the currently-selected location
instead.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Sidebar location switcher UI

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `selectLocationAction` (Task 3, from `@/app/(dashboard)/actions`)
- Produces: `Sidebar` now accepts two additional props: `businesses: { id: string; name: string }[]` and `currentBusinessId: string`. Later tasks (layout) must pass these.

- [ ] **Step 1: Update the import line and `Props` type**

In `src/components/Sidebar.tsx`, change:

```ts
import { setLineActive } from '@/app/(dashboard)/actions'
```

to:

```ts
import { setLineActive, selectLocationAction } from '@/app/(dashboard)/actions'
```

Then update the `Props` type (currently lines 46-57) by adding two fields:

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
  features: Record<FeatureKey, boolean>
  businesses: { id: string; name: string }[]
  currentBusinessId: string
}
```

- [ ] **Step 2: Destructure the new props and add the switch handler**

Update the function signature (currently lines 59-62):

```tsx
export default function Sidebar({
  businessName, userEmail, coveragePct, streakDays, isAdmin, usage,
  linePaused, hasAssistant, transferPhoneNumber, features,
  businesses, currentBusinessId,
}: Props) {
```

Add, alongside the other `useTransition` declaration (near line 69):

```ts
  const [isSwitchingLocation, startLocationSwitch] = useTransition()

  function handleLocationChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const businessId = e.target.value
    startLocationSwitch(() => {
      selectLocationAction(businessId)
    })
  }
```

- [ ] **Step 3: Render the switcher**

Insert this block right after the closing `</div>` of the "Brand" section (immediately after line 187, before the "Nav" section's `<div className={... uppercase ...}>Workspace</div>` label):

```tsx
      {businesses.length > 1 && (
        <div className={`px-2.5 pb-3 ${collapsed ? 'md:hidden' : ''}`}>
          <label className="text-[10px] tracking-widest uppercase block pb-1" style={{ color: '#736C90' }}>
            Location
          </label>
          <select
            value={currentBusinessId}
            onChange={handleLocationChange}
            disabled={isSwitchingLocation}
            className="w-full rounded-lg px-2.5 py-2 text-[0.82rem] font-medium disabled:opacity-60"
            style={{ background: 'var(--night-2)', color: '#fff', border: '1px solid var(--night-line)' }}
          >
            {businesses.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: errors at every current call site of `<Sidebar ... />` missing the two new required props (there is exactly one: `src/app/(dashboard)/layout.tsx`) — this is expected and fixed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "$(cat <<'EOF'
Add location switcher to Sidebar (hidden for single-location clients)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire the location list through `(dashboard)/layout.tsx`

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `getCurrentBusiness()` returning `{ user, business, businesses }` (Task 2); `Sidebar`'s `businesses`/`currentBusinessId` props (Task 4)

- [ ] **Step 1: Destructure `businesses` from `getCurrentBusiness()`**

Change line 14 from:

```ts
  const { user, business: biz } = await getCurrentBusiness()
```

to:

```ts
  const { user, business: biz, businesses } = await getCurrentBusiness()
```

- [ ] **Step 2: Pass the new props to `Sidebar`**

In the `<Sidebar ... />` call (currently lines 74-93), add two props — insert them right after `features={features}`:

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
          features={features}
          businesses={businesses.map(b => ({ id: b.id, name: b.name }))}
          currentBusinessId={biz?.id ?? ''}
          usage={usage ? {
            used: usage.used,
            limit: usage.limit,
            pct: usage.pct,
            isTrial: usage.isTrial,
            isUnlimited: usage.isUnlimited,
            trialDaysLeft: usage.trialDaysLeft,
            renewsLabel: formatInZone(usage.renewsAt, timeZone, { day: 'numeric', month: 'short' }),
          } : null}
        />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all existing tests, plus the 5 from Task 1).

- [ ] **Step 5: Manual check — single-location client unaffected**

Run: `npm run dev`, log in as any existing client (one `businesses` row). Confirm the sidebar renders exactly as before — no "Location" dropdown appears — since `businesses.length > 1` is false.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/layout.tsx
git commit -m "$(cat <<'EOF'
Pass the user's location list from layout into the Sidebar switcher

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Fix the Google Calendar OAuth callback's single-business assumption

**Files:**
- Modify: `src/app/api/google-calendar/callback/route.ts`

**Interfaces:**
- Consumes: `getSelectedBusinessId` (Task 2, from `@/lib/business`)

- [ ] **Step 1: Add the import**

At the top of `src/app/api/google-calendar/callback/route.ts`, add:

```ts
import { getSelectedBusinessId } from '@/lib/business'
```

- [ ] **Step 2: Replace the business lookup**

Change (currently lines 23-28):

```ts
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', base))

  const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).single()
  if (!biz) return NextResponse.redirect(new URL('/integrations?calendar=error', base))
```

to:

```ts
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', base))

  const businessId = await getSelectedBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.redirect(new URL('/integrations?calendar=error', base))
```

- [ ] **Step 3: Update the reference to `biz.id`**

Change (currently line 42):

```ts
      business_id: biz.id,
```

to:

```ts
      business_id: businessId,
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/google-calendar/callback/route.ts
git commit -m "$(cat <<'EOF'
Connect Google Calendar to the selected location, not a single-row lookup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Fix the two `/api/client/calls` routes' single-business assumption

**Files:**
- Modify: `src/app/api/client/calls/route.ts`
- Modify: `src/app/api/client/calls/[callId]/route.ts`

**Interfaces:**
- Consumes: `getSelectedBusinessId` (Task 2, from `@/lib/business`)

- [ ] **Step 1: Fix `src/app/api/client/calls/route.ts`**

Add the import at the top:

```ts
import { getSelectedBusinessId } from '@/lib/business'
```

Replace (currently lines 10-16):

```ts
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!biz) return Response.json({ error: 'No business found' }, { status: 404 })
```

with:

```ts
  const businessId = await getSelectedBusinessId(supabase, user.id)
  if (!businessId) return Response.json({ error: 'No business found' }, { status: 404 })
```

And update the query that follows (currently line 27) from `.eq('business_id', biz.id)` to `.eq('business_id', businessId)`.

- [ ] **Step 2: Fix `src/app/api/client/calls/[callId]/route.ts`**

Add the import at the top:

```ts
import { getSelectedBusinessId } from '@/lib/business'
```

Replace (currently lines 22-28):

```ts
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!biz) return Response.json({ error: 'Not found' }, { status: 404 })
```

with:

```ts
  const businessId = await getSelectedBusinessId(supabase, user.id)
  if (!businessId) return Response.json({ error: 'Not found' }, { status: 404 })
```

And update the query that follows (currently line 35) from `.eq('business_id', biz.id)` to `.eq('business_id', businessId)`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual check**

With the dev server running and logged in as a client with an active call in the `calls` table, open the Calls page and click into a call's detail — confirm both the list and the detail pane still load correctly.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/client/calls/route.ts "src/app/api/client/calls/[callId]/route.ts"
git commit -m "$(cat <<'EOF'
Scope the calls API routes to the selected location, not a single-row lookup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Admin — add a location to an existing client

**Files:**
- Modify: `src/app/admin/clients/[id]/page.tsx`

**Interfaces:**
- Produces: an inline `addLocationAction` server action (closure, following this file's existing pattern) that inserts a new `businesses` row sharing `userId` and redirects to that new location's Prompt tab.

- [ ] **Step 1: Add the `Link` and `Plus` imports**

Change the import lines at the top of `src/app/admin/clients/[id]/page.tsx` from:

```ts
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { Mail, Trash2, CheckCircle2, Sparkles, Send, Ban, ExternalLink, AlertTriangle } from 'lucide-react'
```

to:

```ts
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { Mail, Trash2, CheckCircle2, Sparkles, Send, Ban, ExternalLink, AlertTriangle, Plus } from 'lucide-react'
```

- [ ] **Step 2: Accept the new `locationError` search param**

Change the component signature's `searchParams` type and destructuring from:

```ts
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ reset?: string; saved?: string; paymentLink?: string }>
}) {
  const { id }                       = await params
  const { reset, saved, paymentLink } = await searchParams
```

to:

```ts
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ reset?: string; saved?: string; paymentLink?: string; locationError?: string }>
}) {
  const { id }                       = await params
  const { reset, saved, paymentLink, locationError } = await searchParams
```

- [ ] **Step 3: Fetch sibling locations**

Right after the existing `bizEnquiryConversionRate` line (currently line 61), add:

```ts
  const { data: siblingLocations } = await admin
    .from('businesses')
    .select('id, name, plan')
    .eq('user_id', userId)
    .neq('id', bizId)
    .order('created_at', { ascending: true })
```

- [ ] **Step 4: Add the `addLocationAction` server action**

Add this function alongside the other inline actions in the component (e.g. right after `updateDashboardFeaturesAction`, currently ending at line 239):

```ts
  /**
   * Adds another location to this same client login (a new businesses row
   * sharing userId) rather than creating a new auth user/invite — the
   * location joins the client's existing dashboard account. Mirrors
   * admin/clients/new/page.tsx's createClientAction's business-row fields.
   */
  async function addLocationAction(formData: FormData) {
    'use server'
    const admin = createAdminClient()

    const startTrial = formData.get('start_trial') === 'on'
    const now = new Date().toISOString()

    const { data: newBiz, error } = await admin.from('businesses').insert({
      user_id:           userId,
      name:              (formData.get('name') as string).trim(),
      phone:             (formData.get('phone') as string).trim() || null,
      plan:              formData.get('plan') as string,
      vapi_assistant_id: (formData.get('assistant_id') as string).trim() || null,
      plan_status:       startTrial ? 'trial' : 'active',
      trial_started_at:  startTrial ? now : null,
      plan_started_at:   now,
    }).select('id').single()

    if (error || !newBiz) {
      redirect(`/admin/clients/${bizId}?locationError=1`)
    }

    redirect(`/admin/clients/${newBiz.id}/prompt?created=1`)
  }
```

- [ ] **Step 5: Render the Locations card**

Add this card in the right column, between the "Dashboard Features" card and the "Danger Zone" `<details>` block (i.e. right after the closing `</div>` of the Dashboard Features card, before the `{/* Danger zone ... */}` comment currently at line 538):

```tsx
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--b3)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Locations</h2>
              </div>
              <div className="p-5 flex flex-col gap-3">
                {locationError === '1' && (
                  <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(221,81,64,0.07)', color: 'var(--coral)' }}>
                    Could not add that location. Please try again.
                  </div>
                )}

                {(siblingLocations ?? []).length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {(siblingLocations ?? []).map(loc => (
                      <Link key={loc.id} href={`/admin/clients/${loc.id}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors btn-ghost"
                        style={{ border: '1px solid var(--b4)', color: 'var(--text)' }}>
                        <span>{loc.name}</span>
                        <span className="capitalize" style={{ color: 'var(--t5)' }}>{loc.plan}</span>
                      </Link>
                    ))}
                  </div>
                )}

                <details className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b4)' }}>
                  <summary className="px-3.5 py-2.5 cursor-pointer text-xs font-semibold select-none list-none flex items-center gap-1.5"
                    style={{ color: 'var(--violet)' }}>
                    <Plus size={12} /> Add another location
                  </summary>
                  <form action={addLocationAction} className="p-3.5 pt-3 flex flex-col gap-3" style={{ borderTop: '1px solid var(--b4)' }}>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Location Name *</label>
                      <input type="text" name="name" required placeholder={`${bizName} — Perth`} className="admin-input" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Phone</label>
                      <input type="tel" name="phone" className="admin-input" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Plan *</label>
                      <select name="plan" defaultValue="core" className="admin-input admin-select">
                        {PLANS.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer"
                      style={{ background: 'rgba(109,74,255,0.06)', border: '1px solid rgba(109,74,255,0.18)' }}>
                      <input type="checkbox" name="start_trial" defaultChecked className="mt-0.5" style={{ accentColor: 'var(--violet)' }} />
                      <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                        Start {TRIAL_DAYS}-day free trial
                      </span>
                    </label>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium" style={{ color: 'var(--t3)' }}>Vapi Assistant ID</label>
                      <input type="text" name="assistant_id" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="admin-input" />
                    </div>
                    <AdminSubmitButton
                      pendingLabel="Adding…"
                      className="w-full rounded-xl py-2.5 text-sm font-bold text-white mt-1 transition-opacity hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))' }}>
                      Add Location
                    </AdminSubmitButton>
                  </form>
                </details>
              </div>
            </div>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Manual check**

Run `npm run dev`, open an existing client's admin edit page (`/admin/clients/[id]`), expand "Add another location," fill in a name/plan, submit. Confirm:
- You land on the new location's Prompt tab (`/admin/clients/<new-id>/prompt?created=1`).
- Going back to either the original or new location's `/admin/clients/[id]` page now shows the other one listed under "Locations."
- A client with no sibling locations (i.e. everyone else in the system right now) still sees the "Locations" card, just with an empty sibling list and the "Add another location" control — this is a new but harmless addition to every client's admin page, not gated behind anything, since admin-only additive UI doesn't violate the "zero change for single-location clients" constraint (that constraint is about the *client-facing* dashboard and the *admin client list*, not this one config surface admins already expect to see grow).

- [ ] **Step 8: Commit**

```bash
git add "src/app/admin/clients/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
Let admin add another location to an existing client's login

Inserts a new businesses row sharing the client's existing user_id
instead of creating a new auth user/invite, so the location joins their
current dashboard login per the multi-location design.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Admin client list — group locations under one login

**Files:**
- Modify: `src/app/admin/clients/page.tsx`

**Interfaces:**
- Produces: a local `ClientRow` component (extracted, not exported) taking `{ biz: any; usage: PlanUsage; email: string; isLast: boolean }` — identical rendering to today's per-row markup, reused for both single- and multi-location clients so single-location output is byte-for-byte unchanged.

- [ ] **Step 1: Add the `PlanUsage` type import**

Change the top of `src/app/admin/clients/page.tsx` from:

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Plus, Pencil, Building2, Clock, PhoneCall, Ban } from 'lucide-react'
import { getPlanUsage } from '@/lib/planUsage'
```

to:

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Plus, Pencil, Building2, Clock, PhoneCall, Ban } from 'lucide-react'
import { getPlanUsage, type PlanUsage } from '@/lib/planUsage'
```

- [ ] **Step 2: Extract `ClientRow`**

Add this function above `export default async function ClientsPage()`, after the `PLAN_STYLE` constant. Its body is copied verbatim from the current per-row JSX (currently lines 88-179 of the `list.map(...)` callback), with the `key`/`i < list.length - 1` bits replaced by an `isLast` prop and the `biz`/`usage`/`emailMap[biz.user_id]` references replaced by the new props:

```tsx
function ClientRow({ biz, usage, email, isLast }: { biz: any; usage: PlanUsage; email: string; isLast: boolean }) {
  const s = PLAN_STYLE[biz.plan] ?? PLAN_STYLE.core
  const hasAssistant = !!biz.vapi_assistant_id
  return (
    <div
      className="hover-row flex flex-col gap-2.5 px-4 py-4 md:grid md:items-center md:gap-3 md:px-5 transition-colors"
      style={{
        gridTemplateColumns: '2fr 2fr 1fr 1.2fr 1.3fr 80px',
        borderBottom: isLast ? 'none' : '1px solid var(--b4)',
      }}>
      <Link href={`/admin/clients/${biz.id}`} className="flex items-center gap-2 text-sm font-semibold truncate pr-2 hover:underline" style={{ color: 'var(--text)' }}>
        <span className="truncate">{biz.name}</span>
        {biz.account_disabled && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ color: 'var(--coral)', background: 'rgba(221,81,64,0.12)' }}
            title="Access disabled — client cannot log into the dashboard">
            <Ban size={9} /> Disabled
          </span>
        )}
        {biz.briefing_needs_review && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ color: 'var(--amber)', background: 'rgba(217,138,11,0.12)' }}
            title="Client updated their Briefing — needs review">
            <Clock size={9} /> Needs review
          </span>
        )}
      </Link>
      <span className="text-xs truncate pr-2" style={{ color: 'var(--t3)' }}>
        {email}
      </span>
      <span className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold capitalize"
          style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
          {biz.plan}
        </span>
        {usage.isTrial && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ color: 'var(--violet)', background: 'rgba(109,74,255,0.12)' }}>
            Trial
          </span>
        )}
      </span>
      {usage.isTrial ? (
        <div className="flex flex-col gap-1 pr-2">
          <span className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--violet)' }}>
            <PhoneCall size={10} /> {usage.used} calls (unlimited)
          </span>
          <span className="text-xs" style={{ color: 'var(--t4)' }}>
            {usage.trialDaysLeft != null && usage.trialDaysLeft > 0 ? `${usage.trialDaysLeft}d left` : 'Trial ended'}
          </span>
        </div>
      ) : usage.isUnlimited ? (
        <div className="flex flex-col gap-1 pr-2">
          <span className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--signal)' }}>
            <PhoneCall size={10} /> {usage.used} calls (no cap)
          </span>
          <span className="text-xs" style={{ color: 'var(--t4)' }}>Unlimited plan</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1 pr-2" title={`${usage.used} of ${usage.limit} calls used this cycle`}>
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--t3)' }}>
            <span className="flex items-center gap-1 font-semibold" style={{ color: (usage.pct ?? 0) >= 100 ? 'var(--coral)' : (usage.pct ?? 0) >= 80 ? 'var(--amber)' : 'var(--t2)' }}>
              <PhoneCall size={10} /> {usage.used}/{usage.limit}
            </span>
            <span>{usage.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--b4)' }}>
            <div className="h-full rounded-full"
              style={{
                width: `${Math.min(usage.pct ?? 0, 100)}%`,
                background: (usage.pct ?? 0) >= 100 ? 'var(--coral)' : (usage.pct ?? 0) >= 80 ? 'var(--amber)' : 'var(--signal)',
              }} />
          </div>
        </div>
      )}
      <span className="text-xs font-semibold flex items-center gap-1.5"
        style={{ color: hasAssistant ? 'var(--signal)' : 'var(--t5)' }}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: hasAssistant ? 'var(--signal)' : 'var(--t6)' }} />
        {hasAssistant ? 'Connected' : 'Not connected'}
      </span>
      <div className="flex items-center gap-1.5 justify-end">
        <Link href={`/admin/clients/${biz.id}/briefing`}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors btn-ghost shrink-0"
          style={{ color: 'var(--t7)' }}
          title="Company Information">
          <Building2 size={13} />
        </Link>
        <Link href={`/admin/clients/${biz.id}`}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors btn-ghost shrink-0"
          style={{ color: 'var(--t7)' }}
          title="Edit details">
          <Pencil size={13} />
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Group businesses by `user_id` and render groups**

Replace the body of `ClientsPage` from the `usageByBusiness` computation onward (currently lines 24-186) with:

```tsx
  const usageByBusiness = Object.fromEntries(
    await Promise.all(list.map(async biz => [
      biz.id,
      await getPlanUsage(
        admin, biz.id,
        { plan: biz.plan, planStatus: biz.plan_status, trialStartedAt: biz.trial_started_at, planStartedAt: biz.plan_started_at },
        biz.timezone ?? 'Australia/Adelaide',
      ),
    ]))
  )

  // Group locations sharing one login together — list is already newest-first
  // by created_at, so a group surfaces at the position of its most recently
  // created row. A user_id with exactly one row behaves identically to
  // before this change (rendered via the same ClientRow, no wrapper).
  const groups: { userId: string; rows: typeof list }[] = []
  const groupIndexByUserId = new Map<string, number>()
  for (const biz of list) {
    const idx = groupIndexByUserId.get(biz.user_id)
    if (idx === undefined) {
      groupIndexByUserId.set(biz.user_id, groups.length)
      groups.push({ userId: biz.user_id, rows: [biz] })
    } else {
      groups[idx].rows.push(biz)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Clients</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--t5)' }}>
              {list.length} client{list.length !== 1 ? 's' : ''} registered
            </p>
          </div>
          <Link href="/admin/clients/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, var(--violet), var(--rose))', color: '#fff', boxShadow: '0 0 20px rgba(109,74,255,0.2)' }}>
            <Plus size={14} />
            Add Client
          </Link>
        </div>

        {/* Table */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>

          {/* Column headers */}
          <div className="hidden md:grid px-5 py-3 text-xs font-bold tracking-widest uppercase"
            style={{
              gridTemplateColumns: '2fr 2fr 1fr 1.2fr 1.3fr 80px',
              color: 'var(--t5)',
              borderBottom: '1px solid var(--b3)',
              background: 'var(--b6)',
            }}>
            <span>Business</span>
            <span>Email</span>
            <span>Plan</span>
            <span>Usage</span>
            <span>Assistant</span>
            <span />
          </div>

          {list.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm" style={{ color: 'var(--t5)' }}>No clients yet</p>
              <Link href="/admin/clients/new" className="text-xs mt-1 inline-block" style={{ color: 'var(--violet)' }}>
                Add your first client →
              </Link>
            </div>
          ) : (
            groups.map((group, gi) => {
              const isLastGroup = gi === groups.length - 1
              const email = emailMap[group.userId] ?? '—'

              if (group.rows.length === 1) {
                const biz = group.rows[0]
                return (
                  <ClientRow key={biz.id} biz={biz} usage={usageByBusiness[biz.id]} email={email} isLast={isLastGroup} />
                )
              }

              return (
                <details key={group.userId} open style={{ borderBottom: isLastGroup ? 'none' : '1px solid var(--b4)' }}>
                  <summary className="px-4 py-3 md:px-5 cursor-pointer select-none list-none flex items-center gap-2 text-xs font-bold tracking-wide"
                    style={{ color: 'var(--t4)', background: 'var(--b6)' }}>
                    <span>{email}</span>
                    <span className="px-1.5 py-0.5 rounded-full" style={{ color: 'var(--violet)', background: 'rgba(109,74,255,0.12)' }}>
                      {group.rows.length} locations
                    </span>
                  </summary>
                  {group.rows.map((biz, ri) => (
                    <ClientRow key={biz.id} biz={biz} usage={usageByBusiness[biz.id]} email={email} isLast={ri === group.rows.length - 1} />
                  ))}
                </details>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual check**

Run `npm run dev`, open `/admin/clients`:
- Every existing (single-location) client must render exactly as before — same row, same styling, same "Edit"/"Company Information" icon buttons.
- The client you added a second location to in Task 8 must now render as one expandable group labeled with their shared email and "2 locations," open by default, with both locations listed as rows underneath.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/clients/page.tsx
git commit -m "$(cat <<'EOF'
Group the admin client list by shared login (multi-location clients)

Extracts the per-row markup into ClientRow so a single-location client
renders identically to before, while a user_id with multiple businesses
rows now surfaces as one expandable group.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, including the 5 new tests from Task 1 and every pre-existing test file.

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 4: End-to-end manual walkthrough**

With `npm run dev` running:

1. Pick an existing test client. Confirm their dashboard (Today, Calls, Appointments, Analytics, Briefing, Settings) and their admin client-list row are pixel-identical to before this branch — no location switcher, no "Locations" group wrapper beyond the always-present (but now-empty) "Add another location" control on their admin edit page.
2. As admin, add a second location to that test client via `/admin/clients/[id]` → "Add another location." Give it a distinct name (e.g. "Test Co — Perth"), a different plan, and its own (test/dummy) Vapi Assistant ID.
3. Log in as that client. Confirm the sidebar now shows a "Location" dropdown with both locations. Switch to the second location and confirm every page (Today, Calls, Appointments, Analytics, Briefing, Settings) now reflects the second location's own data (empty/default, since it's new) — no data from the first location leaks through.
4. Toggle the phone line (pause/resume) while the second location is selected; confirm it only affects that location's Twilio number, not the first.
5. If a Google account is available for testing, connect Google Calendar while the second location is selected; confirm the resulting `calendar_connections` row's `business_id` matches the second location, not the first.
6. Switch back to the first location and confirm its data is unchanged and still isolated.
7. On `/admin/clients`, confirm the test client now appears as one expandable group ("N locations") with both rows underneath, and every other client is unaffected.

- [ ] **Step 5: Report results**

Summarize pass/fail for each of steps 1-4 above (test suite, type-check/lint, build, manual walkthrough) before considering this plan complete. Any failure found here should be fixed with a follow-up commit before moving on to sub-project 3 (outbound calling campaigns).
