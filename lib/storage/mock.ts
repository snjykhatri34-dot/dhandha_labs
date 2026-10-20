// Mock ClipStore: writes clips to the local .uploads/ folder (git-ignored).
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { clipPath, uploadStamp } from "./path";
import type { ClipStore } from "./types";

const ROOT = join(process.cwd(), ".uploads");

export const mockClipStore: ClipStore = {
  async save(clip) {
    const path = clipPath(clip, uploadStamp());
    const file = join(ROOT, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, clip.bytes);
    return { path };
  },
};
