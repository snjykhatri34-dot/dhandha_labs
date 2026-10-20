// WhatsApp sender. sendReport(to, text) wraps Twilio's Messages API (plain fetch, no SDK).
// The sender is swappable: WHATSAPP_PROVIDER=twilio (default) | meta, and NOTIFY_DRY_RUN=1 logs instead.
//
// Free text (Body) only works inside WhatsApp's 24-hour window and on accounts that allow it.
// If TWILIO_CONTENT_SID (HX…) is set, we send that approved template instead, filling
// {{1}} with the summary on one line and {{2}} with the report link.
import "server-only";

export interface SendResult {
  /** Provider message id, e.g. Twilio's SM… sid. */
  id: string;
}

export interface WhatsAppSender {
  sendReport(to: string, text: string): Promise<SendResult>;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in .env.local`);
  return v;
}

export const twilioSender: WhatsAppSender = {
  async sendReport(to, text) {
    const sid = env("TWILIO_ACCOUNT_SID");
    const token = env("TWILIO_AUTH_TOKEN");
    const from = env("TWILIO_WHATSAPP_FROM");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, ...messageContent(text) }),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok || !data.sid) {
      // Twilio error 63016 = outside the 24-hour window: send "hi" to the sandbox from the phone first.
      throw new Error(`Twilio ${res.status}${data.code ? ` (${data.code})` : ""}: ${data.message ?? "no details"}`);
    }
    return { id: data.sid };
  },
};

/** Body for free text, or ContentSid + ContentVariables when a template is configured. */
export function messageContent(text: string, contentSid = process.env.TWILIO_CONTENT_SID): Record<string, string> {
  if (!contentSid) return { Body: text };
  const lines = text.split("\n").map((l) => l.replace(/\*/g, "").trim()).filter(Boolean);
  const link = lines.find((l) => l.startsWith("Full report:"))?.replace("Full report:", "").trim() ?? "";
  // WhatsApp template variables can't contain new lines, so the summary is joined into one line.
  const summary = lines.filter((l) => !l.startsWith("Full report:")).join(" · ");
  return { ContentSid: contentSid, ContentVariables: JSON.stringify({ "1": summary, "2": link }) };
}

export const dryRunSender: WhatsAppSender = {
  async sendReport(to, text) {
    console.info(`[notify] DRY RUN to ${to}:\n${text}`);
    return { id: `dry-run-${Date.now()}` };
  },
};

/** "whatsapp:+16175551234" or "+1 617…" → "16175551234" (Meta wants digits only). */
export function digitsOnly(to: string): string {
  return to.replace(/^whatsapp:/, "").replace(/\D/g, "");
}

// Meta WhatsApp Cloud API (free test number). Free text works inside the 24-hour window,
// so the phone must message the test number first (send "hi").
export const metaSender: WhatsAppSender = {
  async sendReport(to, text) {
    const token = env("META_WHATSAPP_TOKEN");
    const phoneNumberId = env("META_PHONE_NUMBER_ID");
    const version = process.env.META_GRAPH_VERSION || "v23.0";
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: digitsOnly(to),
        type: "text",
        text: { body: text, preview_url: true },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number; error_data?: { details?: string } };
    };
    const id = data.messages?.[0]?.id;
    if (!res.ok || !id) {
      const e = data.error;
      const hint =
        e?.code === 131047 || e?.code === 131026
          ? " Send \"hi\" from the phone to the test number first (24-hour window), and check the number is on the test list."
          : e?.code === 190
            ? " The access token expired: generate a new one in Meta's API Setup page."
            : "";
      throw new Error(`Meta ${res.status}${e?.code ? ` (${e.code})` : ""}: ${e?.error_data?.details ?? e?.message ?? "no details"}.${hint}`);
    }
    return { id };
  },
};

export const provider = process.env.WHATSAPP_PROVIDER === "meta" ? "meta" : "twilio";

export const whatsapp: WhatsAppSender =
  process.env.NOTIFY_DRY_RUN === "1" ? dryRunSender : provider === "meta" ? metaSender : twilioSender;
