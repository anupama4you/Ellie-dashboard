# Multi-location support

Status: approved for planning
Date: 2026-09-05

## Context

An upcoming client operates multiple physical locations across Australia,
each with its own phone number(s)/IVR and staff. Their call centre is in
Sri Lanka (8 staff); they're rolling out a new ERP system with possible
public APIs. They want to start with one location and expand, and
eventually add outbound calling (calling customers from ERP lists) and
ERP/spreadsheet-driven data sync.

This is sub-project 2 of a four-part decomposition (admin-configurable
visibility → **multi-location support** → outbound calling campaigns →
ERP integration). Sub-project 1 (per-client dashboard feature toggles) is
already implemented and merged. This spec covers only the multi-location
mechanism — outbound calling and ERP integration are separate, later
specs and are explicitly out of scope here.

## Current architecture (relevant facts)

Every tenant boundary in the codebase is 1:1 with a single `businesses`
row: one `user_id` (via `getCurrentBusiness()`'s `.single()` query), one
`vapi_assistant_id` (uniquely indexed — the *only* key the Vapi webhook
uses to resolve which business a call belongs to), one
`twilio_phone_number`, one `timezone`, one `calendar_connections` row
(unique on `business_id`), and independent `hours`/`business_services`/
`business_faqs`/`business_staff`/`dashboard_features`/plan-billing state.
RLS policies scope by `business_id in (select id from businesses where
user_id = auth.uid())` — an `in`, not `=`, so multiple rows per
`user_id` are already tolerated at the database layer today; nothing
enforces one row per user except application code.

## Goals

- A client can have several locations, each fully independent (own
  assistant, number, timezone, calendar, hours/services/FAQs/staff,
  feature toggles, plan/billing), grouped under one login.
- One person logs in once and switches between their locations from the
  dashboard.
- Admin can add additional locations to an existing client and see a
  client's locations grouped together in the admin client list.
- Existing single-location clients see **zero change** — no visible UI
  difference, no behavior difference, no migration required.

## Non-goals

- No combined/rollup analytics across a client's locations — the
  Analytics page stays per-location-in-view, same as today. May be
  revisited later if the client asks for it.
- No shared/aggregated billing — each location keeps fully independent
  `plan`, `plan_status`, `trial_started_at`, `plan_started_at`, Stripe
  IDs, exactly as today.
- No changes to Vapi webhook business resolution — it already resolves
  purely via `vapi_assistant_id`, which stays 1:1 per location.
- No outbound calling, ERP integration, or spreadsheet import — later
  sub-projects.
- No per-location IVR/multi-number modeling beyond what already exists
  (one `twilio_phone_number` per `businesses` row, i.e. per location).

## Data model

**No new tables. No new columns.** A "client account" is simply the set
of `businesses` rows sharing one `user_id`. This is intentional: it
reuses RLS, the webhook, Google Calendar's per-business uniqueness
constraint, and every existing per-business feature (Briefing,
dashboard_features, billing) with no schema migration and no risk of
drift between two representations of "which business."

## Business resolution & location switching

`src/lib/business.ts`:

- New `getUserBusinesses(userId)` — fetches all `businesses` rows for a
  `user_id`, ordered by `created_at` ascending.
- `getCurrentBusiness()` keeps its existing return shape/signature so
  every current caller is unaffected. Internally it now:
  1. Resolves the logged-in user (unchanged).
  2. Calls `getUserBusinesses(user.id)`.
  3. Reads the `selected_business_id` cookie (httpOnly, `sameSite: lax`).
  4. If the cookie value matches one of the user's own business ids,
     returns that row as `business`. Otherwise (cookie missing, stale
     from a deleted location, or referencing a business the user
     doesn't own) falls back to the first (oldest) row — the same
     business a single-location client already sees today.
  5. Also returns the full `businesses` list alongside `business`, for
     callers that need to render a switcher.

New server action `selectLocationAction(businessId: string)` in
`src/app/(dashboard)/actions.ts`:
- Re-fetches the current user's `businesses` and verifies `businessId`
  is in that list (rejects otherwise — prevents a user from switching
  into another client's location by guessing/forging an id).
- Sets the `selected_business_id` cookie to the validated id.
- Redirects to `/`.

## Dashboard UI

`src/app/(dashboard)/layout.tsx`: already fetches `business` via
`getCurrentBusiness()`; now also receives the `businesses` list and
passes both the list and the current business id to `Sidebar`.

`src/components/Sidebar.tsx`: renders a location-switcher control above
the nav — **only when `businesses.length > 1`** — showing each
location's `name` with the current one selected; changing it calls
`selectLocationAction`. When a user has exactly one business (100% of
clients today), nothing renders here and the sidebar is pixel-identical
to before this change.

## Admin UI

`src/app/admin/clients/[id]/page.tsx`:
- New "Add another location" control. New server action
  `addLocationAction(userId, { name, phone, plan, vapi_assistant_id,
  start_trial })` in that page's `actions.ts` — mirrors the existing
  `createClientAction` (same fields, same manual-paste-Vapi-assistant-ID
  pattern) but does **not** create a new Supabase Auth user or send an
  invite email, since the location joins an existing login. Inserts a
  new `businesses` row with `user_id` copied from the client currently
  being viewed.
- The page lists sibling locations (other `businesses` rows sharing the
  same `user_id`, excluding the current one) with links to jump between
  them, so admin can navigate a client's full location set from any one
  of them.

`src/app/admin/clients/page.tsx` (client list): groups rows by
`user_id`. A `user_id` with more than one row renders as one expandable
group (e.g. "ABC Stores — 3 locations") instead of as flat, visually
duplicate-looking entries. A `user_id` with one row renders exactly as
it does today.

## Error handling

- `selectLocationAction` rejects (no cookie set, no redirect) if the
  requested `businessId` isn't owned by the current user — defends
  against a forged/guessed id in the form submission.
- `getCurrentBusiness()`'s cookie-validation fallback (oldest-row
  default) means a stale cookie — e.g. referencing a location an admin
  has since deleted — never produces an error page; the user silently
  lands back on their oldest remaining location.
- `addLocationAction` follows the same validation as `createClientAction`
  today (required fields, plan enum) and surfaces errors the same way
  (inline form error, no partial writes — the auth-user-creation step
  that could partially fail in `createClientAction` doesn't exist in
  this path at all, so failure modes are strictly fewer).

## Testing

- Unit tests for the cookie-resolution logic in `getCurrentBusiness()`:
  cookie absent → first row; cookie matches a valid owned row → that
  row; cookie references another user's business → falls back to first
  owned row; cookie references a deleted business id → falls back to
  first owned row.
- Unit test for `selectLocationAction`'s ownership check (rejects an id
  not in the caller's own `businesses`).
- Manual verification pass:
  - Add a second location to a test client via admin; confirm both
    locations retain fully independent hours/services/FAQs/staff/
    features/plan state.
  - Log in as that client, confirm the switcher appears and switching
    location changes every dashboard page's data (Today, Calls,
    Appointments, Analytics, Briefing, Settings) to the selected
    location, with no cross-location leakage.
  - Confirm the admin client list groups the two locations together.
  - Confirm an untouched single-location client's dashboard and the
    admin client list row for it are unchanged from before this work.

## Open questions

None outstanding — login model (single login with a switcher),
rollup-analytics scope (deferred), and per-location billing
independence were all confirmed during brainstorming.
