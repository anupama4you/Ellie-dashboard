-- Generic audit trail for admin-panel mutations and sensitive link
-- generation (impersonation, password resets, plan/account changes,
-- deletions). Written to exclusively via createAdminClient() (service
-- role, bypasses RLS) through src/lib/adminAudit.ts — never insert into
-- this table directly from a page/action, always go through logAdminAction()
-- so every write has a consistent shape.

create table public.admin_audit_log (
  id              uuid primary key default gen_random_uuid(),
  admin_user_id   uuid,               -- auth.users(id) of the admin who acted; not FK-enforced so a later admin-user deletion never blocks/cascades a historical log row
  admin_email     text not null,      -- denormalized so the log stays readable even if admin_user_id's account is later deleted/changed
  action          text not null,      -- e.g. 'impersonation_link_generated', 'password_reset_sent', 'plan_changed', 'account_disabled', 'client_deleted'
  business_id     uuid references public.businesses(id) on delete set null,
  target_user_id  uuid,               -- the client auth user affected, if any; not FK-enforced for the same reason as admin_user_id
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;
-- Deliberately zero policies: every table in this project enables RLS
-- (matches businesses/appointments/calls/etc.), and with none defined,
-- anon/authenticated roles get zero rows. Only createAdminClient()
-- (service_role, which bypasses RLS entirely) can read or write this
-- table — there is no client-facing use case for it.

create index admin_audit_log_business_id_idx on public.admin_audit_log (business_id);
create index admin_audit_log_created_at_idx  on public.admin_audit_log (created_at desc);
