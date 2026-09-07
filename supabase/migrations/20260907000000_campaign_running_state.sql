-- Tracks the one-call-at-a-time background chain: `running` gates the
-- "only one campaign per business at a time" rule, `stopped_reason` explains
-- why a chain paused (outside calling hours, or a system failure placing a
-- call) so the client can decide whether to just resume or dig in first.
alter table outbound_campaigns
  add column running boolean not null default false,
  add column stopped_reason text;

comment on column outbound_campaign_contacts.status is 'pending | queued | calling | done | failed';
