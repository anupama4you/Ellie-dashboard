# Outbound calling campaigns

Status: approved for planning
Date: 2026-09-06

## Context

The multi-location client (see the multi-location support spec) wants Ellie
to call a list of customers who haven't visited in a while — sourced from a
spreadsheet the client uploads themselves, since their ERP integration is a
separate, later sub-project. This is sub-project 3 of the four-part
decomposition (admin-configurable visibility → multi-location support →
**outbound calling campaigns** → ERP integration). Sub-projects 1 and 2 are
merged.

## Current state (relevant facts)

Nothing in this codebase places outbound calls today. `src/lib/vapi.ts`
only reads/manages existing Vapi resources (calls, assistants, phone
numbers) — there is no wrapper for Vapi's call-creation endpoint.
`src/lib/twilio.ts` only sends confirmation SMS and repoints a number's
inbound `VoiceUrl` for the pause/resume feature — no outbound-voice
capability. There is no file-upload code, no CSV/spreadsheet parsing
library, and no Supabase Storage usage anywhere in the repo. The pieces
that already exist are outbound-tolerant by coincidence: the webhook
resolves everything by `vapi_assistant_id` regardless of call direction,
`calls.call_type` already accepts `outboundPhoneCall` as a value, and the
Calls UI already renders it with a distinct label/icon (built for calls
placed manually via Vapi's own dashboard, unused by this app until now).

## Goals

- A client can upload a spreadsheet (CSV) of contacts to call, per location.
- The client (not just admin) manages campaigns from their own dashboard,
  gated behind a per-client feature toggle admins control (same mechanism
  as `dashboard_features`).
- Calls are placed in small manual batches ("Call next batch"), not
  automatically scheduled — no background/cron infrastructure required.
- Each contact gets one call attempt; the outcome (booked, no answer,
  declined, etc.) is visible per contact once Vapi's end-of-call-report
  lands, reusing the existing webhook and `calls` table.
- A lightweight compliance safeguard: an explicit consent confirmation
  before a campaign can start, plus a fixed daytime calling window.

## Non-goals

- No ERP integration or ERP-driven contact lists — sub-project 4.
- No filtering/rules engine for "who qualifies" — the uploaded CSV *is*
  the call list; the client is expected to have already filtered it
  (in their ERP or spreadsheet tool) before uploading.
- No automatic/scheduled pacing — batches are triggered by a button click.
- No automatic retries of no-answers/declines within a campaign.
- No cross-location combined campaigns — a campaign belongs to exactly
  one location (`business_id`), matching how every other per-location
  resource in this app already works.
- No new personalization templating system — if an admin wants a call to
  use the contact's name, they reference Vapi's own `{{customerName}}`
  variable syntax in their hand-authored system prompt/first message
  (this spec only guarantees the variable is passed, not that it's used).

## Data model

Two new tables, both scoped to a location, following the repo's
single-purpose-migration convention:

```sql
create table public.outbound_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses(id) on delete cascade,
  name               text not null,
  status             text not null default 'draft', -- draft | active | completed
  consent_confirmed_at timestamptz,
  created_at         timestamptz not null default now()
);

create table public.outbound_campaign_contacts (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.outbound_campaigns(id) on delete cascade,
  name          text not null,
  phone         text not null,
  note          text,
  status        text not null default 'pending', -- pending | calling | done
  vapi_call_id  text,
  outcome       text, -- populated once the end-of-call-report lands, mirrors calls.outcome
  created_at    timestamptz not null default now()
);
```

RLS on both follows the existing pattern: `outbound_campaigns` scoped by
`business_id in (select id from businesses where user_id = auth.uid())`;
`outbound_campaign_contacts` scoped by campaign ownership (a join through
`outbound_campaigns`).

`status: 'draft'` = contacts uploaded, not yet consent-confirmed/started.
`'active'` = consent confirmed, batches can be placed. `'completed'` = every
contact is `done`. A campaign transitions `draft → active` the moment
consent is confirmed (`consent_confirmed_at` set) — there's no separate
"start" step beyond that.

## CSV upload

A plain `<input type="file">` in a Server Action form, parsed in-memory —
nothing is ever written to storage. Required columns: `name`, `phone`.
Optional: `note` (free text, e.g. "last visited March" — stored per
contact, passed to Vapi as a variable, no other effect). Adds one new
dependency for parsing (`papaparse`, the most widely used CSV parser for
Node/browser, MIT-licensed, no native bindings). Upload creates the
`outbound_campaigns` row (`status: 'draft'`) and inserts every valid row
into `outbound_campaign_contacts` in one action; rows missing `name` or
`phone`, or with an unparseable phone number, are skipped and reported
back as a count ("3 rows skipped — missing phone number"), not silently
dropped without explanation.

## Consent + activation

Before any call can be placed, the client must tick a checkbox — "These
are my own existing customers and I have the right to contact them" —
which sets `consent_confirmed_at` and flips the campaign to `active`. This
is a lightweight, unenforced-beyond-the-checkbox safeguard; the legal
responsibility remains the client's, consistent with how `plan_status` is
a display label elsewhere in this app rather than a hard gate.

## Call placement

New wrapper in `src/lib/vapi.ts`:

```ts
export async function createOutboundCall(opts: {
  assistantId: string
  phoneNumberId: string
  customerNumber: string
  variableValues?: Record<string, string>
}): Promise<{ id: string }>
```

Wraps Vapi's `POST /call` with `assistantId`, `phoneNumberId`,
`customer: { number: customerNumber }`, and
`assistantOverrides: { variableValues }` (passes `customerName` and
`note` when present — an admin's prompt can reference `{{customerName}}`/
`{{note}}` if they choose to).

Resolving `phoneNumberId` (Vapi's phone-number *resource* id, not the raw
E.164 string stored in `businesses.twilio_phone_number`): call the
existing `listPhoneNumbers()` and match by `number === business.twilio_phone_number`.
No new column needed. If no match is found (the number was never imported
into Vapi, or was removed), the batch action fails clearly for that
location rather than silently no-op-ing.

**"Call next batch" action** (`src/app/(dashboard)/campaigns/actions.ts`):
takes up to 5 `pending` contacts for the campaign (oldest first), and for
each: resolves the phone number id (once per batch, not per contact),
calls `createOutboundCall()`, and on success sets that contact's
`status: 'calling'` and stores the returned `vapi_call_id`. A contact
whose placement call itself fails (Vapi API error) stays `pending` and is
reported in an error summary rather than silently disappearing.

**Daytime window guard**: the action refuses to place calls outside
9:00am–8:00pm in the business's own timezone (via `src/lib/timezone.ts`
helpers, same as every other time computation in this app) — returns a
clear message ("Outbound calls can only be placed between 9am and 8pm")
rather than a generic error. This is a fixed, non-configurable constant
for v1, not a per-business setting.

## Outcome tracking

No new webhook code. The existing `end-of-call-report` handler in
`api/vapi-webhook/route.ts` already writes to `calls` keyed by
`vapi_call_id`. This sub-project adds one small hook: after that upsert
succeeds, if a matching `outbound_campaign_contacts.vapi_call_id` exists,
update that contact's `status: 'done'` and `outcome` (copied from the same
`outcome`/`ended_reason` value already computed for the `calls` row). If
every contact in a campaign reaches `done`, the campaign's own `status`
flips to `'completed'` in the same update (a simple count check, not a
trigger).

## Dashboard UI

New `campaigns` key in `FEATURE_REGISTRY` (`src/lib/dashboardFeatures.ts`)
and `Campaigns` nav entry in `Sidebar.tsx`, gated the same way
`appointments`/`staff`/`sms` already are — absent/`true` = visible,
explicit `false` = hidden. Admin toggles it per client on the existing
Dashboard Features card (`admin/clients/[id]/page.tsx`), no new admin UI
needed there.

New page `src/app/(dashboard)/campaigns/page.tsx`: lists the current
location's campaigns (name, contact count, done/pending split, status).
Selecting one shows the upload form (if `draft` and empty), the consent
checkbox (if `draft` with contacts), the contact table (name, phone, note,
status, outcome), and the "Call next batch" button (only enabled when
`active` and at least one `pending` contact remains, and only outside the
window guard's blocked hours — shown greyed out with the reason otherwise).

## Error handling

- CSV parse failure (malformed file, wrong columns): rejected upfront with
  a specific message, no partial campaign created.
- Vapi call-placement failure mid-batch: already-placed contacts in that
  batch keep their `calling` status; the failing ones stay `pending` and
  are reported; the client can just click "Call next batch" again.
- Missing/unmatched `phoneNumberId`: batch action fails for the whole
  campaign with a specific message naming the location's number — this is
  a location misconfiguration, not a per-contact issue.
- A `businesses` row with `dashboard_features.campaigns === false`: the
  nav entry and the page itself are both gated (route redirects `/`),
  matching the existing feature-visibility enforcement pattern.

## Testing

- Unit tests for CSV row validation (valid row passes; missing name/phone
  is skipped and counted; malformed phone number is skipped and counted).
- Unit test for the daytime-window guard (inside window → allowed; before
  9am/after 8pm in the business's own timezone → blocked with the
  specific message; confirm it uses the business's timezone, not the
  server's).
- Unit test for the phone-number-id resolution (matches by `number`,
  returns a clear "not found" error when no match exists).
- Manual verification pass: upload a CSV to a test location's Campaigns
  page, confirm the consent checkbox gates "Call next batch", click it,
  confirm contacts move to `calling`, and (if a real Vapi/Twilio setup is
  available) confirm an end-of-call-report correctly flips a contact to
  `done` with the right outcome and the campaign completes once all
  contacts are done.

## Open questions

None outstanding — filtering-source, execution model (manual batches, no
cron), client-vs-admin ownership, and the compliance-checkbox approach
were all confirmed during brainstorming. The 9am–8pm window is a design
decision flagged during brainstorming rather than a user-confirmed
requirement — revisit if it turns out to be too restrictive in practice.
