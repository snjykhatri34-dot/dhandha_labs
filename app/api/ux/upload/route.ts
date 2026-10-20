// Upload, step 1 of 2. POST /api/ux/upload (JSON, no file):
//   { store, salesperson, recordedAt, fileName, contentType, sizeBytes, durationSec }
// Checks the fields and returns a one-time link the browser uploads the clip to directly.
// Step 2 is POST /api/ux/upload/complete once the upload has finished.
import { NextResponse, type NextRequest } from "next/server";
import { clipStore } from "@/lib/storage";
import { message, type UploadFailure, type UploadStartBody, type UploadStartResponse } from "./shared";
import { isStore, validateClip, validateFields } from "@/components/ux/upload/validate";

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as Partial<UploadStartBody> | null;
  if (!b) return fail(400, { ok: false, stage: "validate", error: "The request wasn't valid JSON." });

  const store = String(b.store ?? "");
  const salesperson = String(b.salesperson ?? "").trim();
  const recordedAt = String(b.recordedAt ?? "");
  // Check again on the server: the browser checks can be skipped.
  const errors: Record<string, string> = { ...validateFields({ store, salesperson, recordedAt }) } as Record<string, string>;
  const clipError = validateClip(
    b.contentType
      ? {
          type: String(b.contentType),
          sizeBytes: Number(b.sizeBytes) || 0,
          durationSec: Number.isFinite(Number(b.durationSec)) && b.durationSec !== null ? Number(b.durationSec) : null,
        }
      : null,
  );
  if (clipError) errors.file = clipError;
  if (Object.keys(errors).length > 0 || !isStore(store)) {
    return fail(400, { ok: false, stage: "validate", error: "Some fields need fixing.", errors });
  }

  try {
    const target = await clipStore.createUpload({
      store,
      salesperson,
      date: recordedAt.slice(0, 10),
      fileName: String(b.fileName ?? ""),
      contentType: String(b.contentType),
    });
    return NextResponse.json<UploadStartResponse>({ ok: true, ...target });
  } catch (e) {
    console.error("[ux/upload] couldn't create upload link", e);
    return fail(500, { ok: false, stage: "start", error: `Couldn't prepare the upload: ${message(e)}` });
  }
}

function fail(status: number, body: UploadFailure) {
  return NextResponse.json<UploadFailure>(body, { status });
}
