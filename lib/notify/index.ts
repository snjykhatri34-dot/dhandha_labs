// The only entry point for sending the owner's report. Picks channel and provider from env.
import "server-only";
import { gmailSender } from "./email";
import { channel, dryRunSender, type NotifySender } from "./sender";
import { whatsapp } from "./whatsapp";

export { channel, recipient, recipientEnvName } from "./sender";
export type { Channel, NotifySender, SendResult } from "./sender";

export const notifier: NotifySender =
  process.env.NOTIFY_DRY_RUN === "1" ? dryRunSender : channel === "email" ? gmailSender : whatsapp;
