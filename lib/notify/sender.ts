// Which channel the owner's report goes to. NOTIFY_CHANNEL=email (default, Gmail) | whatsapp.
// NOTIFY_DRY_RUN=1 logs the message instead of sending it, on either channel.
import "server-only";

export interface SendResult {
  /** Provider message id. */
  id: string;
}

export interface NotifySender {
  sendReport(to: string, text: string): Promise<SendResult>;
}

export type Channel = "email" | "whatsapp";

export const channel: Channel = process.env.NOTIFY_CHANNEL === "whatsapp" ? "whatsapp" : "email";

export const dryRunSender: NotifySender = {
  async sendReport(to, text) {
    console.info(`[notify] DRY RUN (${channel}) to ${to}:\n${text}`);
    return { id: `dry-run-${Date.now()}` };
  },
};

/** The owner's address for the active channel. */
export function recipient(): string | undefined {
  return channel === "email" ? process.env.OWNER_EMAIL_TO : process.env.OWNER_WHATSAPP_TO;
}

export function recipientEnvName(): string {
  return channel === "email" ? "OWNER_EMAIL_TO" : "OWNER_WHATSAPP_TO";
}
