import { logger, schedules } from "@trigger.dev/sdk/v3";
import { envList, envNumber, requireEnv } from "../lib/env";
import { extractDomain, normalizeEmail } from "../lib/utils";
import { enrichBusinessWebsite } from "../services/enrichment";
import { searchPlaces } from "../services/places";
import { sbSelect, sbUpsert } from "../services/supabase";

type BusinessRow = { id: string; domain: string | null };

type ContactRow = { id: string; email: string | null };

const CONTACTED_STATUSES = "(sent,delivered,opened,replied,unsubscribed)";

function rotateQueries(queries: string[], size: number, seed: number): string[] {
  if (queries.length <= size) return queries;
  const out: string[] = [];
  for (let i = 0; i < size; i += 1) {
    out.push(queries[(seed + i) % queries.length]!);
  }
  return out;
}

async function alreadySuppressed(email: string | null, domain: string | null): Promise<boolean> {
  if (email) {
    const byEmail = await sbSelect<{ id: string }>(
      `suppression_list?select=id&email=eq.${encodeURIComponent(email)}&limit=1`
    );
    if (byEmail.length > 0) return true;
  }

  if (domain) {
    const byDomain = await sbSelect<{ id: string }>(
      `suppression_list?select=id&domain=eq.${encodeURIComponent(domain)}&limit=1`
    );
    if (byDomain.length > 0) return true;
  }

  return false;
}

async function alreadyContacted(businessId: string): Promise<boolean> {
  const rows = await sbSelect<{ id: string }>(
    `outreach?select=id&business_id=eq.${businessId}&status=in.${CONTACTED_STATUSES}&limit=1`
  );
  return rows.length > 0;
}

export const smbLeadDiscovery = schedules.task({
  id: "smb-lead-discovery",
  cron: { pattern: "0 */6 * * *", timezone: "America/New_York" },
  run: async (payload) => {
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SECRET_KEY");

    const niches = envList("TARGET_NICHES");
    const cities = envList("TARGET_CITIES");
    const country = requireEnv("TARGET_COUNTRY");
    const maxQueries = envNumber("DISCOVERY_QUERIES_PER_RUN", 6);
    const maxResultsPerQuery = envNumber("DISCOVERY_RESULTS_PER_QUERY", 8);
    const campaignName = process.env.CAMPAIGN_NAME ?? "smb-ai-automation-v1";

    const queryPool = niches.flatMap((niche) => cities.map((city) => `${niche.replaceAll("_", " ")} in ${city}, ${country}`));
    const seed = payload.timestamp.getUTCHours() % Math.max(queryPool.length, 1);
    const selectedQueries = rotateQueries(queryPool, maxQueries, seed);

    const counters = {
      discovered: 0,
      businessesUpserted: 0,
      contactsUpserted: 0,
      queuedForEmail: 0,
      skippedSuppressed: 0,
      skippedAlreadyContacted: 0,
      skippedNoEmail: 0
    };

    for (const query of selectedQueries) {
      logger.log("Running discovery query", { query });
      const places = await searchPlaces(query, maxResultsPerQuery);
      counters.discovered += places.length;

      for (const place of places) {
        const websiteInfo = await enrichBusinessWebsite(place.website);
        const domain = websiteInfo.domain ?? extractDomain(place.website);
        const email = normalizeEmail(websiteInfo.email);

        const businessRows = await sbUpsert<BusinessRow>(
          "businesses",
          {
            place_id: place.placeId,
            business_name: place.businessName,
            website: place.website,
            domain,
            phone: place.phone,
            business_category: place.businessCategory,
            short_description: place.shortDescription,
            city: place.city,
            state: place.state,
            country
          },
          "place_id"
        );

        const business = businessRows[0];
        if (!business) continue;
        counters.businessesUpserted += 1;

        if (!email) {
          counters.skippedNoEmail += 1;
          continue;
        }

        if (await alreadySuppressed(email, domain)) {
          counters.skippedSuppressed += 1;
          continue;
        }

        if (await alreadyContacted(business.id)) {
          counters.skippedAlreadyContacted += 1;
          continue;
        }

        const contactRows = await sbUpsert<ContactRow>(
          "contacts",
          {
            business_id: business.id,
            contact_name: null,
            contact_role: "owner_or_manager",
            email,
            email_verified: false,
            source: "website_scrape"
          },
          "business_id,email"
        );

        const contactId = contactRows[0]?.id ?? null;
        if (contactId) counters.contactsUpserted += 1;

        await sbUpsert(
          "outreach",
          {
            business_id: business.id,
            contact_id: contactId,
            campaign_name: campaignName,
            step: 1,
            status: "ready_to_send"
          },
          "campaign_name,business_id"
        );

        counters.queuedForEmail += 1;
      }
    }

    logger.log("Lead discovery summary", counters);
    return counters;
  }
});
