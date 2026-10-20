import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as startUpload } from "@/app/api/ux/upload/route";
import { POST as completeUpload } from "@/app/api/ux/upload/complete/route";
import { PUT as mockPut } from "@/app/api/ux/upload/mock-put/route";
import { GET } from "@/app/api/ux/visits/[id]/route";
import { resetMockState } from "@/lib/data/mock";
import { clipPath } from "@/lib/storage/path";

const json = (url: string, body: unknown) =>
  new NextRequest(`http://test${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

const details = { store: "B2", salesperson: "Priya", recordedAt: "2026-10-20T17:30:00+05:30" };
const clipInfo = { fileName: "counter.mp4", contentType: "video/mp4", sizeBytes: 1024, durationSec: 150 };

async function status(id: string) {
  const res = await GET(new NextRequest(`http://test/api/ux/visits/${id}`), { params: Promise.resolve({ id }) });
  return res.json();
}

/** What the browser does: get a link, PUT the file to it, then complete. */
async function upload(overrides: Partial<typeof details> = {}) {
  const d = { ...details, ...overrides };
  const start = await (await startUpload(json("/api/ux/upload", { ...d, ...clipInfo }))).json();
  expect(start).toMatchObject({ ok: true, method: "PUT" });
  const put = await mockPut(
    new NextRequest(`http://test${start.url}`, { method: "PUT", body: new Uint8Array(1024), headers: start.headers }),
  );
  expect(put.status).toBe(200);
  return { start, complete: await completeUpload(json("/api/ux/upload/complete", { ...d, path: start.path })) };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => resetMockState());
afterAll(() => rm(join(process.cwd(), ".uploads"), { recursive: true, force: true }));

describe("upload: link → PUT → complete", () => {
  it("never sends the file through /api/ux/upload, then creates a visit that gets a scorecard", async () => {
    const { start, complete } = await upload();
    expect(start.path).toMatch(/^B2\/2026-10-20\/B2_Priya_2026-10-20_.+\.mp4$/);
    const body = await complete.json();
    expect(complete.status).toBe(200);
    expect(body.id).toMatch(/^B2-\d+$/);

    await settle(); // mock analysis runs after MOCK_ANALYSE_DELAY_MS (0 in tests)
    expect(await status(body.id)).toMatchObject({ ok: true, id: body.id, status: "analysed" });
  });

  it("re-checks fields on the server before issuing a link", async () => {
    const res = await startUpload(json("/api/ux/upload", { ...details, store: "B9", ...clipInfo, durationSec: 400 }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.stage).toBe("validate");
    expect(Object.keys(body.errors).sort()).toEqual(["file", "store"]);
  });

  it("refuses to complete when the clip never arrived", async () => {
    const start = await (await startUpload(json("/api/ux/upload", { ...details, ...clipInfo }))).json();
    const res = await completeUpload(json("/api/ux/upload/complete", { ...details, path: start.path }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/didn't arrive/);
  });

  it("rejects a path that doesn't belong to the store and date", async () => {
    const res = await completeUpload(json("/api/ux/upload/complete", { ...details, path: "B1/2026-10-20/B1_x_2026-10-20_1.mp4" }));
    expect(res.status).toBe(400);
  });

  it("an upload link works once", async () => {
    const start = await (await startUpload(json("/api/ux/upload", { ...details, ...clipInfo }))).json();
    const put = () => mockPut(new NextRequest(`http://test${start.url}`, { method: "PUT", body: new Uint8Array(8) }));
    expect((await put()).status).toBe(200);
    expect((await put()).status).toBe(400);
  });

  it("shows a failed analysis as failed, with its error", async () => {
    const { complete } = await upload({ salesperson: "Test fail" });
    const { id } = await complete.json();
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
