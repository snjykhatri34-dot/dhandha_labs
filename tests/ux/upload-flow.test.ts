import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/ux/upload/route";
import { GET } from "@/app/api/ux/visits/[id]/route";
import { resetMockState } from "@/lib/data/mock";
import { clipPath } from "@/lib/storage/path";

function uploadRequest(fields: Record<string, string>, file?: File) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  if (file) body.set("clip", file);
  return new NextRequest("http://test/api/ux/upload", { method: "POST", body });
}

const clip = () => new File([new Uint8Array(1024)], "counter.mp4", { type: "video/mp4" });
const good = { store: "B2", salesperson: "Priya", recordedAt: "2026-10-20T17:30:00+05:30", durationSec: "150" };

async function status(id: string) {
  const res = await GET(new NextRequest(`http://test/api/ux/visits/${id}`), { params: Promise.resolve({ id }) });
  return res.json();
}

const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => resetMockState());
afterAll(() => rm(join(process.cwd(), ".uploads"), { recursive: true, force: true }));

describe("POST /api/ux/upload", () => {
  it("stores the clip, creates a pending visit and gets a scorecard", async () => {
    const res = await POST(uploadRequest(good, clip()));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.id).toMatch(/^B2-\d+$/);

    await settle(); // mock analysis runs after MOCK_ANALYSE_DELAY_MS (0 in tests)
    const s = await status(body.id);
    expect(s).toMatchObject({ ok: true, id: body.id, status: "analysed" });
  });

  it("re-checks fields on the server", async () => {
    const res = await POST(uploadRequest({ ...good, store: "B9", durationSec: "30" }, clip()));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.stage).toBe("validate");
    expect(Object.keys(body.errors).sort()).toEqual(["file", "store"]);
  });

  it("rejects a request without a clip", async () => {
    const res = await POST(uploadRequest(good));
    expect(res.status).toBe(400);
    expect((await res.json()).errors.file).toMatch(/Choose/);
  });

  it("shows a failed analysis as failed, with its error", async () => {
    const res = await POST(uploadRequest({ ...good, salesperson: "Test fail" }, clip()));
    const { id } = await res.json();
    await settle();
    const s = await status(id);
    expect(s.status).toBe("failed");
    expect(s.error).toMatch(/failed/);
  });
});

describe("GET /api/ux/visits/[id]", () => {
  it("returns 404 for an unknown visit", async () => {
    const res = await GET(new NextRequest("http://test"), { params: Promise.resolve({ id: "B9-0000" }) });
    expect(res.status).toBe(404);
  });
});

describe("clipPath", () => {
  it("follows schemas.md: <store>/<date>/<store>_<salesperson>_<date>_<visitno>.<ext>", () => {
    expect(
      clipPath({ store: "B2", salesperson: "Priya Sharma", date: "2026-10-20", fileName: "x.MOV", contentType: "video/quicktime" }, "174512-ab12"),
    ).toBe("B2/2026-10-20/B2_Priya-Sharma_2026-10-20_174512-ab12.mov");
    expect(clipPath({ store: "B1", salesperson: "Rohit", date: "2026-10-20", fileName: "voice", contentType: "audio/mp4" }, "1")).toBe(
      "B1/2026-10-20/B1_Rohit_2026-10-20_1.m4a",
    );
  });
});
