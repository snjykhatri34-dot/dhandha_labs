// Mock ClipStore: the "one-time upload link" is our own /api/ux/upload/mock-put route,
// which writes the clip to the local .uploads/ folder (git-ignored). Only used with DATA_SOURCE=mock.
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { randomBytes } from "node:crypto";
import { clipPath, uploadStamp } from "./path";
import type { ClipStore } from "./types";

const ROOT = join(process.cwd(), ".uploads");

// Upload tokens live on globalThis so they survive dev-mode reloads, like the mock data layer.
const g = globalThis as typeof globalThis & { __uxUploadTokens?: Map<string, string> };
const tokens = () => (g.__uxUploadTokens ??= new Map());

function fileFor(path: string): string {
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + "/")) throw new Error("Invalid clip path.");
  return file;
}

export const mockClipStore: ClipStore = {
  async createUpload(clip) {
    const path = clipPath(clip, uploadStamp());
    const token = randomBytes(16).toString("hex");
    tokens().set(token, path);
    const url = `/api/ux/upload/mock-put?token=${token}`;
    return { path, url, method: "PUT", headers: { "Content-Type": clip.contentType } };
  },
  async exists(path) {
    try {
      return (await stat(fileFor(path))).isFile();
    } catch {
      return false;
    }
  },
};

/** Used by the mock-put route: writes the clip once per token. */
export async function writeMockUpload(token: string, bytes: Uint8Array): Promise<string> {
  const path = tokens().get(token);
  if (!path) throw new Error("This upload link has expired or was already used.");
  tokens().delete(token);
  const file = fileFor(path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return path;
}
