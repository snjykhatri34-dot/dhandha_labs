-- Daily report action lines (Stream 2's report.py), one per section, for the owner page.
-- Keys: headline, lostSales, lostDemand, storePattern, salespeople, busiestHours, followUps.
alter table public.daily_reports
  add column actions jsonb not null default '{}'::jsonb;
