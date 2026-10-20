// Where uploaded clips go. Pages and routes use lib/storage/index.ts only (Person A owns this folder).

export interface ClipToStore {
  store: string;
  salesperson: string;
  /** YYYY-MM-DD of the visit. */
  date: string;
  /** Original file name, used only for its extension. */
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface ClipStore {
  /** Saves the clip and returns its path (the visit's media_path). */
  save(clip: ClipToStore): Promise<{ path: string }>;
}
