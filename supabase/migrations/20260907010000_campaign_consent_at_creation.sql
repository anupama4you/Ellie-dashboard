-- Consent is now confirmed via an alert box at campaign creation, not a
-- separate draft-status step afterwards — every new campaign is created
-- directly `active`. `draft` stays a legal value for any pre-existing rows
-- but is no longer produced by the app.
alter table outbound_campaigns alter column status set default 'active';
comment on column outbound_campaigns.status is 'draft (legacy) | active | completed';
