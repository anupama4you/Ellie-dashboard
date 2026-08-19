-- Run this in your Supabase SQL editor.
-- Removes the per-date staff availability override feature added in
-- 20260818090003_business_staff_availability.sql. Staff availability is now
-- tracked purely by each staff member's weekly hours template
-- (business_staff.hours) plus their active/inactive toggle.
drop table if exists public.business_staff_availability;
