-- Counter Intelligence: initial schema (Stream 2).
-- Tables follow schemas.md. Only the server (service role) reads or writes:
-- RLS is on everywhere with no policies, so anon/authenticated keys see nothing.

-- Visits: one row per counter clip. `analysis` holds the visit scorecard JSON.
create table public.visits (
  id          text primary key,                  -- e.g. 'B2-1014'
  store       text not null,                     -- B1 / B2 / B3
  salesperson text not null,
  recorded_at timestamptz,                       -- null when the source has no time of day
  media_path  text,                              -- path in the `recordings` bucket
  status      text not null default 'uploaded'
              check (status in ('uploaded', 'analysed', 'failed')),
  analysis    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index visits_store_idx on public.visits (store);
create index visits_date_idx on public.visits ((analysis ->> 'date'));
create index visits_recorded_at_idx on public.visits (recorded_at);
create index visits_analysis_idx on public.visits using gin (analysis);

-- Daily report: one row per date and store ('ALL' = all stores).
-- Inserting a row is the "report ready" signal for the UX webhook.
create table public.daily_reports (
  id          uuid primary key default gen_random_uuid(),
  report_date date not null,
  store       text not null default 'ALL',
  numbers     jsonb not null,                    -- same shape as expected_outputs/daily_report_reference.json
  markdown    text not null,
  created_at  timestamptz not null default now(),
  unique (report_date, store)
);

-- UX tables (owned by the UX team; created here so all migrations live in one place).
create table public.ux_visit_reviews (
  visit_id    text primary key references public.visits (id) on delete cascade,
  status      text not null check (status in ('approved', 'rejected')),
  reviewed_by text not null,
  reviewed_at timestamptz not null default now()
);

create table public.ux_notifications (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null unique references public.daily_reports (id) on delete cascade,
  channel    text not null,                      -- e.g. 'whatsapp'
  status     text not null,                      -- e.g. 'pending', 'sent', 'failed'
  sent_at    timestamptz,
  error      text,
  created_at timestamptz not null default now()
);

-- Keep visits.updated_at current.
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger visits_set_updated_at
  before update on public.visits
  for each row execute function public.set_updated_at();

alter table public.visits           enable row level security;
alter table public.daily_reports    enable row level security;
alter table public.ux_visit_reviews enable row level security;
alter table public.ux_notifications enable row level security;

-- Recordings bucket (private). Path: <store>/<date>/<store>_<salesperson>_<date>_<visitno>.mp4|m4a
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings', 'recordings', false, 104857600,  -- 100 MB
  array['video/mp4', 'video/quicktime', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/mpeg']
);
