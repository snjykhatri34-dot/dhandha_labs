"""Read and write the Supabase `visits` and `daily_reports` tables and `recordings` bucket (schemas.md), via REST.

Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (env or .env). RLS allows only the service role,
so this runs server side only; never ship the key to a browser.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

import llm

BUCKET = "recordings"


class StoreError(Exception):
    pass


def configured():
    llm.load_env()
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))


def _request(method, path, body=None, prefer=None, timeout=60):
    if not configured():
        raise StoreError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(
        os.environ["SUPABASE_URL"].rstrip("/") + path, method=method, headers=headers,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        raise StoreError(f"Supabase {method} {path.split('?')[0]} HTTP {e.code}: {e.read()[:300]!r}") from e


def upsert_visits(cards, status="analysed"):
    """Insert or update one `visits` row per scorecard.

    Only id, store, salesperson, status and analysis are sent, so an existing row keeps its
    media_path and recorded_at (set at upload time).
    """
    rows = [{"id": c["visit_id"], "store": c["store"], "salesperson": c["salesperson"],
             "status": status, "analysis": c} for c in cards]
    _request("POST", "/rest/v1/visits?on_conflict=id", rows, prefer="resolution=merge-duplicates,return=minimal")
    return [r["id"] for r in rows]


def pending_visits():
    """Visits whose clip is uploaded but not analysed yet, oldest first."""
    rows = _request("GET", "/rest/v1/visits?status=eq.uploaded&order=created_at"
                           "&select=id,store,salesperson,recorded_at,media_path")
    return json.loads(rows)


def download(media_path):
    """The clip's bytes from the private `recordings` bucket."""
    return _request("GET", f"/storage/v1/object/{BUCKET}/{urllib.parse.quote(media_path)}", timeout=300)


def mark_failed(visit_id, error):
    """`failed`, with the reason in analysis.error so the app can show why."""
    _request("PATCH", f"/rest/v1/visits?id=eq.{urllib.parse.quote(visit_id)}",
             {"status": "failed", "analysis": {"error": error[:500]}}, prefer="return=minimal")


def visits_for_date(date):
    """The scorecards of every `analysed` visit on that date (analysis.date), for the daily report."""
    rows = _request("GET", f"/rest/v1/visits?status=eq.analysed&analysis->>date=eq.{date}&select=analysis")
    return [r["analysis"] for r in json.loads(rows)]


def upsert_report(date, numbers, markdown, actions, store_id="ALL"):
    """One `daily_reports` row per (date, store). A re-run updates it in place and keeps its id,
    so the UX's ux_notifications row (sent once per report id) still points at it."""
    row = {"report_date": date, "store": store_id, "numbers": numbers, "markdown": markdown, "actions": actions}
    body = _request("POST", "/rest/v1/daily_reports?on_conflict=report_date,store", [row],
                    prefer="resolution=merge-duplicates,return=representation")
    return json.loads(body)[0]["id"]
