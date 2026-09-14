create table if not exists public.prompt_sections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  key text not null,
  title text not null,
  heading_level smallint not null default 2 check (heading_level between 1 and 3),
  kind text not null default 'text'
    check (kind in ('text', 'hours_table', 'services_table', 'staff_table')),
  content text,
  draft_content text,
  client_editable boolean not null default false,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (business_id, key)
);

-- At most one of each structured kind per business — compileSystemPrompt
-- would silently render the same table twice otherwise.
create unique index if not exists prompt_sections_one_structured_kind_per_business
  on public.prompt_sections (business_id, kind)
  where kind != 'text';

create index if not exists prompt_sections_business_sort_idx
  on public.prompt_sections (business_id, sort_order);

alter table public.prompt_sections enable row level security;

-- Clients read/write only their own business's sections, and only rows
-- marked client_editable (mutation restricted to draft_content — enforced
-- in application code in later tasks, since column-level RLS on a single
-- UPDATE statement would block updating other columns like sort_order that
-- clients never touch anyway; the admin-only columns are simply never sent
-- from the client action).
create policy "clients can read their own business's sections"
  on public.prompt_sections for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "clients can update draft_content on their own editable sections"
  on public.prompt_sections for update
  using (
    client_editable = true
    and business_id in (select id from public.businesses where user_id = auth.uid())
  );
