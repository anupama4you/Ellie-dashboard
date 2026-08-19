-- Run this in your Supabase SQL editor.
-- Removes the per-service staff-restriction column added in
-- 20260819110000_business_services_staff_ids.sql. The feature (and all
-- code that read/wrote it) has been removed.
alter table public.business_services
  drop column if exists staff_ids;
