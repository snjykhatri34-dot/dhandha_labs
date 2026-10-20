"""Step 1: a counter clip (video or audio) → timestamped transcript + voice/face cues, via Gemini.

    python3 pipeline/transcribe.py clip.mp4           # prints the transcript and cues

The output is what evaluator/SOP.md takes as input: `[mm:ss] Speaker X: text` lines plus `observations`.
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


def mime_of(path):
    return MEDIA_TYPES.get(Path(path).suffix.lower()) or mimetypes.guess_type(str(path))[0] or "video/mp4"


def transcribe(path):
    """Return {"transcript": "<[mm:ss] Speaker X: text lines>", "observations": [...], "flags": [...]}."""
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
    turns, flags = raw.get("transcript") or [], list(raw.get("flags") or [])
    if not turns:
        raise ValueError("empty transcript")
    lines, stamps = [], set()
    for t in turns:
        at, speaker, said = t.get("at", ""), str(t.get("speaker", "")).strip(), str(t.get("text", "")).strip()
        if not STAMP.match(at) or at in stamps or not speaker or not said:
            raise ValueError(f"bad transcript turn: {t}")
        stamps.add(at)
        lines.append(f"[{at}] Speaker {speaker.removeprefix('Speaker ').strip()}: {said}")
    observations = []
    for o in raw.get("observations") or []:
        if o.get("at") in stamps and o.get("cue_type") in ("voice", "face"):
            observations.append(o)
        else:
            flags.append(f"dropped a cue not tied to a transcript line: {o.get('at')} {o.get('cue_type')}")
    return {"transcript": "\n".join(lines) + "\n", "observations": observations, "flags": flags}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    result = transcribe(ap.parse_args().clip)
    print(result["transcript"])
    print(json.dumps({"observations": result["observations"], "flags": result["flags"]}, indent=2,
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
