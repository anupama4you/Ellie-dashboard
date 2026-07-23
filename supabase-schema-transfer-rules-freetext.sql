-- Run this after supabase-schema-additions.sql, in your Supabase SQL editor.
-- "When to put callers through to you" moves from a fixed toggle array to a
-- single free-text field. Backfills existing rows by flattening whichever
-- rules were enabled into "label: description" lines, so live behavior is
-- preserved for anyone this already applied to.
--
-- Done as an add-column/backfill/drop-old/rename swap rather than a direct
-- `alter column ... type text using (subquery)` — Postgres rejects a
-- correlated subquery inside that USING clause ("cannot use subquery in
-- transform expression"), so the backfill has to happen via a plain UPDATE,
-- which has no such restriction.

alter table public.businesses
  add column if not exists transfer_rules_text text;

update public.businesses
set transfer_rules_text = coalesce(
  (
    select string_agg(concat(r->>'label', ': ', r->>'description'), E'\n')
    from jsonb_array_elements(transfer_rules) r
    where (r->>'enabled')::boolean
  ),
  ''
)
where transfer_rules_text is null;

alter table public.businesses
  drop column if exists transfer_rules;

alter table public.businesses
  rename column transfer_rules_text to transfer_rules;

alter table public.businesses
  alter column transfer_rules set default '',
  alter column transfer_rules set not null;
