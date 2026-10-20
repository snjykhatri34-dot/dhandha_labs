// Email sender: sends the report summary from a Gmail account over SMTP (app password).
// Gmail: turn on 2-Step Verification, then create an app password at myaccount.google.com/apppasswords.
import "server-only";
import nodemailer from "nodemailer";
import type { NotifySender } from "./sender";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in .env.local`);
  return v;
}

/** The WhatsApp-style text uses *bold*; email gets plain text plus a simple HTML version. */
export function toEmail(text: string): { subject: string; text: string; html: string } {
  const lines = text.split("\n").map((l) => l.replace(/\*/g, "").trim());
  const [title, ...rest] = lines;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const linkify = (s: string) => esc(s).replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>');
  const html = [
    `<h2 style="font-family:sans-serif;margin:0 0 12px">${esc(title)}</h2>`,
    ...rest.map((l) => `<p style="font-family:sans-serif;margin:0 0 8px">${linkify(l)}</p>`),
  ].join("\n");
  return { subject: title, text: lines.join("\n"), html };
}

export const gmailSender: NotifySender = {
  async sendReport(to, text) {
    const user = env("GMAIL_USER");
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      // Google shows app passwords with spaces; they work either way.
      auth: { user, pass: env("GMAIL_APP_PASSWORD").replace(/\s+/g, "") },
    });
    const mail = toEmail(text);
    try {
      const info = await transport.sendMail({ from: `Counter Intelligence <${user}>`, to, ...mail });
      return { id: info.messageId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const hint = /535|Username and Password not accepted|BadCredentials/i.test(msg)
        ? " Gmail refused the login: use a 16-character app password, not your normal password."
        : "";
      throw new Error(`Gmail: ${msg}${hint}`);
    }
  },
};
