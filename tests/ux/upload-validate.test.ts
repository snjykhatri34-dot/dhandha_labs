import { describe, expect, it } from "vitest";
import { validateClip, validateFields } from "@/components/ux/upload/validate";

const NOW = new Date("2026-10-20T18:00:00");
const ok = { store: "B2", salesperson: "Priya", recordedAt: "2026-10-20T17:30" };
const MB = 1024 * 1024;

describe("validateFields", () => {
  it("accepts a complete form", () => {
    expect(validateFields(ok, NOW)).toEqual({});
  });
  it("needs a known store, a name and a time", () => {
    const e = validateFields({ store: "B9", salesperson: "  ", recordedAt: "" }, NOW);
    expect(Object.keys(e).sort()).toEqual(["recordedAt", "salesperson", "store"]);
  });
  it("rejects a time in the future", () => {
    expect(validateFields({ ...ok, recordedAt: "2026-10-20T19:00" }, NOW).recordedAt).toMatch(/future/);
  });
});

describe("validateClip", () => {
  it("accepts a 3-minute video and a 2-minute audio clip", () => {
    expect(validateClip({ type: "video/mp4", sizeBytes: 80 * MB, durationSec: 180 })).toBeNull();
    expect(validateClip({ type: "audio/mp4", sizeBytes: 3 * MB, durationSec: 120 })).toBeNull();
  });
  it("only accepts the formats the recordings bucket allows", () => {
    expect(validateClip({ type: "video/quicktime", sizeBytes: MB, durationSec: 120 })).toBeNull();
    expect(validateClip({ type: "audio/mpeg", sizeBytes: MB, durationSec: 120 })).toBeNull();
    expect(validateClip({ type: "video/webm", sizeBytes: MB, durationSec: 120 })).toMatch(/MP4 or MOV/);
  });
  it("rejects a missing file and non-media files", () => {
    expect(validateClip(null)).toMatch(/Choose/);
    expect(validateClip({ type: "application/pdf", sizeBytes: MB, durationSec: 120 })).toMatch(/isn't a video/);
  });
  it("has no minimum length, a 5-minute maximum, and rejects empty clips", () => {
    expect(validateClip({ type: "video/mp4", sizeBytes: MB, durationSec: 8 })).toBeNull();
    expect(validateClip({ type: "video/mp4", sizeBytes: MB, durationSec: 59 })).toBeNull();
    expect(validateClip({ type: "video/mp4", sizeBytes: MB, durationSec: 0 })).toMatch(/empty/);
    expect(validateClip({ type: "video/mp4", sizeBytes: MB, durationSec: 301 })).toMatch(/5 minutes or less/);
    expect(validateClip({ type: "video/mp4", sizeBytes: MB, durationSec: 60 })).toBeNull();
    expect(validateClip({ type: "video/mp4", sizeBytes: MB, durationSec: 300 })).toBeNull();
  });
  it("rejects oversized files; lets an unreadable duration through", () => {
    expect(validateClip({ type: "video/mp4", sizeBytes: 101 * MB, durationSec: 120 })).toMatch(/limit is 100 MB/);
    expect(validateClip({ type: "video/mp4", sizeBytes: MB, durationSec: null })).toBeNull();
  });
});
