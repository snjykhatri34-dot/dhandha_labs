-- Transcripts and owner messages for analysed clips (Stream 2).
-- Separate tables so the shared `visits` contract in schemas.md is unchanged.
-- Written by pipeline/evaluate.py --pending with the service role; RLS on, no policies, like the rest.

-- One row per visit: what Gemini heard and saw in the clip.
create table public.visit_transcripts (
  visit_id     text primary key references public.visits (id) on delete cascade,
  turns        jsonb not null,                   -- [{at, speaker, role, tone, text}]
  readable     text not null,                    -- "[mm:ss] Salesperson: (tone) text" lines, for people
  transcript   text not null,                    -- "[mm:ss] Speaker X: text" lines, the SOP's input
  observations jsonb not null default '[]',      -- voice/face cues the SOP may cite
  flags        jsonb not null default '[]',
  model        text,                             -- e.g. gemini-3.8-flash
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One row per visit and channel: the text built from the scorecard (pipeline/message.py).
-- Sending it is the UX layer's job; `sent_at` stays null until then.
create table public.visit_messages (
  visit_id   text not null references public.visits (id) on delete cascade,
  channel    text not null default 'whatsapp',
  audience   text not null default 'owner',
  body       text not null,
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (visit_id, channel)
);

create trigger visit_transcripts_set_updated_at
  before update on public.visit_transcripts
  for each row execute function public.set_updated_at();

create trigger visit_messages_set_updated_at
  before update on public.visit_messages
  for each row execute function public.set_updated_at();

alter table public.visit_transcripts enable row level security;
alter table public.visit_messages    enable row level security;
