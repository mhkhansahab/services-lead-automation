# First Run Checklist (Services Lead Automation)

## 1) Preflight
- [ ] Resend domain `services.buildwithhamza.com` is **Verified**.
- [ ] `.env` exists and required keys are filled.
- [ ] `EMAIL_FROM_ADDRESS` and `EMAIL_REPLY_TO` are set to monitored inbox.
- [ ] Supabase SQL applied in order:
  - [ ] `sql/001_schema.sql`
  - [ ] `sql/002_reporting_views.sql`
  - [ ] `sql/003_security.sql`
- [ ] Google Sheet is shared with service account email.

## 2) Seed Small Test Batch
- [ ] Add only **5 leads** with valid emails.
- [ ] Ensure all 5 are unique by `domain/email/place_id`.
- [ ] Set outreach status to `ready_to_send`.

## 3) Send Test Batch
- [ ] Trigger `SMB Cold Email Sender` once (or wait schedule).
- [ ] Confirm no more than expected sends (daily limit respected).

## 4) Validate Data Updates
- [ ] Supabase `outreach` rows updated with:
  - [ ] `status` in `sent`/`delivered`/`failed`
  - [ ] `provider_message_id`
  - [ ] `sent_at`
  - [ ] event timestamps such as `delivered_at`, `replied_at`, `bounced_at`, `unsubscribed_at`
- [ ] Google Sheet rows updated with sent metadata.
- [ ] `event_sync_runs` row created with per-event counts and failed updates.

## 5) Validate Protection Rules
- [ ] Re-run sender and verify **no duplicate sends** to same business in campaign.
- [ ] Add one manual unsubscribe reply and verify:
  - [ ] status becomes `unsubscribed`
  - [ ] email/domain added to `suppression_list`
- [ ] Add one bounce test and verify suppression update.

## 6) Deliverability Checks
- [ ] Send to Gmail + Outlook test inboxes.
- [ ] Check spam placement and basic header auth results (SPF/DKIM pass).
- [ ] If spam rate high, reduce volume and improve template quality.

## 7) Scale Plan (Safe)
- [ ] Day 1-2: max 5/day
- [ ] Day 3-4: max 10/day
- [ ] Day 5+: max 15/day (or lower if bounce rate > 5%)

## 8) Stop Conditions (Important)
Pause sending immediately if any happens:
- [ ] Bounce rate > 5%
- [ ] Spam complaint spike
- [ ] Duplicate send detected
- [ ] Missing unsubscribe handling

## 9) Daily Ops Snapshot
- [ ] New leads discovered
- [ ] Emails sent
- [ ] Replies
- [ ] Bounces
- [ ] Unsubscribes
- [ ] Reply rate %

## 10) Weekly Maintenance
- [ ] Rotate keys if exposed.
- [ ] Clean invalid emails and blocked domains.
- [ ] Refresh target niches/cities based on reply rate.
