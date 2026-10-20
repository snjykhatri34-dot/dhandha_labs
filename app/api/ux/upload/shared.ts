// Types and helpers shared by the two upload routes and the upload form.
import type { UploadTarget } from "@/lib/storage/types";

export type UploadStage = "validate" | "start" | "upload" | "complete" | "create" | "analyse";

export type UploadFailure = { ok: false; stage: UploadStage; error: string; errors?: Record<string, string>; id?: string };
export type UploadStartResponse = ({ ok: true } & UploadTarget) | UploadFailure;
export type UploadCompleteResponse = { ok: true; id: string } | UploadFailure;

export interface UploadStartBody {
  store: string;
  salesperson: string;
  recordedAt: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  durationSec: number | null;
}

export function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
