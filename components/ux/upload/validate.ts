// Pure checks for the upload form. No DOM, no data access, so they can be unit-tested.
import { STORES, type Store } from "@/lib/types/scorecard";

export const MAX_DURATION_SEC = 5 * 60;
/** Matches Stream 2's `recordings` bucket (file_size_limit 100 MB, supabase/migrations). */
export const MAX_FILE_MB = 100;
/** The bucket's allowed_mime_types: mp4/mov video, m4a/mp3 audio. */
export const ALLOWED_TYPES = ["video/mp4", "video/quicktime", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/mpeg"] as const;
export const ACCEPT = [...ALLOWED_TYPES, ".mp4", ".mov", ".m4a", ".mp3"].join(",");

export interface UploadFields {
  store: string;
  salesperson: string;
  /** Value of <input type="datetime-local">, e.g. "2026-10-20T17:45". */
  recordedAt: string;
}

export interface ClipInfo {
  type: string;
  sizeBytes: number;
  /** Seconds, read from the media element's metadata. null = couldn't be read. */
  durationSec: number | null;
}

export type FieldErrors = Partial<Record<keyof UploadFields | "file", string>>;

export function isStore(value: string): value is Store {
  return (STORES as readonly string[]).includes(value);
}

export function validateFields(f: UploadFields, now: Date = new Date()): FieldErrors {
  const errors: FieldErrors = {};
  if (!isStore(f.store)) errors.store = "Choose a store.";
  const name = f.salesperson.trim();
  if (!name) errors.salesperson = "Enter the salesperson's name.";
  else if (name.length > 40) errors.salesperson = "Keep the name under 40 characters.";
  if (!f.recordedAt) {
    errors.recordedAt = "Enter when the visit happened.";
  } else {
    const t = new Date(f.recordedAt);
    if (Number.isNaN(t.getTime())) errors.recordedAt = "That time isn't valid.";
    // Allow a few minutes of clock drift between phone and server.
    else if (t.getTime() > now.getTime() + 5 * 60_000) errors.recordedAt = "The visit time can't be in the future.";
  }
  return errors;
}

export function validateClip(clip: ClipInfo | null): string | null {
  if (!clip) return "Choose a video or audio clip.";
  if (!clip.type.startsWith("video/") && !clip.type.startsWith("audio/")) {
    return "That file isn't a video or audio clip.";
  }
  if (!(ALLOWED_TYPES as readonly string[]).includes(clip.type)) {
    return "Use an MP4 or MOV video, or an M4A or MP3 audio file.";
  }
  if (clip.sizeBytes > MAX_FILE_MB * 1024 * 1024) {
    return `The clip is ${formatMb(clip.sizeBytes)}. The limit is ${MAX_FILE_MB} MB.`;
  }
  // Some browsers can't decode every codec (e.g. Chromium without H.264, or iPhone HEVC .mov), so the length
  // may be unreadable even for a good clip. Type and size are checked; let it through and Gemini reads it.
  if (clip.durationSec === null || !Number.isFinite(clip.durationSec)) return null;
  // No minimum length; a zero-length clip is empty or broken.
  if (clip.durationSec <= 0) return "The clip is empty. Try another file.";
  if (clip.durationSec > MAX_DURATION_SEC) return `The clip is ${formatDuration(clip.durationSec)}. It must be 5 minutes or less.`;
  return null;
}

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
