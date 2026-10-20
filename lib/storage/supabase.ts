// Supabase ClipStore: Stream 2's private `recordings` bucket (100 MB, mp4/mov/m4a/mp3).
// The server signs a one-time upload URL with the service role key; the browser uploads to it directly.
import "server-only";
import { clipPath, uploadStamp } from "./path";
import type { ClipStore } from "./types";

const BUCKET = "recordings";

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase isn't configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }
  return { base: `${url.replace(/\/$/, "")}/storage/v1`, key };
}

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

async function storage<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { base, key } = config();
  const res = await fetch(`${base}/${path}`, {
    ...init,
    cache: "no-store",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`Supabase storage ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T;
}

export const supabaseClipStore: ClipStore = {
  async createUpload(clip) {
    const path = clipPath(clip, uploadStamp());
    // Same endpoint as supabase-js createSignedUploadUrl. The link is valid for 2 hours.
    const { url } = await storage<{ url: string }>(`object/upload/sign/${BUCKET}/${encodePath(path)}`, { method: "POST" });
    return {
      path,
      url: `${config().base}${url.startsWith("/") ? url : `/${url}`}`,
      method: "PUT",
      headers: { "Content-Type": clip.contentType, "x-upsert": "false" },
    };
  },
  async exists(path) {
    const slash = path.lastIndexOf("/");
    const prefix = path.slice(0, slash);
    const name = path.slice(slash + 1);
    const found = await storage<{ name: string }[]>(`object/list/${BUCKET}`, {
      method: "POST",
      body: JSON.stringify({ prefix, search: name, limit: 1 }),
    });
    return found.some((f) => f.name === name);
  },
};
