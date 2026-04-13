import { logger, schedules } from "@trigger.dev/sdk/v3";
import { envNumber, requireEnv } from "../lib/env";
import { sendEmail } from "../services/resend";
import { sbSelect, sbUpdate } from "../services/supabase";

const CONTACTED_STATUSES = "(sent,delivered,opened,replied,unsubscribed)";

type QueueRow = {
  outreach_id: string;
  campaign_name: string;
  business_id: string;
  business_name: string;
  business_category: string | null;
  short_description: string | null;
  city: string | null;
  state: string | null;
  contact_name: string | null;
  email: string | null;
};

function subjectFor(row: QueueRow): string {
  return `Idea for ${row.business_name}`;
}

function textBodyFor(row: QueueRow): string {
  const firstName = row.contact_name?.split(" ")[0] ?? "there";
  const nicheLine = row.business_category ? ` in ${row.business_category}` : "";

  return [
    `Hi ${firstName},`,
    "",
    `I came across ${row.business_name} and wanted to reach out with a simple idea${nicheLine}.`,
    "",
    "I provide services that help businesses automate repetitive work using AI agentic automations. Common use cases are custom chatbots, lead generation, lead follow-ups, and sales pitches created from meeting transcriptions.",
    "",
    `If this is useful, I can share 2-3 practical automation ideas for ${row.business_name}. No long pitch.`,
    "If it is not relevant, reply with \"not now\" and I will not follow up.",
    "",
    "Best,",
    requireEnv("EMAIL_FROM_NAME"),
    "https://www.buildwithhamza.com/",
    requireEnv("BUSINESS_ADDRESS"),
    "Reply with \"unsubscribe\" to stop receiving emails."
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlBodyFor(row: QueueRow): string {
  const firstName = escapeHtml(row.contact_name?.split(" ")[0] ?? "there");
  const businessName = escapeHtml(row.business_name);
  const businessCategory = row.business_category ? ` in ${escapeHtml(row.business_category)}` : "";
  const senderName = escapeHtml(requireEnv("EMAIL_FROM_NAME"));
  const businessAddress = escapeHtml(requireEnv("BUSINESS_ADDRESS"));
  const avatarUrl = "https://www.buildwithhamza.com/assets/profile/avatar-2.svg";
  const avatarPngFallbackUrl =
    "https://ui-avatars.com/api/?name=Hamza+Khan&background=93c5fd&color=0a0a0a&size=64&format=png";
  const bookingUrl = "https://calendly.com/hamza-khansahab/30min";
  const safeBookingUrl = escapeHtml(bookingUrl);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${businessName}</title>
  </head>
  <body style="margin:0;padding:0;background:#fafafa;font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#fafafa;">
      A simple AI automation idea for ${businessName}.
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:26px 12px;background:#fafafa;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="width:100%;max-width:620px;background:#ffffff;border:1px dashed #d4d4d8;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 12px 24px;border-bottom:1px dashed #d4d4d8;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${avatarUrl}" width="26" height="26" alt="${senderName}" onerror="this.onerror=null;this.src='${avatarPngFallbackUrl}';" style="display:block;width:26px;height:26px;border-radius:8px;background:#93c5fd;border:1px solid #d4d4d8;" />
                    </td>
                    <td style="padding-left:9px;vertical-align:middle;">
                      <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;font-weight:600;">${senderName}</p>
                    </td>
                  </tr>
                </table>
                <h1 style="margin:14px 0 0 0;font-size:29px;line-height:1.2;color:#18181b;font-weight:700;">Idea for ${businessName}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 24px 10px 24px;">
                <p style="margin:0 0 14px 0;font-size:16px;line-height:1.7;color:#18181b;">Hi ${firstName},</p>
                <p style="margin:0 0 14px 0;font-size:16px;line-height:1.7;color:#52525b;">
                  I came across <strong style="color:#18181b;">${businessName}</strong> and wanted to reach out with a simple idea${businessCategory}.
                </p>
                <p style="margin:0 0 14px 0;font-size:16px;line-height:1.7;color:#52525b;">
                  I provide services that help businesses automate repetitive work using AI agentic automations. Common use cases are custom chatbots, lead generation, lead follow-ups, and sales pitches created from meeting transcriptions.
                </p>
                <p style="margin:0 0 18px 0;font-size:16px;line-height:1.7;color:#52525b;">
                  If this is useful, I can share 2-3 practical automation ideas for ${businessName}. No long pitch.
                </p>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#71717a;">
                  If it is not relevant, reply with "not now" and I will not follow up.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px 0;">
                  <tr>
                    <td style="padding:12px 13px;border:1px dashed #d4d4d8;border-radius:8px;background:#fafafa;font-size:13px;line-height:1.6;color:#71717a;">
                      I focus on practical automations that save time, reduce missed leads, and fit into the tools a business already uses.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#0a0a0a" style="border-radius:8px;">
                      <a href="${safeBookingUrl}" target="_blank" style="display:inline-block;padding:12px 18px;font-size:14px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;">Book a discovery call</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 22px 24px;border-top:1px dashed #d4d4d8;background:#fafafa;">
                <p style="margin:0 0 2px 0;font-size:14px;line-height:1.6;color:#18181b;">Best,</p>
                <p style="margin:0 0 5px 0;font-size:14px;line-height:1.6;color:#18181b;font-weight:600;">Hamza Khan</p>
                <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#52525b;"><a href="https://www.buildwithhamza.com/" target="_blank" style="color:#52525b;text-decoration:underline;">buildwithhamza.com</a></p>
                <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#71717a;">${businessAddress}</p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">Reply with "unsubscribe" to stop receiving emails.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sentTodayCount(): Promise<number> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

  const rows = await sbSelect<{ id: string }>(
    `outreach?select=id&status=in.(sent,delivered,opened,replied,bounced)&sent_at=gte.${encodeURIComponent(start)}&sent_at=lt.${encodeURIComponent(end)}`
  );

  return rows.length;
}

async function businessAlreadyContacted(businessId: string): Promise<boolean> {
  const rows = await sbSelect<{ id: string }>(
    `outreach?select=id&business_id=eq.${businessId}&status=in.${CONTACTED_STATUSES}&limit=1`
  );
  return rows.length > 0;
}

export const smbColdEmailSender = schedules.task({
  id: "smb-cold-email-sender",
  cron: { pattern: "0 9 * * *", timezone: "America/New_York" },
  run: async () => {
    const dailyLimit = envNumber("DAILY_SEND_LIMIT", 15);
    const fromAddress = requireEnv("EMAIL_FROM_ADDRESS");
    const replyTo = requireEnv("EMAIL_REPLY_TO");
    const fromName = requireEnv("EMAIL_FROM_NAME");

    const alreadySentToday = await sentTodayCount();
    const remaining = Math.max(0, dailyLimit - alreadySentToday);

    if (remaining === 0) {
      logger.log("Daily cap reached, skipping sender run", { dailyLimit, alreadySentToday });
      return { attempted: 0, sent: 0, skipped: 0, failed: 0 };
    }

    const queue = await sbSelect<QueueRow>(
      `v_ready_to_send?select=outreach_id,campaign_name,business_id,business_name,business_category,short_description,city,state,contact_name,email&limit=${remaining}`
    );

    const counters = {
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0
    };

    for (const row of queue) {
      if (!row.email) {
        counters.skipped += 1;
        continue;
      }

      if (await businessAlreadyContacted(row.business_id)) {
        counters.skipped += 1;
        continue;
      }

      counters.attempted += 1;
      const subject = subjectFor(row);
      const text = textBodyFor(row);
      const html = htmlBodyFor(row);

      try {
        const result = await sendEmail({
          from: `${fromName} <${fromAddress}>`,
          to: [row.email],
          reply_to: replyTo,
          subject,
          text,
          html,
          headers: {
            "List-Unsubscribe": `<mailto:${replyTo}?subject=unsubscribe>`
          }
        });

        await sbUpdate(`outreach?id=eq.${row.outreach_id}`, {
          status: "sent",
          subject,
          provider_message_id: result.id,
          sent_at: new Date().toISOString(),
          last_event_at: new Date().toISOString()
        });

        counters.sent += 1;
      } catch (error) {
        counters.failed += 1;
        await sbUpdate(`outreach?id=eq.${row.outreach_id}`, {
          status: "failed",
          last_event_at: new Date().toISOString()
        });
        logger.error("Send failed", {
          outreachId: row.outreach_id,
          email: row.email,
          error: String((error as Error).message ?? error)
        });
      }
    }

    logger.log("Sender summary", counters);
    return counters;
  }
});
