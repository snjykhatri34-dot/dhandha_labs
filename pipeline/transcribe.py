"""Step 1: a counter clip (video or audio) → timestamped transcript + voice/face cues, via Gemini.

    python3 pipeline/transcribe.py clip.mp4           # prints the transcript and cues

The output is what evaluator/SOP.md takes as input: `[mm:ss] Speaker X: text` lines plus `observations`.
It also returns each turn's role and tone, and a readable version for people:
`[mm:ss] Salesperson: (Welcoming, courteous, and attentive) Good afternoon, ma'am.`
The prompt is evaluator/TRANSCRIBE.md.
"""
import argparse
import json
import mimetypes
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import llm  # noqa: E402

PROMPT = llm.ROOT / "evaluator" / "TRANSCRIBE.md"
MEDIA_TYPES = {".mp4": "video/mp4", ".mov": "video/quicktime", ".m4a": "audio/mp4", ".mp3": "audio/mpeg",
               ".wav": "audio/wav", ".webm": "video/webm"}
STAMP = re.compile(r"^\d\d:\d\d$")
ROLES = ("salesperson", "customer", "unknown")


def mime_of(path):
    return MEDIA_TYPES.get(Path(path).suffix.lower()) or mimetypes.guess_type(str(path))[0] or "video/mp4"


def transcribe(path):
    """Return {"transcript": "<[mm:ss] Speaker X: text lines>", "readable": "<[mm:ss] Role: (tone) text lines>",
    "turns": [{"at", "speaker", "role", "tone", "text"}], "observations": [...], "flags": [...]}."""
    last_error = None
    for _ in range(2):  # one retry if the reply isn't usable
        text = llm.gemini_media(PROMPT.read_text(), "Transcribe this counter clip.", path, mime_of(path))
        try:
            return _check(llm.parse_json(text))
        except (json.JSONDecodeError, ValueError) as e:
            last_error = e
    raise llm.LLMError(f"{Path(path).name}: no usable transcript after retry ({last_error})")


def _check(raw):
    """Turn Gemini's JSON into the SOP's input format, dropping anything that breaks its rules."""
    raw_turns, flags = raw.get("transcript") or [], list(raw.get("flags") or [])
    if not raw_turns:
        raise ValueError("empty transcript")
    turns, stamps, roles = [], set(), {}
    for t in raw_turns:
        at, speaker, said = t.get("at", ""), str(t.get("speaker", "")).strip(), str(t.get("text", "")).strip()
        if not STAMP.match(at) or at in stamps or not speaker or not said:
            raise ValueError(f"bad transcript turn: {t}")
        stamps.add(at)
        speaker = speaker.removeprefix("Speaker ").strip()
        # Role and tone are for people reading the transcript; a gap in them is flagged, not fatal.
        role = str(t.get("role") or "").strip().lower()
        if role not in ROLES:
            flags.append(f"no role for the turn at {at}")
            role = "unknown"
        if roles.setdefault(speaker, role) != role:
            flags.append(f"Speaker {speaker} labelled {roles[speaker]} and {role}; kept {roles[speaker]}")
            role = roles[speaker]
        tone = str(t.get("tone") or "").strip()
        if not tone:
            flags.append(f"no tone for the turn at {at}")
            tone = "Unclear"
        turns.append({"at": at, "speaker": speaker, "role": role, "tone": tone, "text": said})
    observations = []
    for o in raw.get("observations") or []:
        if o.get("at") in stamps and o.get("cue_type") in ("voice", "face"):
            observations.append(o)
        else:
            flags.append(f"dropped a cue not tied to a transcript line: {o.get('at')} {o.get('cue_type')}")
    return {
        "transcript": "".join(f"[{t['at']}] Speaker {t['speaker']}: {t['text']}\n" for t in turns),
        "readable": readable(turns),
        "turns": turns,
        "observations": observations,
        "flags": flags,
    }


def readable(turns):
    """`[mm:ss] Salesperson: (tone) text` lines. Unknown roles keep their speaker letter."""
    def who(t):
        return f"Speaker {t['speaker']}" if t["role"] == "unknown" else t["role"].capitalize()
    return "".join(f"[{t['at']}] {who(t)}: ({t['tone']}) {t['text']}\n" for t in turns)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    result = transcribe(ap.parse_args().clip)
    print(result["readable"])
    print(json.dumps({"observations": result["observations"], "flags": result["flags"]}, indent=2,
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
