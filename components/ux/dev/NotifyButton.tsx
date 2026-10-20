"use client";

// Dev-only "Generate report" button: calls POST /api/ux/notify and shows what happened.
import { useState } from "react";
import type { NotifyResponse } from "@/app/api/ux/notify/route";
import { Spinner } from "@/components/ux/shared";

export function NotifyButton({ reportId }: { reportId: string }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<NotifyResponse | null>(null);

  async function send() {
    setBusy(true);
    try {
      const r = await fetch("/api/ux/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      setRes((await r.json()) as NotifyResponse);
    } catch (e) {
      setRes({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div>
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
        >
          {busy && <Spinner className="size-3" />} Generate report and send to WhatsApp
        </button>
      </div>
      {res && <Result res={res} />}
    </div>
  );
}

function Result({ res }: { res: NotifyResponse }) {
  if (!res.ok) {
    return (
      <p role="alert" className="rounded-lg bg-bad-bg p-3 text-sm text-bad">
        {res.error}
      </p>
    );
  }
  const tone =
    res.result === "sent" ? "bg-good-bg text-good" : res.result === "already_sent" ? "bg-warn-bg text-warn" : "bg-bad-bg text-bad";
  const title =
    res.result === "sent"
      ? "Sent to WhatsApp."
      : res.result === "already_sent"
        ? `Already sent${res.row?.sent_at ? ` at ${new Date(res.row.sent_at).toLocaleTimeString()}` : ""}. Nothing was sent this time.`
        : "WhatsApp failed. The report itself is fine and the email still goes out.";
  return (
    <div role="status" className={`rounded-lg p-3 text-sm ${tone}`}>
      <p className="font-medium">{title}</p>
      {res.result === "failed" && res.row?.error && <p className="mt-1">{res.row.error}</p>}
      {res.result === "failed" && <p className="mt-1">Click again to retry.</p>}
    </div>
  );
}
