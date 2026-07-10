# Ellie Dashboard — Project Context

AI receptionist SaaS. Each client business gets a Vapi voice assistant ("Ellie") that answers calls, checks availability, and books appointments. This dashboard is where clients manage their business info and admins manage clients + the assistant's live behavior.

**Stack:** Next.js (App Router) · Supabase (Postgres + Auth) · Vapi (voice AI platform) · Twilio (SMS) · Google Calendar (OAuth, real free/busy + event creation).

## Architecture at a glance

- `(dashboard)` route group — client-facing: Today/Calls/Appointments/Analytics/Briefing/Settings. Scoped to `getCurrentBusiness()` (the logged-in user's own `businesses` row).
- `admin/` — internal-only: create clients, review Briefing submissions, hand-author each assistant's system prompt. Uses `createAdminClient()` (service-role key, bypasses RLS).
- `api/vapi-webhook/route.ts` — the only inbound integration point from Vapi. Handles two message types:
  - `tool-calls`: `checkAvailability` (reads live `businesses.hours` + `business_services` + `appointments`, plus Google Calendar free/busy if connected) and `bookAppointment` (inserts `appointments`, sends Twilio SMS, creates a Google Calendar event).
  - `end-of-call-report`: upserts into the local `calls` table (`onConflict: vapi_call_id`). **This is the only thing that populates `calls`** — the Calls/Today/Analytics pages otherwise read call history live from Vapi's API, not this table.

## Trials and billing-cycle anchoring (why usage isn't calendar-month-based)

Every business now has `plan_status` (`trial | active | cancelled`), `trial_started_at`, and `plan_started_at` (the billing-cycle anchor day). Payments happen entirely outside this app — the admin is the only one who starts a trial, converts it to paid, or cancels it (`src/app/admin/clients/[id]/page.tsx`: `startTrialAction`/`convertToPaidAction`/`cancelPlanAction`), never the client.

- **Trial**: unlimited calls, but still counted — `getPlanUsage()` (`src/lib/planUsage.ts`) returns `limit: null, pct: null, isTrial: true` and counts every call since `trial_started_at`. UI branches on `isTrial` everywhere usage is shown (Sidebar, Analytics, Settings, Today page, admin clients list) rather than rendering a percentage bar against nothing.
- **Active/cancelled**: usage counts against `PLAN_LIMITS[plan]` for the *current monthly billing cycle anchored to `plan_started_at`'s calendar day* — via `startOfBillingCycleInZone()`/`startOfNextBillingCycleInZone()` in `src/lib/timezone.ts` — **not** the 1st of the calendar month. A plan that started on the 14th renews on the 14th (clamped to the last day of shorter months). This replaced the old `startOfMonthInZone()`-based counting, which was wrong for every business that didn't happen to start on the 1st.
- Converting a trial to paid resets `plan_started_at` to the conversion date (new billing anchor); starting a trial (fresh or restarted after cancellation) resets both `trial_started_at` and `plan_started_at` to that moment.
- None of this blocks calls — same as before, it's purely for visibility (usage bars, the admin "over usage threshold" alert in `getBusinessesOverUsageThreshold()`, which now skips trial businesses since they have no `pct` to threshold against).

## The Briefing draft/live split (why it exists)

Client edits to hours/services/FAQs/company info used to write straight into the same columns the webhook reads live — meaning a client's change took effect on real calls instantly, while the hand-authored Vapi system prompt (what Ellie actually *says*) stayed stale until an admin manually noticed and pushed an update. Two sources of truth, no guaranteed sync.

Fixed by:
- `businesses.draft_briefing` (jsonb) — client Briefing saves land here only (`saveDraftBriefing` in `src/lib/briefing.ts`), never touching live columns.
- Admin reviews the draft read-only at `/admin/clients/[id]/briefing` (`resolveBriefing()` = draft-preferred, `liveBriefing()` = pure live baseline, diffed for "Changed" pills). Company Information is the one section that's admin-editable inline there (`AdminCompanyInfoEditor` — writes to the draft if one's pending, straight to live if not).
- The **only** way live `businesses`/`business_services`/`business_faqs` change is `applyDraftAndPushPrompt()` (`admin/clients/[id]/prompt/actions.ts`), triggered by "Apply & Push" on the Prompt tab. It atomically copies draft → live columns *and* pushes the edited system prompt to Vapi in the same action, so tool behavior and prompt text can never drift apart again. DB write happens before the Vapi push (cheaper/safer call first); on Vapi-push failure the draft/review flag are deliberately left in place rather than rolled back — same "tools ahead of prompt" state the feature exists to surface.
- "Reject changes" (`rejectDraftBriefing`) discards the draft, explicitly leaves live data untouched.
- "Save & push to Vapi" (plain `adminSaveSystemPrompt`) is for prompt-only wording tweaks — deliberately does **not** touch `draft_briefing`/`briefing_needs_review`, so a routine edit can't silently dismiss a real pending client change.

## Marker-based prompt patching (why "Regenerate" doesn't overwrite everything)

Real system prompts are hand-authored per client and are far more detailed than `buildAssistantConfig()`'s generic template (custom booking-flow scripts, upsell handling, phrasing rules, etc.) — a full regenerate would destroy that. Instead, `patchPromptSections()` (`src/lib/assistantPrompt.ts`) does surgical replacement between `<!-- briefing:KEY -->` / `<!-- /briefing:KEY -->` markers only. Sections without markers present are left completely alone and reported as "missing," never guessed at.

Keys: `description`, `location`, `website` (each independent — not appended together as one blob, so they can be placed/phrased wherever makes sense in a given prompt), `hours`, `services`, `faqs`, `transferRules`. `location`/`website` are **inline** (no forced newlines — meant to sit after a hand-written label like `Location: `); the rest are **block**-style (own paragraph).

Existing clients' live prompts have none of these markers yet — an admin has to manually add them once per prompt (copy the relevant existing text between a marker pair) before "Regenerate from Briefing" can touch that section.

## Known footguns / things that look fine but silently aren't

- **`server.url` / call history / plan usage**: Vapi only sends `end-of-call-report` (which populates local `calls`) if the assistant's `server.url` is set. That only happens via `syncAssistantPrompt()` → `requiredServerConfig()` in `lib/vapi.ts`, which requires `APP_URL` (falls back to `NEXT_PUBLIC_SITE_URL`) to be set **and** a prompt save/apply to have actually run for that specific assistant. If either never happened, `calls` stays empty/partial and **"Monthly plan usage"** (`lib/planUsage.ts`, counts from `calls`) reads wrong while the Calls/Today pages look fine (they hit Vapi's API directly). Past calls made before the fix can't be backfilled — Vapi already tried and failed to deliver that webhook.
- **`VAPI_WEBHOOK_SECRET`**: if unset, the webhook logs a warning and accepts unauthenticated requests. Not currently set.
- **Invite emails**: Supabase's default `{{ .ConfirmationURL }}` routes through Supabase's own hosted `/auth/v1/verify`, which redirects with session tokens as a **URL fragment** (`#access_token=...`) — invisible to a server-side route handler. The Invite email template must use `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite` instead, so `token_hash`/`type` arrive as real query params that `/auth/callback/route.ts` can read via `verifyOtp()`. This applies to any other custom auth email template (magic link, recovery) if/when those get used — same fix needed.
- **Site URL vs Redirect URLs allow-list** (Supabase dashboard, Authentication → URL Configuration): our `redirectTo` must exactly match an entry in the Redirect URLs allow-list or Supabase silently substitutes the bare Site URL instead — breaking the invite flow in a way that's easy to miss.
- **`VAPI_BOOK_APPOINTMENT_TOOL_ID` / `VAPI_CHECK_AVAILABILITY_TOOL_ID`**: required for `syncAssistantPrompt()` to auto-attach the booking tools to an assistant. Created once via `scripts/setup-vapi-tool.mjs` / `scripts/setup-vapi-availability-tool.mjs`.
- **Google Calendar / Twilio are per-business, optional**: `calendar_connections` (OAuth tokens) and `businesses.twilio_phone_number` may be unset for any given client — both webhook paths already degrade gracefully (fall back to local-only availability; skip SMS) rather than failing the call.

## Conventions

- Schema changes are small, single-purpose `supabase-schema-*.sql` files at repo root (e.g. `supabase-schema-twilio-number.sql`), not one big migration — keep following this pattern.
- All date/time logic must go through `src/lib/timezone.ts` helpers (`formatInZone`, `startOfDayInZone`, etc.) — every business has its own `timezone` column, almost never the same as the server process's. Bare `Date`/`toLocaleString()` without an explicit zone is a bug.
- Australian-specific formatting throughout (phone number grouping, state abbreviations, `en-AU` locale) — this is an AU-only product for now.
- Business hours are stored/passed as 24-hour `HH:MM` strings internally; display formatting is a presentation-layer concern, not a data concern.
