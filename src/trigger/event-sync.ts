import { logger, schedules } from "@trigger.dev/sdk/v3";
import { requireEnv } from "../lib/env";
import { runEventSync } from "../services/event-sync";

export const smbOutreachEventSync = schedules.task({
  id: "smb-outreach-event-sync",
  cron: { pattern: "0 * * * *", timezone: "America/New_York" },
  run: async () => {
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SECRET_KEY");
    requireEnv("RESEND_API_KEY");
    requireEnv("GOOGLE_SHEET_ID");
    requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON");

    const result = await runEventSync();
    logger.log("Event sync summary", result.counters);
    return result;
  }
});
