// POST /api/ux/upload (multipart): store the clip, create a pending visit, start analysis.
// Fields: store, salesperson, recordedAt (ISO with offset), durationSec, clip (file).
import { NextResponse, type NextRequest } from "next/server";
import { analyser, visits } from "@/lib/data";
import { clipStore } from "@/lib/storage";
import { isStore, validateClip, validateFields } from "@/components/ux/upload/validate";

export type UploadResponse =
  | { ok: true; id: string }
  | { ok: false; stage: "validate" | "store" | "create" | "analyse"; error: string; errors?: Record<string, string>; id?: string };

function fail(status: number, body: Extract<UploadResponse, { ok: false }>) {
  return NextResponse.json<UploadResponse>(body, { status });
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, { ok: false, stage: "validate", error: "The upload didn't arrive as a form. Try again." });
  }

  const store = String(form.get("store") ?? "");
  const salesperson = String(form.get("salesperson") ?? "").trim();
  const recordedAt = String(form.get("recordedAt") ?? "");
  const durationRaw = Number(form.get("durationSec"));
  const clip = form.get("clip");

  // Check again on the server: the browser checks can be skipped.
  const errors: Record<string, string> = { ...validateFields({ store, salesperson, recordedAt }) } as Record<string, string>;
  const file = clip instanceof File ? clip : null;
  const clipError = validateClip(
    file ? { type: file.type, sizeBytes: file.size, durationSec: Number.isFinite(durationRaw) ? durationRaw : null } : null,
  );
  if (clipError) errors.file = clipError;
  if (Object.keys(errors).length > 0 || !file || !isStore(store)) {
    return fail(400, { ok: false, stage: "validate", error: "Some fields need fixing.", errors });
  }

  let mediaPath: string;
  try {
    const saved = await clipStore.save({
      store,
      salesperson,
      date: recordedAt.slice(0, 10),
      fileName: file.name,
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    mediaPath = saved.path;
  } catch (e) {
    console.error("[ux/upload] store failed", e);
    return fail(500, { ok: false, stage: "store", error: `Couldn't save the clip: ${message(e)}` });
  }

  let id: string;
  try {
    id = (await visits.create({ store, salesperson, recordedAt, mediaPath })).id;
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

  console.info("[ux/upload] ok", { id, store, salesperson, mediaPath });
  return NextResponse.json<UploadResponse>({ ok: true, id });
}

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
