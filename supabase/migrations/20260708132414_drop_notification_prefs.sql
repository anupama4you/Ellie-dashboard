-- Run this in your Supabase SQL editor.
-- The Notifications toggles on the Settings page were removed — none of the
-- four preferences (booking texts, morning brief, urgent alerts, weekly
-- report) were ever actually wired up to anything, they just stored a
-- boolean nobody read. Dropping the now-dead column.

alter table public.businesses
  drop column if exists notification_prefs;
