// ux_notifications: one row per report, so a report is never sent twice (on whichever channel).
// Mock: an in-memory Map on globalThis. Supabase: the table from Stream 2's migration (stub for now).
import "server-only";
import { NotImplementedError } from "@/lib/data/types";

export type NotificationStatus = "pending" | "sent" | "failed";

export interface NotificationRow {
  report_id: string;
  channel: "email" | "whatsapp";
  status: NotificationStatus;
  sent_at: string | null;
  error: string | null;
}

export interface NotificationLog {
  /** Inserts a pending row. Returns null if a row for this report already exists (unique report_id). */
  claim(reportId: string, channel: "email" | "whatsapp"): Promise<NotificationRow | null>;
  get(reportId: string): Promise<NotificationRow | null>;
  update(reportId: string, patch: Partial<Pick<NotificationRow, "status" | "sent_at" | "error">>): Promise<void>;
}

const g = globalThis as typeof globalThis & { __uxNotifications?: Map<string, NotificationRow> };
const rows = () => (g.__uxNotifications ??= new Map());

/** For tests. */
export function resetNotificationLog() {
  delete g.__uxNotifications;
}

export const mockNotificationLog: NotificationLog = {
  async claim(reportId, channel) {
    if (rows().has(reportId)) return null;
    const row: NotificationRow = { report_id: reportId, channel, status: "pending", sent_at: null, error: null };
    rows().set(reportId, row);
    return { ...row };
  },
  async get(reportId) {
    const row = rows().get(reportId);
    return row ? { ...row } : null;
  },
  async update(reportId, patch) {
    const row = rows().get(reportId);
    if (row) Object.assign(row, patch);
  },
};

const notYet = async (): Promise<never> => {
  throw new NotImplementedError("ux_notifications (Supabase)");
};

export const supabaseNotificationLog: NotificationLog = { claim: notYet, get: notYet, update: notYet };

export const notificationLog: NotificationLog =
  process.env.DATA_SOURCE === "supabase" ? supabaseNotificationLog : mockNotificationLog;
