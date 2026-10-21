"""One call surface for every model the pipeline uses.

complete(system, user) tries, in order:
  1. Claude via the Anthropic SDK, if ANTHROPIC_API_KEY is set
  2. Claude via the Claude Code CLI (`claude -p`), which needs no key inside a Claude Code session
  3. Gemini via its REST API, if GEMINI_API_KEY is set
and returns (text, provider_name). The first provider that succeeds wins.

gemini_media(system, user, path, mime) sends a video or audio clip to Gemini (the only provider that takes video).
"""
import base64
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLAUDE_MODEL = "claude-opus-5-5"
# gemini-2.5-pro returns 404 for new keys (Oct 2026). Pro models need a billed key; the free tier gets
# gemini-3.8-flash. Override with GEMINI_MODEL (env or .env), e.g. gemini-3.1-pro-preview once billing is on.
GEMINI_DEFAULT = "gemini-3.8-flash"


def load_env(path=ROOT / ".env"):
    """Read KEY=value lines from .env into os.environ (existing values win)."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if "=" in line:
            key, value = line.split("=", 1)
            if value.strip():
                os.environ.setdefault(key.strip(), value.strip())


class LLMError(Exception):
    pass


def _claude_sdk(system, user):
    import anthropic

    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=16000,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_config={"effort": "high"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if response.stop_reason == "refusal":
        raise LLMError(f"refused: {response.stop_details}")
    if response.stop_reason == "max_tokens":
        raise LLMError("hit max_tokens")
    return "".join(b.text for b in response.content if b.type == "text")


def _claude_cli(system, user):
    exe = shutil.which("claude")
    if not exe:
        raise LLMError("claude CLI not found")
    with tempfile.TemporaryDirectory() as tmp:
        system_file = Path(tmp) / "system.md"
        system_file.write_text(system)
        # Run from an empty directory so no project CLAUDE.md is loaded, with no tools.
        proc = subprocess.run(
            [exe, "-p", "--model", CLAUDE_MODEL, "--system-prompt-file", str(system_file),
             "--tools", "", "--output-format", "json", "--no-session-persistence"],
            input=user, capture_output=True, text=True, cwd=tmp, timeout=600,
        )
    if proc.returncode != 0:
        raise LLMError(f"claude CLI exit {proc.returncode}: {proc.stderr.strip()[:300]}")
    result = json.loads(proc.stdout)
    if result.get("is_error"):
        raise LLMError(f"claude CLI error: {result.get('result', '')[:300]}")
    return result["result"]


GEMINI_API = "https://generativelanguage.googleapis.com"
# Inline media is base64 (about 4/3 the size) and a request may be at most 100 MB, so bigger clips go
# through the Files API instead.
INLINE_MAX_BYTES = 70 * 1024 * 1024


def _gemini(system, user, media_part=None):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise LLMError("GEMINI_API_KEY not set")
    model = gemini_model()
    url = f"{GEMINI_API}/v1beta/models/{model}:generateContent"
    parts = ([media_part] if media_part else []) + [{"text": user}]
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": 0.2},
    }
    for attempt in range(4):
        req = urllib.request.Request(
            url, data=json.dumps(body).encode(), method="POST",
            headers={"Content-Type": "application/json", "x-goog-api-key": key},
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = json.load(resp)
            break
        except urllib.error.HTTPError as e:
            detail = e.read()
            # 503 "high demand" and short 429 rate limits are transient; a 429 asking for a long wait
            # (e.g. a daily or zero quota) is not, so fail fast on it.
            delay = _gemini_retry_delay(e.code, detail, attempt)
            if delay is None or attempt == 3:
                raise LLMError(f"Gemini {model} HTTP {e.code}: {detail[:300]!r}") from e
            time.sleep(delay)
    try:
        candidate = data["candidates"][0]
        text = "".join(p.get("text", "") for p in candidate["content"]["parts"] if not p.get("thought"))
    except (KeyError, IndexError) as e:
        raise LLMError(f"Gemini returned no text: {str(data)[:300]}") from e
    if candidate.get("finishReason") not in (None, "STOP"):
        raise LLMError(f"Gemini {model} stopped early: {candidate.get('finishReason')}")
    return text


def gemini_model():
    # Read at call time so a GEMINI_MODEL in .env (loaded by complete()) is honoured.
    return os.environ.get("GEMINI_MODEL") or GEMINI_DEFAULT


def _gemini_retry_delay(code, detail, attempt):
    """Seconds to wait before retrying a Gemini error, or None if it isn't worth retrying."""
    if code in (500, 503):
        return 5 * 2 ** attempt
    if code == 429:
        try:
            info = json.loads(detail)["error"].get("details", [])
            wait = next(float(d["retryDelay"].rstrip("s")) for d in info if "retryDelay" in d)
        except (ValueError, KeyError, StopIteration):
            wait = 10 * 2 ** attempt
        return wait + 1 if wait <= 90 else None
    return None


def gemini_media(system, user, media_path, mime_type):
    """Ask Gemini about a video or audio clip. Returns the reply text. (Claude can't take video.)"""
    load_env()
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise LLMError("GEMINI_API_KEY not set")
    data = Path(media_path).read_bytes()
    if len(data) <= INLINE_MAX_BYTES:
        part = {"inlineData": {"mimeType": mime_type, "data": base64.b64encode(data).decode()}}
        return _gemini(system, user, part)
    name, uri = _gemini_upload(key, data, mime_type, Path(media_path).name)
    try:
        return _gemini(system, user, {"fileData": {"mimeType": mime_type, "fileUri": uri}})
    finally:
        _gemini_call(key, "DELETE", f"/v1beta/{name}")


def _gemini_upload(key, data, mime_type, display_name):
    """Upload through the Files API (resumable, one chunk) and wait until the file is ACTIVE."""
    start = urllib.request.Request(
        f"{GEMINI_API}/upload/v1beta/files", method="POST",
        data=json.dumps({"file": {"display_name": display_name}}).encode(),
        headers={"x-goog-api-key": key, "Content-Type": "application/json",
                 "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
                 "X-Goog-Upload-Header-Content-Length": str(len(data)),
                 "X-Goog-Upload-Header-Content-Type": mime_type},
    )
    with urllib.request.urlopen(start, timeout=60) as resp:
        upload_url = resp.headers["X-Goog-Upload-URL"]
    finish = urllib.request.Request(
        upload_url, data=data, method="POST",
        headers={"X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize"},
    )
    with urllib.request.urlopen(finish, timeout=600) as resp:
        info = json.load(resp)["file"]
    for _ in range(60):  # video is processed after upload; wait up to ~5 minutes
        if info.get("state") == "ACTIVE":
            return info["name"], info["uri"]
        if info.get("state") == "FAILED":
            raise LLMError(f"Gemini could not process {display_name}")
        time.sleep(5)
        info = _gemini_call(key, "GET", f"/v1beta/{info['name']}")
    raise LLMError(f"Gemini file {display_name} not ready after 5 minutes")


def _gemini_call(key, method, path):
    req = urllib.request.Request(f"{GEMINI_API}{path}", method=method, headers={"x-goog-api-key": key})
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read()
    return json.loads(body) if body else {}


PROVIDERS = [
    ("claude-sdk", _claude_sdk, lambda: bool(os.environ.get("ANTHROPIC_API_KEY"))),
    ("claude-cli", _claude_cli, lambda: shutil.which("claude") is not None),
    ("gemini", _gemini, lambda: bool(os.environ.get("GEMINI_API_KEY"))),
]


def complete(system, user, only=None):
    """Return (text, provider). `only` restricts to one provider name."""
    load_env()
    errors = []
    for name, fn, available in PROVIDERS:
        if only and name != only:
            continue
        if not available():
            continue
        try:
            return fn(system, user), name
        except Exception as e:  # fall through to the next provider
            errors.append(f"{name}: {e}")
    raise LLMError("all providers failed: " + " | ".join(errors) if errors else "no provider available")


def parse_json(text):
    """Parse a JSON object from model text, tolerating ```json fences."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(text)
