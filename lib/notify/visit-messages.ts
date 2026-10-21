// visit_messages: the owner's text per analysed visit (pipeline/message.py writes it, sent_at null).
// The app sends it once: claim() sets sent_at only where it is still null, so two calls never both send.
// Mock: an in-memory Map on globalThis. Supabase: the visit_messages table from Stream 2's migration.
import "server-only";
import { eq, rest } from "@/lib/data/supabase/rest";

export interface VisitMessageRow {
  visit_id: string;
  channel: string;
  body: string;
  sent_at: string | null;
}

export interface VisitMessages {
  get(visitId: string): Promise<VisitMessageRow | null>;
  /** Marks the message sent now if it wasn't. Returns null when it was already sent (or doesn't exist). */
  claim(visitId: string): Promise<VisitMessageRow | null>;
  /** Undo a claim after a failed or dry-run send, so a real send can still go. */
  release(visitId: string): Promise<void>;
}

const g = globalThis as typeof globalThis & { __uxVisitMessages?: Map<string, VisitMessageRow> };
const rows = () => (g.__uxVisitMessages ??= new Map());

/** For tests: what the pipeline would have saved. */
export function seedVisitMessage(visitId: string, body: string) {
  rows().set(visitId, { visit_id: visitId, channel: "whatsapp", body, sent_at: null });
}

export function resetVisitMessages() {
  delete g.__uxVisitMessages;
}

export const mockVisitMessages: VisitMessages = {
  async get(visitId) {
    const row = rows().get(visitId);
    return row ? { ...row } : null;
  },
  async claim(visitId) {
    const row = rows().get(visitId);
    if (!row || row.sent_at) return null;
    row.sent_at = new Date().toISOString();
    return { ...row };
  },
  async release(visitId) {
    const row = rows().get(visitId);
    if (row) row.sent_at = null;
  },
};

const COLUMNS = "visit_id,channel,body,sent_at";

export const supabaseVisitMessages: VisitMessages = {
  async get(visitId) {
    const found = await rest<VisitMessageRow[]>(
      `visit_messages?select=${COLUMNS}&visit_id=${eq(visitId)}&audience=eq.owner&order=channel.desc&limit=1`,
    );
    return found[0] ?? null;
  },
  async claim(visitId) {
    // Conditional update: only a row whose sent_at is still null comes back.
    const claimed = await rest<VisitMessageRow[]>(
      `visit_messages?visit_id=${eq(visitId)}&audience=eq.owner&sent_at=is.null&select=${COLUMNS}`,
      { method: "PATCH", prefer: "return=representation", body: JSON.stringify({ sent_at: new Date().toISOString() }) },
    );
    return claimed[0] ?? null;
  },
  async release(visitId) {
    await rest(`visit_messages?visit_id=${eq(visitId)}&audience=eq.owner`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ sent_at: null }),
    });
  },
};

export const visitMessages: VisitMessages =
  process.env.DATA_SOURCE === "supabase" ? supabaseVisitMessages : mockVisitMessages;
