import { appendSyncLogRow } from "./sheets";
import { listEmails } from "./resend";
import { sbInsert, sbSelect, sbUpdate, sbUpsert } from "./supabase";
import { extractDomain, normalizeEmail, normalizeText } from "../lib/utils";

type OutreachRow = {
  id: string;
  business_id: string;
  contact_id: string | null;
  status: string;
  provider_message_id: string | null;
};

type ContactRow = { id: string; email: string | null };
type BusinessRow = { id: string; domain: string | null };

type Counters = {
  deliveries: number;
  bounces: number;
  replies: number;
  suppressions: number;
  outreachUpdates: number;
};

function isMissingEventSyncRunsTable(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error);
  return message.includes("PGRST205") && message.includes("event_sync_runs");
}

async function latestSyncCutoff(): Promise<string | null> {
  try {
    const rows = await sbSelect<{ run_started_at: string }>(
      "event_sync_runs?select=run_started_at&order=run_started_at.desc&limit=1"
    );
    return rows[0]?.run_started_at ?? null;
  } catch (error) {
    if (isMissingEventSyncRunsTable(error)) return null;
    throw error;
  }
}

async function resolveRowsByRecipient(
  recipient: string,
  outreach: OutreachRow[],
  contactsById: Map<string, ContactRow>,
  businessesById: Map<string, BusinessRow>
): Promise<OutreachRow[]> {
  const email = normalizeEmail(recipient);
  const domain = extractDomain(email);

  return outreach.filter((row) => {
    const contactEmail = normalizeEmail(row.contact_id ? contactsById.get(row.contact_id)?.email : null);
    const businessDomain = normalizeEmail(businessesById.get(row.business_id)?.domain);
    return contactEmail === email || (!!domain && businessDomain === domain);
  });
}

async function upsertSuppression(email: string | null, businessId: string, reason: "replied" | "hard_bounce") {
  const domain = extractDomain(email);
  if (!email && !domain) return;

  await sbUpsert(
    "suppression_list",
    {
      email,
      domain,
      business_id: businessId,
      reason
    },
    email ? "email" : "domain"
  );
}

export async function runEventSync() {
  const startedAt = new Date().toISOString();
  const cutoff = await latestSyncCutoff();
  const warnings: string[] = [];
  let sheetUpdatedCount = 0;

  const [outreachRows, contacts, businesses] = await Promise.all([
    sbSelect<OutreachRow>("outreach?select=id,business_id,contact_id,status,provider_message_id"),
    sbSelect<ContactRow>("contacts?select=id,email"),
    sbSelect<BusinessRow>("businesses?select=id,domain")
  ]);

  const contactsById = new Map(contacts.map((c) => [c.id, c]));
  const businessesById = new Map(businesses.map((b) => [b.id, b]));

  let allEmails: any[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await listEmails(100, cursor);
    const data = page.data ?? [];
    allEmails = allEmails.concat(data);
    if (!page.has_more || data.length === 0) break;
    cursor = data[data.length - 1]?.id;
  }

  const counters: Counters = {
    deliveries: 0,
    bounces: 0,
    replies: 0,
    suppressions: 0,
    outreachUpdates: 0
  };

  const failures: Array<{ outreach_id: string; error: string }> = [];

  for (const emailEvent of allEmails) {
    const createdAt = emailEvent?.created_at ? new Date(emailEvent.created_at) : null;
    if (cutoff && createdAt && createdAt <= new Date(cutoff)) continue;

    const recipient = Array.isArray(emailEvent?.to) ? emailEvent.to[0] : null;
    if (!recipient) continue;

    const matchedByMessageId = outreachRows.filter((r) => r.provider_message_id && r.provider_message_id === emailEvent.id);
    const matchedRows = matchedByMessageId.length
      ? matchedByMessageId
      : await resolveRowsByRecipient(recipient, outreachRows, contactsById, businessesById);

    if (!matchedRows.length) continue;

    const lastEvent = normalizeText(emailEvent?.last_event);
    const timestamp = emailEvent?.last_event_at || emailEvent?.updated_at || new Date().toISOString();

    for (const row of matchedRows) {
      const patch: Record<string, string> = {
        last_event_at: timestamp
      };

      if (emailEvent.id && !row.provider_message_id) {
        patch.provider_message_id = emailEvent.id;
      }

      if (lastEvent === "delivered") {
        patch.status = "delivered";
        patch.delivered_at = timestamp;
        counters.deliveries += 1;
      } else if (lastEvent === "opened") {
        patch.status = "opened";
        patch.opened_at = timestamp;
      } else if (lastEvent === "replied") {
        patch.status = "replied";
        patch.replied_at = timestamp;
        counters.replies += 1;
        await upsertSuppression(recipient, row.business_id, "replied");
        counters.suppressions += 1;
      } else if (lastEvent === "bounced") {
        patch.status = "bounced";
        patch.bounced_at = timestamp;
        counters.bounces += 1;
        await upsertSuppression(recipient, row.business_id, "hard_bounce");
        counters.suppressions += 1;
      } else {
        continue;
      }

      try {
        await sbUpdate(`outreach?id=eq.${row.id}`, patch);
        counters.outreachUpdates += 1;
      } catch (error) {
        failures.push({ outreach_id: row.id, error: String((error as Error).message ?? error) });
      }
    }
  }

  const finishedAt = new Date().toISOString();
  try {
    await appendSyncLogRow([
      finishedAt,
      counters.deliveries,
      counters.bounces,
      counters.replies,
      counters.suppressions,
      counters.outreachUpdates,
      failures.length
    ]);
    sheetUpdatedCount = 1;
  } catch (error) {
    warnings.push(`Google Sheets sync skipped: ${String((error as Error).message ?? error)}`);
  }

  try {
    await sbInsert("event_sync_runs", {
      source: "resend",
      run_started_at: startedAt,
      run_finished_at: finishedAt,
      delivery_count: counters.deliveries,
      bounce_count: counters.bounces,
      reply_count: counters.replies,
      suppression_count: counters.suppressions,
      outreach_updated_count: counters.outreachUpdates,
      sheet_updated_count: sheetUpdatedCount,
      failed_updates_count: failures.length,
      failure_details: failures,
      notes: cutoff ? `Incremental sync after ${cutoff}` : "Initial sync"
    });
  } catch (error) {
    if (isMissingEventSyncRunsTable(error)) {
      warnings.push("event_sync_runs table not found; skipped sync-run log insert");
    } else {
      throw error;
    }
  }

  return {
    startedAt,
    finishedAt,
    counters,
    failures,
    warnings
  };
}
