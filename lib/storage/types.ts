// Where uploaded clips go. Pages and routes use lib/storage/index.ts only (Person A owns this folder).
//
// The clip never passes through our server (Vercel rejects requests over ~4.5 MB):
// 1. the server creates a one-time upload link (createUpload),
// 2. the browser PUTs the file straight to that link,
// 3. the server checks the file is there (exists) and creates the visit.

export interface ClipMeta {
  store: string;
  salesperson: string;
  /** YYYY-MM-DD of the visit. */
  date: string;
  /** Original file name, used only for its extension. */
  fileName: string;
  contentType: string;
}

export interface UploadTarget {
  /** The clip's path in storage (the visit's media_path). */
  path: string;
  /** One-time URL the browser uploads the file to. */
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface ClipStore {
  createUpload(clip: ClipMeta): Promise<UploadTarget>;
  /** True once the browser's upload to `path` has finished. */
  exists(path: string): Promise<boolean>;
}
