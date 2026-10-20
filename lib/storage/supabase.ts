// Supabase ClipStore: uploads to Stream 2's private `recordings` bucket.
// Stub until the plug-in PR, so DATA_SOURCE=supabase never half-works.
import { NotImplementedError } from "@/lib/data/types";
import type { ClipStore } from "./types";

export const supabaseClipStore: ClipStore = {
  async save() {
    throw new NotImplementedError("ClipStore.save (Supabase bucket `recordings`)");
  },
};
