"""One call surface for every model the pipeline uses.

complete(system, user) tries, in order:
  1. Claude via the Anthropic SDK, if ANTHROPIC_API_KEY is set
  2. Claude via the Claude Code CLI (`claude -p`), which needs no key inside a Claude Code session
  3. Gemini via its REST API, if GEMINI_API_KEY is set
and returns (text, provider_name). The first provider that succeeds wins.
"""
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


def _gemini(system, user):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise LLMError("GEMINI_API_KEY not set")
    # Read at call time so a GEMINI_MODEL in .env (loaded by complete()) is honoured.
    model = os.environ.get("GEMINI_MODEL") or GEMINI_DEFAULT
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
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
