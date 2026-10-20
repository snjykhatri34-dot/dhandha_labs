"use client";

// The upload form. Checks store, salesperson, time and the clip in the browser, then sends it:
// uploading → analysing → done, with an error and a Retry button if any step fails.
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { UploadCompleteResponse, UploadStartBody, UploadStartResponse } from "@/app/api/ux/upload/shared";
import type { VisitStatusResponse } from "@/app/api/ux/visits/[id]/route";
import { Spinner } from "@/components/ux/shared";
import {
  ACCEPT,
  MAX_FILE_MB,
  formatDuration,
  formatMb,
  validateClip,
  validateFields,
  type ClipInfo,
  type FieldErrors,
} from "./validate";

export interface UploadFormProps {
  stores: readonly string[];
  /** Known salespeople per store, from visitRepo.list(). New names can still be typed. */
  salespeopleByStore: Record<string, string[]>;
}

/** Reads the clip's duration from a hidden media element. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      resolve(value);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}

function nowLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function UploadForm({ stores, salespeopleByStore }: UploadFormProps) {
  const [store, setStore] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [recordedAt, setRecordedAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [clip, setClip] = useState<ClipInfo | null>(null);
  const [reading, setReading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const stopPolling = useRef<(() => void) | null>(null);
  useEffect(() => () => stopPolling.current?.(), []);
  const busy = phase.kind === "uploading" || phase.kind === "analysing";
  /** Editing the form clears a finished result or error. */
  const resetResult = () => {
    if (phase.kind === "done" || phase.kind === "error") setPhase({ kind: "idle" });
  };

  async function onFileChange(f: File | null) {
    resetResult();
    setFile(f);
    setClip(null);
    if (!f) return;
    setReading(true);
    const durationSec = await readDuration(f);
    const info: ClipInfo = { type: f.type, sizeBytes: f.size, durationSec };
    setClip(info);
    setReading(false);
    setErrors((e) => ({ ...e, file: validateClip(info) ?? undefined }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: FieldErrors = { ...validateFields({ store, salesperson, recordedAt }) };
    const clipError = validateClip(clip);
    if (clipError) next.file = clipError;
    setErrors(next);
    if (Object.keys(next).length === 0) void send();
  }

  async function send() {
    if (!file || !clip) return;
    stopPolling.current?.();
    setPhase({ kind: "uploading", percent: 0 });
    const details = { store, salesperson: salesperson.trim(), recordedAt: withOffset(recordedAt) };

    // 1. Ask the server for a one-time upload link (only details are sent, not the file).
    let start: UploadStartResponse;
    try {
      start = await postJson<UploadStartResponse>("/api/ux/upload", {
        ...details,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        durationSec: clip.durationSec,
      } satisfies UploadStartBody);
    } catch (err) {
      setPhase({ kind: "error", message: errorText(err, "Couldn't reach the server. Check your connection.") });
      return;
    }
    if (!start.ok) {
      if (start.errors) setErrors(start.errors as FieldErrors);
      setPhase({ kind: "error", message: start.error });
      return;
    }

    // 2. Upload the clip straight to storage, with progress.
    try {
      await putWithProgress(start.url, start.headers, file, (percent) => setPhase({ kind: "uploading", percent }));
    } catch (err) {
      setPhase({ kind: "error", message: errorText(err, "The upload failed. Check your connection and try again.") });
      return;
    }

    // 3. Tell the server the clip is there: it creates the visit and starts analysis.
    let res: UploadCompleteResponse;
    try {
      res = await postJson<UploadCompleteResponse>("/api/ux/upload/complete", { ...details, path: start.path });
    } catch (err) {
      setPhase({ kind: "error", message: errorText(err, "The clip was uploaded but the visit wasn't created. Try again.") });
      return;
    }
    if (!res.ok) {
      setPhase({ kind: "error", message: res.error, visitId: res.id });
      return;
    }
    poll(res.id);
  }

  function poll(id: string) {
    setPhase({ kind: "analysing", visitId: id });
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    stopPolling.current = () => {
      stopped = true;
      clearTimeout(timer);
    };
    const tick = async () => {
      if (stopped) return;
      try {
        const r = await fetch(`/api/ux/visits/${encodeURIComponent(id)}`, { cache: "no-store" });
        const data = (await r.json()) as VisitStatusResponse;
        if (!data.ok) throw new Error(data.error);
        if (data.status === "analysed") return setPhase({ kind: "done", visitId: id });
        if (data.status === "failed") {
          return setPhase({ kind: "error", visitId: id, message: data.error ?? "Analysis failed." });
        }
      } catch (err) {
        // A dropped poll isn't fatal; keep trying until the time limit.
        console.warn("status poll failed", err);
      }
      if (Date.now() - started > POLL_LIMIT_MS) {
        return setPhase({
          kind: "error",
          visitId: id,
          stillRunning: true,
          message: `Visit ${id} is still being analysed. It will show on the owner page when it's done.`,
        });
      }
      timer = setTimeout(tick, POLL_EVERY_MS);
    };
    void tick();
  }

  const known = store ? salespeopleByStore[store] ?? [] : [];

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <fieldset disabled={busy} className="grid gap-5 disabled:opacity-60">
      <Field id="store" label="Store" error={errors.store}>
        <select
          id="store"
          value={store}
          onChange={(e) => {
            setStore(e.target.value);
            resetResult();
          }}
          className={inputClass(errors.store)}
          aria-invalid={!!errors.store}
        >
          <option value="">Choose a store</option>
          {stores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field id="salesperson" label="Salesperson" hint="Pick from the list or type a new name." error={errors.salesperson}>
        <input
          id="salesperson"
          list="salesperson-options"
          value={salesperson}
          onChange={(e) => {
            setSalesperson(e.target.value);
            resetResult();
          }}
          autoComplete="off"
          className={inputClass(errors.salesperson)}
          aria-invalid={!!errors.salesperson}
        />
        <datalist id="salesperson-options">
          {known.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </Field>

      <Field id="recordedAt" label="When the visit happened" error={errors.recordedAt}>
        <div className="flex gap-2">
          <input
            id="recordedAt"
            type="datetime-local"
            value={recordedAt}
            onChange={(e) => {
              setRecordedAt(e.target.value);
              resetResult();
            }}
            className={inputClass(errors.recordedAt)}
            aria-invalid={!!errors.recordedAt}
          />
          <button
            type="button"
            onClick={() => {
              setRecordedAt(nowLocal());
              resetResult();
            }}
            className="shrink-0 rounded-lg border border-line px-3 text-sm hover:border-ink"
          >
            Now
          </button>
        </div>
      </Field>

      <Field
        id="clip"
        label="Counter clip"
        hint={`MP4 or MOV video, or M4A or MP3 audio. Up to 5 minutes and ${MAX_FILE_MB} MB.`}
        error={errors.file}
      >
        <input
          id="clip"
          type="file"
          accept={ACCEPT}
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-line file:px-3 file:py-2 file:text-sm file:font-medium"
          aria-invalid={!!errors.file}
        />
        {reading && <p className="mt-2 text-sm text-muted">Reading the clip…</p>}
        {file && clip && !reading && (
          <p className="mt-2 text-sm text-muted">
            {file.name} · {formatMb(clip.sizeBytes)}
            {clip.durationSec !== null && ` · ${formatDuration(clip.durationSec)}`}
          </p>
        )}
      </Field>

      </fieldset>

      <div>
        <button
          type="submit"
          disabled={reading || busy}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
        >
          {busy ? "Working…" : "Upload clip"}
        </button>
      </div>

      <Progress phase={phase} onRetry={() => (phase.kind === "error" && phase.stillRunning && phase.visitId ? poll(phase.visitId) : void send())} />
    </form>
  );
}

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number }
  | { kind: "analysing"; visitId: string }
  | { kind: "done"; visitId: string }
  | { kind: "error"; message: string; visitId?: string; stillRunning?: boolean };

const POLL_EVERY_MS = 1500;
const POLL_LIMIT_MS = 3 * 60_000;

const STEPS = ["Uploading", "Analysing", "Done"] as const;

function Progress({ phase, onRetry }: { phase: Phase; onRetry: () => void }) {
  if (phase.kind === "idle") return null;
  const active = phase.kind === "uploading" ? 0 : phase.kind === "analysing" ? 1 : phase.kind === "done" ? 2 : -1;
  return (
    <div className="grid gap-3" aria-live="polite">
      {phase.kind !== "error" && (
        <ol className="flex items-center gap-2 text-sm">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                i < active || phase.kind === "done" ? "bg-good-bg text-good" : i === active ? "bg-info-bg text-info" : "bg-line text-muted"
              }`}
            >
              {i === active && phase.kind !== "done" && <Spinner className="size-3" />}
              {label}
              {i === 0 && phase.kind === "uploading" && ` ${phase.percent}%`}
            </li>
          ))}
        </ol>
      )}
      {phase.kind === "analysing" && (
        <p className="text-sm text-muted">Visit {phase.visitId} saved. Building the scorecard…</p>
      )}
      {phase.kind === "done" && (
        <div role="status" className="rounded-xl border border-good/30 bg-good-bg p-4 text-sm">
          <p className="font-medium text-good">Scorecard ready for visit {phase.visitId}.</p>
          <p className="mt-1 text-muted">It waits for manager review before staff can see it.</p>
          <Link href={`/owner/visits/${phase.visitId}`} className="mt-2 inline-block font-medium underline">
            Open the scorecard
          </Link>
        </div>
      )}
      {phase.kind === "error" && (
        <div role="alert" className="rounded-xl border border-bad/30 bg-bad-bg p-4 text-sm">
          <p className="font-medium text-bad">{phase.stillRunning ? "Taking longer than usual" : "Upload didn't finish"}</p>
          <p className="mt-1">{phase.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-lg border border-ink px-3 py-1.5 text-sm font-medium"
          >
            {phase.stillRunning ? "Keep checking" : "Retry"}
          </button>
        </div>
      )}
    </div>
  );
}

/** "2026-10-20T17:45" (local) → "2026-10-20T17:45:00-04:00", so the server keeps the local date and time. */
function withOffset(local: string): string {
  const offsetMin = -new Date(local).getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `${local}:00${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

function errorText(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    return (await r.json()) as T;
  } catch {
    throw new Error(`The server answered ${r.status} without details.`);
  }
}

/** fetch() can't report upload progress, so the file goes up with XMLHttpRequest. */
function putWithProgress(url: string, headers: Record<string, string>, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let detail = "";
      try {
        const j = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        detail = j.message ?? j.error ?? "";
      } catch {}
      reject(new Error(`Storage refused the upload (${xhr.status})${detail ? `: ${detail}` : "."}`));
    };
    xhr.onerror = () => reject(new Error("The upload failed. Check your connection and try again."));
    xhr.send(file);
  });
}

function inputClass(error?: string) {
  return `block w-full rounded-lg border bg-paper px-3 py-2 text-sm ${error ? "border-bad" : "border-line"}`;
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
