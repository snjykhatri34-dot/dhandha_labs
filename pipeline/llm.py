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
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLAUDE_MODEL = "claude-opus-5-5"
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")


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
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"temperature": 0.2},
    }
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        raise LLMError(f"Gemini HTTP {e.code}: {e.read()[:300]!r}") from e
    try:
        return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
    except (KeyError, IndexError) as e:
        raise LLMError(f"Gemini returned no text: {str(data)[:300]}") from e


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
