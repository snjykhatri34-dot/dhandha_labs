"use client";

// The upload form (PR A1). Validates store, salesperson, time and the clip in the browser.
// Sending the clip (storage + visit row + analysis) is added in PR A2, ux/upload-flow.
import { useState, type FormEvent } from "react";
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
  const [ready, setReady] = useState(false);

  async function onFileChange(f: File | null) {
    setReady(false);
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
    const next: FieldErrors = { ...validateFields({ store, salesperson, recordedAt }) };
    const clipError = validateClip(clip);
    if (clipError) next.file = clipError;
    setErrors(next);
    setReady(Object.keys(next).length === 0);
  }

  const known = store ? salespeopleByStore[store] ?? [] : [];

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <Field id="store" label="Store" error={errors.store}>
        <select
          id="store"
          value={store}
          onChange={(e) => {
            setStore(e.target.value);
            setReady(false);
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
            setReady(false);
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
              setReady(false);
            }}
            className={inputClass(errors.recordedAt)}
            aria-invalid={!!errors.recordedAt}
          />
          <button
            type="button"
            onClick={() => {
              setRecordedAt(nowLocal());
              setReady(false);
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
        hint={`Video or audio, 1 to 5 minutes, up to ${MAX_FILE_MB} MB.`}
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

      <div>
        <button
          type="submit"
          disabled={reading}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
        >
          Check and upload
        </button>
      </div>

      {ready && (
        <div role="status" className="rounded-xl border border-good/30 bg-good-bg p-4 text-sm">
          <p className="font-medium text-good">Everything checks out.</p>
          <p className="mt-1">
            {store} · {salesperson.trim()} · {recordedAt.replace("T", " ")} · {file?.name}
          </p>
          <p className="mt-1 text-muted">Sending the clip for analysis comes in the next step (upload flow).</p>
        </div>
      )}
    </form>
  );
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
