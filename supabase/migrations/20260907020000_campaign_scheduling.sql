-- "Schedule for later" support — when set, a campaign's contacts don't get
-- queued until the Netlify scheduled function (netlify/functions) finds
-- this due and triggers it via /api/campaign-scheduler. Null means "send
-- now" — the client's create action starts it immediately instead.
alter table outbound_campaigns
  add column scheduled_at timestamptz;
