-- Per-location email notification preferences (client-writable, mirrors the
-- dashboard_features toggle pattern: absent/true = enabled, explicit false
-- disables it). See src/lib/notifications.ts for the key registry.
alter table businesses
  add column if not exists notification_preferences jsonb not null default '{}'::jsonb;
