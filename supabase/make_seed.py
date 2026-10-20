"""Print supabase/seed.sql from data/sample_day/visits_2026-10-17.json."""
import json
import sys

visits = json.load(open("data/sample_day/visits_2026-10-17.json"))
data = json.dumps(visits, separators=(",", ":"), ensure_ascii=False).replace("'", "''")
sys.stdout.write(
    "-- Seed: the 102 analysed visits from data/sample_day/visits_2026-10-17.json (synthetic).\n"
    "-- Regenerate with: python3 supabase/make_seed.py > supabase/seed.sql\n"
    "-- recorded_at = date + start, Asia/Kolkata. No media for these visits.\n"
    "insert into public.visits (id, store, salesperson, recorded_at, status, analysis)\n"
    "select v->>'visit_id', v->>'store', v->>'salesperson',\n"
    "       ((v->>'date') || ' ' || (v->>'start') || ':00+05:30')::timestamptz,\n"
    "       'analysed', v\n"
    f"from jsonb_array_elements('{data}'::jsonb) as v\n"
    "on conflict (id) do nothing;\n"
)
