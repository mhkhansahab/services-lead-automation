# Services Lead Automation (Trigger.dev)

Code-first automation pipeline for US SMB lead discovery, outreach sending, and event sync.

## Included tasks
- `smb-lead-discovery` (every 6 hours)
- `smb-cold-email-sender` (daily at 9 AM America/New_York)
- `smb-outreach-event-sync` (hourly)

## Project structure
- `src/trigger/*.ts`: Trigger.dev scheduled tasks
- `src/services/*.ts`: Supabase, Resend, Google Sheets, Places, enrichment services
- `sql/*.sql`: database schema and views
- `templates/`: cold email templates
- `queries.sql`: quick operational checks
- `RUNBOOK.md`: operations and incident handling

## Setup
1. Keep your `.env` filled with valid keys.
2. Install dependencies:
   - `npm install`
3. Login to Trigger.dev:
   - `npx trigger.dev@latest login`
4. Set project ref env (or hardcode in `trigger.config.ts`):
   - `export TRIGGER_PROJECT_REF=your_project_ref`
5. Run locally:
   - `npm run dev:trigger`
6. Deploy:
   - `npm run deploy:trigger`

## Manual one-off runs
- `npm run run:discovery:once`
- `npm run run:sender:once`
- `npm run run:sync:once`

Requirements:
- Tasks must be deployed at least once.
- `TRIGGER_SECRET_KEY` must be set in `.env`.

## Required env keys
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM_NAME`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_REPLY_TO`
- `DAILY_SEND_LIMIT`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `BUSINESS_ADDRESS`
- `TARGET_NICHES`
- `TARGET_CITIES`
- `TARGET_COUNTRY`
- `GOOGLE_PLACES_API_KEY` (for discovery)

## Notes
- Deduplication and suppression checks are enforced before queueing/sending.
- Sender respects daily cap from `DAILY_SEND_LIMIT`.
- Event sync maps Resend states to Supabase outreach statuses.
# services-lead-automation
