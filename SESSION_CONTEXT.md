# Session context — Ellie Dashboard (as of 2026-07-10)

This is a working log of one long Claude Code session on this repo, written so
a future session (or teammate) can catch up without re-reading the whole
transcript. It's a snapshot in time, not an evergreen doc — see
`PROJECT_CONTEXT.md`/`AGENTS.md` for the architecture-level context that
should stay current. If anything here contradicts the code, trust the code.

Everything below was implemented and is (unless noted) already live/pushed —
but several items still need a manual step from the user (migrations run,
Briefing fields set, prompt text pasted in). See **Outstanding for the
user** at the bottom for the definitive punch list.

---

## 1. Vapi booking-flow correctness fixes

- **Timezone bug**: all date/time math used the server's implicit local
  timezone instead of each business's real one. Fixed with a from-scratch
  `Intl`-based utility layer (`src/lib/timezone.ts`) and a new
  `businesses.timezone` column, threaded through availability, booking,
  webhook, and every dashboard display.
- **"Revenue booked" undercounting**: case-sensitive service-name lookup vs.
  the existing case-insensitive `durationFor()` pattern — fixed by
  lowercasing both sides of the price lookup.
- **Booking duration always 30 min**: turned out to be a **data gap, not a
  bug** — `business_services` was completely empty for Luxe Nails, so
  `durationFor()` always fell back to its 30-min default. The user needs to
  add real services via the Briefing page's Services & prices editor.
- **SMS confirmation formatting**: added emojis, multi-line layout, a Google
  Maps link (prefers a pasted `businesses.google_maps_url` over a
  constructed search-query URL), removed the "Reply STOP" line, and later
  added the appointment duration to the text.
- **Twilio trial-account SMS failures (error 30044)**: trial accounts
  prepend `"Sent from your Twilio trial account - "` to every message and
  cap segment count. Adding the duration line pushed messages from 3 to 4
  UCS-2 segments (emoji forces UCS-2 encoding at 70 chars/segment instead of
  160), exceeding the trial cap and silently failing real customers'
  confirmation texts. **Not yet resolved** — was mid-discussion (drop emoji
  vs. trim wording) when the conversation moved on. Needs a decision.

## 2. The "Booked" outcome bug and the reschedule feature

Root cause (confirmed via live data): `calls.outcome` was derived only from
Vapi's own `endedReason`, and `'appointment-scheduled'` is a Vapi-native
value never emitted for our custom `bookAppointment` tool — so every real
booking fell through to "Enquiry".

Fixed by:
- `appointments.vapi_call_id` column (migration:
  `supabase-schema-appointments-call-link.sql`) — the webhook stamps the
  live call's id onto the appointment at booking time.
- `src/app/api/vapi-webhook/route.ts`'s `end-of-call-report` branch now
  checks for a matching appointment before falling back to
  `endedReason`-based classification.
- `src/lib/callClassify.ts`'s `classifyCall()` takes `hasBooking`/
  `hasReschedule` params, checked before any `endedReason` match.

This only fixes calls **going forward** — pre-existing calls can't be
retroactively reclassified (there was nothing to correlate them by at the
time).

Since nothing could modify an *existing* appointment, a full reschedule
capability was built from scratch:
- Two new Vapi tools, `findUpcomingAppointments` and `rescheduleAppointment`
  (mirroring the existing `checkAvailability`/`bookAppointment` setup-script
  pattern) — `scripts/setup-vapi-find-appointments-tool.mjs`,
  `scripts/setup-vapi-reschedule-tool.mjs`. **Already created live** and
  attached to the Luxe Nails assistant; env vars
  `VAPI_FIND_APPOINTMENTS_TOOL_ID`/`VAPI_RESCHEDULE_APPOINTMENT_TOOL_ID` are
  in `.env`.
- `findUpcomingAppointments` fuzzy-matches the caller's phone via
  `phoneDigitsKey()` (`src/lib/sms.ts`) and lists matches for Ellie to read
  out and confirm before rescheduling (user chose "ask which one" over
  "assume the soonest").
- `rescheduleAppointment` updates the appointment, sends a confirmation SMS,
  and moves the Google Calendar event (new `updateCalendarEvent()` in
  `src/lib/googleCalendar.ts`).
- New `'rebooked'` outcome category, added consistently to both the Calls
  tab and the dashboard's `RecentCallsCard`/`OUTCOME_STYLE` (they share
  `classifyCall`'s output).
- Drafted (not auto-pushed) updated Luxe Nails prompt sections for this —
  see **Prompt state** below.

## 3. Native call transferring

Built using Vapi's **native `transferCall` tool type** (verified against
Vapi's real OpenAPI spec, not guessed), not a custom function tool — created
with no hardcoded `destinations`, so Vapi asks our webhook (a
`transfer-destination-request` message) who to connect to at transfer time.
One shared tool works for every business.

- New `businesses.transfer_phone_number` column (migration:
  `supabase-schema-transfer-phone.sql`) + a "Number to transfer calls to"
  field added to the Briefing page's existing Transfer Rules section
  (client-editable, goes through the usual draft → admin-apply flow).
- New webhook branch resolves the business's number or returns `{ error }`,
  which gracefully falls through to "take a message" — no code path
  breaks if the number isn't set yet.
- Tool created live (`scripts/setup-vapi-transfer-tool.mjs`,
  `VAPI_TRANSFER_CALL_TOOL_ID` in `.env`), attached to the Luxe Nails
  assistant.
- Later broadened at the user's request: transfer now also triggers on
  "talk to the team / a named person / a human", genuine conversational
  confusion, or **any tool call failing** — all 4 other tools'
  `request-failed` native messages were updated (live, via direct API PATCH)
  to redirect to `transferCall` instead of "apologise and take a message".
- Generic prompt template (`src/lib/assistantPrompt.ts`, used for brand-new
  clients) updated to match.

## 4. Vapi native tool-level messages (`request-start`/`-complete`/`-failed`)

Discovered the user's prompt had the same "please hold" phrase written out
**twice** (once inline per Booking/Rescheduling step, once in a "Tool
Calling Rules" summary section) — causing Ellie to say it twice per tool
call. Root-cause fix: moved these phrases onto the actual Vapi tools
themselves via their native `messages` array (`request-start` for the hold
phrase — `blocking: true` so it's said before the tool actually fires;
`request-complete`/`request-failed` as `role: system` hints that steer the
model's own generated response without replacing it). This is live on all 5
tools (`checkAvailability`, `bookAppointment`, `findUpcomingAppointments`,
`rescheduleAppointment`, `transferCall`) and mirrored in all 5 setup
scripts. The prompt text was correspondingly simplified to just "call the
tool" with no spoken instruction.

## 5. Calls page redesign

Replaced the grid-table layout with an avatar-row card list matching the
already-existing `RecentCallsCard` pattern on the dashboard home (that
component predates this session): initials avatar (deterministic color per
caller, `src/lib/avatar.ts`, shared with `RecentCallsCard`), name + phone
number + one-line AI summary (with a `callSummary()` transcript-quote
fallback when Vapi's own summary is blank), after-hours clock icon (reusing
the existing `isAfterHours()` helper), inline expand-in-place instead of
navigating to `/calls/[callId]` (`CallDetailPanel.tsx`, also used by the
standalone route so nothing is duplicated), sort dropdown, numbered
pagination (`src/lib/pagination.ts`, shared with the later Recordings
rebuild), and a copy-to-clipboard button next to every phone number
(reusing the existing `CopyButton`).

Along the way: added `analysisPlan.summaryPrompt`/`structuredDataSchema` to
the Vapi assistant (`src/lib/vapi.ts`'s `syncAssistantPrompt`) so Vapi
actually generates a punchy one-line summary and extracts the caller's
first name from the transcript when they mention it — both were completely
unconfigured before, which is *why* summaries were blank and names were
always "Unknown caller".

## 6. Recordings page redesign

Same visual language as the Calls redesign: name/summary + copy button,
existing `WaveformPlayer` (unchanged) for playback, transcript/download icon
buttons, real search + a working date-range dropdown (7/30/90 days, actually
refetches), numbered pagination. "Download all" added as a disabled
"Coming soon" button (matches the existing convention elsewhere in the app)
rather than building real bulk-zip download, which wasn't asked for.

## 7. Analytics page redesign

Kept the existing "Call volume — last 30 days" area chart and "Monthly plan
usage" bar per the user's explicit request. Added, all from real data:
- Three stat cards: avg call length (existing calc, restyled), booking
  conversion % with a real trend vs. the immediately preceding period
  (fetches a second call-set), calls outside hours (reuses `isAfterHours()`).
- Heatmap: Quiet/Steady/Busy legend, a genuinely computed "hottest window"
  callout (finds which day(s) share the busiest time-of-day bucket, not
  hardcoded), custom CSS hover tooltip replacing the native browser one.
- Donut re-labeled to real categories (Booked/rebooked, Enquiry,
  Transferred, Missed+errored folded into "Caller hung up early"), with
  total calls shown in the center.
- Explicitly **skipped** "Top questions asked" (from the mockup) — would
  need real transcript clustering/NLP that doesn't exist; user chose not to
  fake the numbers. Worth its own future task if wanted.

## 8. Cosmetic / small fixes

- New `favicon.png` wired into `metadata.icons`, old `favicon.ico` removed;
  swapped into the Sidebar's square badge (`object-cover`, fills the box —
  previously a small centered icon on a gradient bg), Login page, AdminNav
  (with an "Ellie" text label added back since the wordmark used to carry
  it). Set-password page was reverted back to the wide `logo.png` wordmark
  per user request — not every spot wanted the square mark.
  `proxy.ts`'s static-asset matcher updated to allowlist `favicon.png`.
- Dashboard's "Revenue booked" → **"Revenue saved"**: reframed as "business
  Ellie didn't let slip away", shown as `+$X` in green. Falls back to an
  average-of-configured-prices estimate (or a flat $50) when a service's
  price isn't set, instead of silently showing $0.
- Fixed a real bug in the "Monthly plan usage" progress bar (Analytics page)
  not rendering any fill: `background: linear-gradient(90deg, ${color},
  ${color}88)` where `color` was a string like `'var(--signal)'` — you
  cannot append a hex alpha suffix to a `var()` reference; the resulting
  `var(--signal)88` is invalid CSS and silently drops the *entire*
  `background` declaration. Fixed by using a solid color, matching the
  already-correct pattern in `Sidebar.tsx`'s equivalent bar.
- `/auth/set-password`: closed a gap where reopening the invite link (or the
  page) after already setting a password let the same session silently
  resubmit and overwrite the password again with no warning. Now stamps
  `user_metadata.password_set` on first success and shows a "You're all
  set" message instead of the bare form on any later visit. Doesn't protect
  users who set their password *before* this shipped (no metadata flag yet)
  — self-heals on their next submit.

## 9. Live production bugs found and fixed mid-session

- **Duplicate `vapi_assistant_id`**: a new business "ZEIL" (real client,
  created same day) was set up pointing at Luxe Nails & Beauty's *existing*
  Vapi assistant instead of its own. Every webhook lookup does
  `.eq('vapi_assistant_id', assistantId).single()` — with two matching
  rows, Postgres returns an error instead of data, so `biz` comes back
  null. This silently broke `checkAvailability` (booking impossible),
  `end-of-call-report` (call never saved to the dashboard at all), and now
  also the transfer-destination lookup — **for both businesses**, not just
  ZEIL. **Not yet resolved** — user said they'd create ZEIL its own
  assistant; hasn't confirmed done.
- **`vapi_call_id` migration lag**: shipped code that inserted a
  `vapi_call_id` column value before the corresponding migration had been
  run in production, which broke live bookings until caught. Added a
  defensive retry-without-that-field fallback in the webhook so a future
  schema-migration lag (a recurring pattern in this project's actual
  deploy workflow — code ships immediately, SQL migrations are run
  manually afterward) can't silently break bookings the same way again.

## Prompt state (Luxe Nails & Beauty's live system prompt)

The user's hand-authored prompt has been iterated on heavily this session
via drafts I gave them to paste in themselves (never auto-pushed — this
project's established pattern is that only an admin manually applying a
prompt via "Save & push"/"Apply & Push" touches the live Vapi assistant).
**It's not confirmed which of these drafts have actually been pasted in and
pushed** — the "Tool Calling Rules" simplification and the broadened
Transfer Rules (team/human/confusion/any-tool-failure → transfer) were the
most recent, given last in full. If picking this up, ask the user whether
their live prompt currently reflects: markers-based hours/services,
Rescheduling Flow section, native-tool-messages-mean-no-spoken-hold-phrase,
and the broadened Transfer Rules — or re-fetch the live prompt via the admin
System Prompt tab / Vapi API to check directly rather than assume.

## Outstanding for the user (things I can't do myself)

- **Run pending SQL migrations** in Supabase SQL editor — at least:
  `supabase-schema-appointments-call-link.sql`,
  `supabase-schema-transfer-phone.sql`, and check whether earlier ones
  (`supabase-schema-business-timezone.sql`, `supabase-schema-appointments-sms-sent.sql`,
  etc.) have actually been run — status wasn't reconfirmed recently.
- **Fix the ZEIL/Luxe Nails duplicate `vapi_assistant_id`** — actively
  breaking bookings and call-saving for both businesses.
- **Add real services** in the Briefing page (Services & prices) — still
  empty, which is why booking durations/prices default rather than reflect
  reality.
- **Set a real transfer phone number** for Luxe Nails in the Briefing page
  (Transfer Rules section) — transfer silently falls back to "take a
  message" until this is set.
- **Decide the Twilio SMS length issue** (§1) — drop emoji from the
  confirmation SMS (reliable, less flashy) vs. trim wording to squeeze under
  the trial segment cap (fragile) vs. upgrade the Twilio account (removes
  the restriction entirely). Real customer confirmations are failing right
  now until this is decided.
- **Confirm the live system prompt** matches the latest drafted state (see
  above) — paste in the latest version from this session if not.
- Nothing this session was committed or pushed to git unless the user did
  so separately — worth checking `git status`/`git log` before assuming
  anything is deployed beyond what's already live via direct Vapi/Supabase
  API calls made during the session (tool creation, `.env` tool IDs, live
  `analysisPlan`/tool-message PATCHes — these bypass the normal
  code-review/deploy path since they were applied directly against Vapi's
  API, not through this repo's own sync code path).
