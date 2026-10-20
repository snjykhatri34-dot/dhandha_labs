// ux_notifications: one row per report, so a report is never sent twice (on whichever channel).
// Mock: an in-memory Map on globalThis. Supabase: the ux_notifications table from Stream 2's migration.
import "server-only";
import { eq, rest } from "@/lib/data/supabase/rest";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = "report_id,channel,status,sent_at,error";

/**
 * ux_notifications.report_id references daily_reports(id), so only reports Stream 2 has saved
 * can be recorded. A report the app computed from visits (no saved row) has no uuid yet.
 */
function savedReportId(reportId: string): string {
  if (!UUID.test(reportId)) {
    throw new Error(
      `This report isn't saved in daily_reports yet (the app computed it from visits, id "${reportId}"), ` +
        "so ux_notifications can't record it. Ask Stream 2 to save the day's report, then send again.",
    );
  }
  return reportId;
}

export const supabaseNotificationLog: NotificationLog = {
  async claim(reportId, channel) {
    // Insert first: report_id is unique, so a second claim inserts nothing and returns [].
    const inserted = await rest<NotificationRow[]>(`ux_notifications?on_conflict=report_id&select=${COLUMNS}`, {
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=representation",
      body: JSON.stringify({ report_id: savedReportId(reportId), channel, status: "pending" }),
    });
    return inserted[0] ?? null;
  },
  async get(reportId) {
    if (!UUID.test(reportId)) return null;
    const rows = await rest<NotificationRow[]>(`ux_notifications?select=${COLUMNS}&report_id=${eq(reportId)}&limit=1`);
    return rows[0] ?? null;
  },
  async update(reportId, patch) {
    await rest(`ux_notifications?report_id=${eq(savedReportId(reportId))}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify(patch),
    });
  },
};

export const notificationLog: NotificationLog =
  process.env.DATA_SOURCE === "supabase" ? supabaseNotificationLog : mockNotificationLog;
