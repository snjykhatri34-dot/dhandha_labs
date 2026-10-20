// The only entry point to clip storage. Picks the implementation from DATA_SOURCE, like lib/data.
import "server-only";

import { mockClipStore } from "./mock";
import { supabaseClipStore } from "./supabase";
import type { ClipStore } from "./types";

export type * from "./types";

export const clipStore: ClipStore = process.env.DATA_SOURCE === "supabase" ? supabaseClipStore : mockClipStore;
