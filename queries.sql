-- QUICK DAILY CHECKS (read-only)
-- Copy and run each query in Supabase SQL editor.

-- 1) Last 24h sending summary
select
  count(*) filter (where status = 'sent')         as sent,
  count(*) filter (where status = 'delivered')    as delivered,
  count(*) filter (where status = 'opened')       as opened,
  count(*) filter (where status = 'replied')      as replied,
  count(*) filter (where status = 'bounced')      as bounced,
  count(*) filter (where status = 'unsubscribed') as unsubscribed
from public.outreach
where coalesce(sent_at, created_at) >= now() - interval '24 hours';

-- 2) Ready-to-send queue size
select count(*) as ready_to_send_count
from public.v_ready_to_send;

-- 3) Sent today (track against DAILY_SEND_LIMIT)
select count(*) as sent_today
from public.outreach
where status in ('sent','delivered','opened','replied','bounced')
  and sent_at::date = current_date;

-- 4) Latest event sync runs
select *
from public.event_sync_runs
order by run_started_at desc
limit 20;

-- 5) Duplicate sends in same campaign (should be 0 rows)
select campaign_name, business_id, count(*) as cnt
from public.outreach
where status in ('sent','delivered','opened','replied','unsubscribed')
group by campaign_name, business_id
having count(*) > 1
order by cnt desc;

-- 6) Sent contacts/domains present in suppression list (should be 0 rows)
select o.id as outreach_id, c.email, b.domain, o.status, o.sent_at
from public.outreach o
join public.businesses b on b.id = o.business_id
left join public.contacts c on c.id = o.contact_id
where o.status in ('sent','delivered','opened','replied')
  and exists (
    select 1
    from public.suppression_list s
    where (c.email is not null and s.email = c.email)
       or (b.domain is not null and s.domain = b.domain)
  )
order by o.sent_at desc nulls last;

-- 7) Outreach rows with missing event timestamps that may need backfill
select id, status, sent_at, delivered_at, opened_at, replied_at, bounced_at, unsubscribed_at, last_event_at
from public.outreach
where status in ('delivered','opened','replied','bounced','unsubscribed')
  and last_event_at is null;
