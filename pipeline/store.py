"""Read and write the Supabase `visits`, `visit_transcripts`, `visit_messages` and `daily_reports` tables
and the `recordings` bucket (schemas.md), via the REST API.

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


def _request(method, path, body=None, prefer=None, timeout=60, content_type=None, extra_headers=None):
    if not configured():
        raise StoreError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if body is not None:
        headers["Content-Type"] = content_type or "application/json"
    if prefer:
        headers["Prefer"] = prefer
    headers.update(extra_headers or {})
    req = urllib.request.Request(
        os.environ["SUPABASE_URL"].rstrip("/") + path, method=method, headers=headers,
        data=body if content_type or body is None else json.dumps(body, ensure_ascii=False).encode(),
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


def upload(media_path, data, mime_type):
    """Put a clip in the `recordings` bucket (replacing any file at that path)."""
    _request("POST", f"/storage/v1/object/{BUCKET}/{urllib.parse.quote(media_path)}", data, timeout=300,
             content_type=mime_type, extra_headers={"x-upsert": "true"})


def get_visit(visit_id):
    """The visit row (without its analysis), or None."""
    rows = json.loads(_request("GET", f"/rest/v1/visits?id=eq.{urllib.parse.quote(visit_id)}"
                                      "&select=id,store,salesperson,recorded_at,media_path,status"))
    return rows[0] if rows else None


def visit_exists(visit_id):
    return get_visit(visit_id) is not None


def add_visit(visit_id, store_id, salesperson, recorded_at, media_path):
    """Create (or reset) a visit as `uploaded`, so the next --pending run picks it up."""
    row = {"id": visit_id, "store": store_id, "salesperson": salesperson, "recorded_at": recorded_at,
           "media_path": media_path, "status": "uploaded", "analysis": None}
    _request("POST", "/rest/v1/visits?on_conflict=id", [row], prefer="resolution=merge-duplicates,return=minimal")


def save_transcript(visit_id, heard, model):
    """Upsert what the transcriber returned (transcribe.transcribe) into `visit_transcripts`."""
    row = {"visit_id": visit_id, "turns": heard["turns"], "readable": heard["readable"],
           "transcript": heard["transcript"], "observations": heard["observations"], "flags": heard["flags"],
           "model": model}
    _request("POST", "/rest/v1/visit_transcripts?on_conflict=visit_id", [row],
             prefer="resolution=merge-duplicates,return=minimal")


def save_message(visit_id, body, channel="whatsapp", audience="owner"):
    """Upsert the owner message for a visit into `visit_messages`. A re-run keeps `sent_at`."""
    row = {"visit_id": visit_id, "channel": channel, "audience": audience, "body": body}
    _request("POST", "/rest/v1/visit_messages?on_conflict=visit_id,channel", [row],
             prefer="resolution=merge-duplicates,return=minimal")
