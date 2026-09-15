-- Self-hosted short links for SMS — a business's booking/website URLs are
-- static across every call, so rather than shortening dynamically per send
-- (which would mint a new row every call), a short link is created once per
-- (business_id, target_url) pair and reused. Redirect handled by
-- src/app/l/[code]/route.ts using the service-role key — no client-facing
-- read access needed, so RLS stays enabled with no policies.
create table if not exists public.short_links (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  target_url  text not null,
  business_id uuid references public.businesses(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists short_links_business_target_idx
  on public.short_links (business_id, target_url);

alter table public.short_links enable row level security;
