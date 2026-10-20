// Upload, step 2 of 2. POST /api/ux/upload/complete (JSON): { store, salesperson, recordedAt, path }
// Checks the clip arrived in storage, creates the visit (status "uploaded"), then starts analysis.
import { NextResponse, type NextRequest } from "next/server";
import { analyser, visits } from "@/lib/data";
import { clipStore } from "@/lib/storage";
import { isStore, validateFields } from "@/components/ux/upload/validate";
import { message, type UploadCompleteResponse, type UploadFailure } from "../shared";

function fail(status: number, body: UploadFailure) {
  return NextResponse.json<UploadCompleteResponse>(body, { status });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const store = String(b?.store ?? "");
  const salesperson = String(b?.salesperson ?? "").trim();
  const recordedAt = String(b?.recordedAt ?? "");
  const path = String(b?.path ?? "");

  const errors = validateFields({ store, salesperson, recordedAt });
  // The path must be one we'd have issued for this store and date (see lib/storage/path.ts).
  const expectedPrefix = `${store}/${recordedAt.slice(0, 10)}/${store}_`;
  if (Object.keys(errors).length > 0 || !isStore(store) || !path.startsWith(expectedPrefix) || path.includes("..")) {
    return fail(400, { ok: false, stage: "validate", error: "The upload details don't match. Start the upload again." });
  }

  try {
    if (!(await clipStore.exists(path))) {
      return fail(409, { ok: false, stage: "complete", error: "The clip didn't arrive in storage. Try uploading again." });
    }
  } catch (e) {
    console.error("[ux/upload] couldn't check the clip", e);
    return fail(500, { ok: false, stage: "complete", error: `Couldn't check the clip: ${message(e)}` });
  }

  let id: string;
  try {
    id = (await visits.create({ store, salesperson, recordedAt, mediaPath: path })).id;
  } catch (e) {
    console.error("[ux/upload] create failed", e);
    return fail(500, { ok: false, stage: "create", error: `Saved the clip but couldn't create the visit: ${message(e)}` });
  }

  try {
    await analyser.analyse(id);
  } catch (e) {
    console.error("[ux/upload] analyse failed", id, e);
    return fail(502, { ok: false, stage: "analyse", id, error: `Visit ${id} was created but analysis didn't start: ${message(e)}` });
  }

  console.info("[ux/upload] ok", { id, store, salesperson, mediaPath: path });
  return NextResponse.json<UploadCompleteResponse>({ ok: true, id });
}
