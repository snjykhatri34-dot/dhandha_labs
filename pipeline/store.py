"""Write scorecards to the Supabase `visits` table (schemas.md), via the REST API.

Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (env or .env). RLS allows only the service role,
so this runs server side only; never ship the key to a browser.
"""
import json
import os
import urllib.error
import urllib.request

import llm


class StoreError(Exception):
    pass


def configured():
    llm.load_env()
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))


def upsert_visits(cards):
    """Insert or update one `visits` row per scorecard, marked `analysed`.

    Only id, store, salesperson, status and analysis are sent, so an existing row keeps its
    media_path and recorded_at (set at upload time).
    """
    if not configured():
        raise StoreError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    rows = [{"id": c["visit_id"], "store": c["store"], "salesperson": c["salesperson"],
             "status": "analysed", "analysis": c} for c in cards]
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/visits?on_conflict=id"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(
        url, data=json.dumps(rows, ensure_ascii=False).encode(), method="POST",
        headers={"Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
                 "Prefer": "resolution=merge-duplicates,return=minimal"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60):
            pass
    except urllib.error.HTTPError as e:
        raise StoreError(f"Supabase HTTP {e.code}: {e.read()[:300]!r}") from e
    return [r["id"] for r in rows]
