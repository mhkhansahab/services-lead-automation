# RUNBOOK (Services Lead Automation)

## 1) Daily Health Check (SQL)

### 1.1 Last 24h summary
```sql
select
  count(*) filter (where status = 'sent')        as sent,
  count(*) filter (where status = 'delivered')   as delivered,
  count(*) filter (where status = 'opened')      as opened,
  count(*) filter (where status = 'replied')     as replied,
  count(*) filter (where status = 'bounced')     as bounced,
  count(*) filter (where status = 'unsubscribed') as unsubscribed
from public.outreach
where coalesce(sent_at, created_at) >= now() - interval '24 hours';
```

### 1.2 Event sync run summary
```sql
select *
from public.event_sync_runs
order by run_started_at desc
limit 20;
```

### 1.3 Bounce and reply rate (last 7 days)
```sql
with base as (
  select *
  from public.outreach
  where coalesce(sent_at, created_at) >= now() - interval '7 days'
)
select
  round(100.0 * count(*) filter (where status = 'replied')
    / nullif(count(*) filter (where status in ('sent','delivered','opened','replied','bounced')), 0), 2) as reply_rate_pct,
  round(100.0 * count(*) filter (where status = 'bounced')
    / nullif(count(*) filter (where status in ('sent','delivered','opened','replied','bounced')), 0), 2) as bounce_rate_pct
from base;
```

## 2) Queue & Capacity

### 2.1 Ready-to-send count
```sql
select count(*) as ready_to_send_count
from public.v_ready_to_send;
```

### 2.2 Today's sent count vs daily limit
```sql
select count(*) as sent_today
from public.outreach
where status in ('sent','delivered','opened','replied','bounced')
  and sent_at::date = current_date;
```

## 3) Dedupe Integrity

### 3.1 Duplicate contact emails per business
```sql
select business_id, email, count(*) as cnt
from public.contacts
where email is not null
group by business_id, email
having count(*) > 1
order by cnt desc;
```

### 3.2 Duplicate business domains
```sql
select domain, count(*) as cnt
from public.businesses
where domain is not null and domain <> ''
group by domain
having count(*) > 1
order by cnt desc;
```

### 3.3 Same business contacted more than once in same campaign (should be 0)
```sql
select campaign_name, business_id, count(*) as cnt
from public.outreach
where status in ('sent','delivered','opened','replied','unsubscribed')
group by campaign_name, business_id
having count(*) > 1
order by cnt desc;
```

## 4) Suppression Safety

### 4.1 Any sent contact in suppression list (should be 0)
```sql
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
```

### 4.2 Latest suppression entries
```sql
select *
from public.suppression_list
order by created_at desc
limit 50;
```

## 5) Discovery Quality

### 5.1 New leads by niche (last 7 days)
```sql
select business_category, count(*) as leads
from public.businesses
where created_at >= now() - interval '7 days'
group by business_category
order by leads desc;
```

### 5.2 City performance
```sql
select b.city, b.state,
  count(*) filter (where o.status = 'sent') as sent,
  count(*) filter (where o.status = 'replied') as replied,
  round(100.0 * count(*) filter (where o.status = 'replied')
    / nullif(count(*) filter (where o.status in ('sent','delivered','opened','replied','bounced')), 0), 2) as reply_rate_pct
from public.outreach o
join public.businesses b on b.id = o.business_id
group by b.city, b.state
order by replied desc nulls last, sent desc;
```

## 6) Incident Playbook

### 6.1 If bounce rate > 5%
- Pause sender automation.
- Reduce daily limit by 50%.
- Remove risky domains/invalid emails.
- Re-check sending domain reputation and DNS records.

### 6.2 If duplicate sends detected
- Pause sender automation.
- Run section 3.3 query and isolate affected campaign.
- Set duplicate rows to `failed` with note externally.
- Resume only after cause is fixed.

### 6.3 If unsubscribe complaints rise
- Pause follow-ups immediately.
- Ensure reply parsing marks `unsubscribe/stop/remove me` correctly.
- Add manual suppression entries for complainants.

## 7) Manual Operations SQL

### 7.1 Manually suppress an email
```sql
insert into public.suppression_list (email, reason)
values ('example@domain.com', 'manual_block')
on conflict (email) do nothing;
```

### 7.2 Mark outreach as unsubscribed by email
```sql
update public.outreach o
set
  status = 'unsubscribed',
  unsubscribed_at = coalesce(unsubscribed_at, now()),
  last_event_at = now()
from public.contacts c
where o.contact_id = c.id
  and c.email = 'example@domain.com'
  and o.status in ('sent','delivered','opened','replied');
```

### 7.3 Inspect event timestamps for one outreach row
```sql
select
  id,
  status,
  sent_at,
  delivered_at,
  opened_at,
  replied_at,
  bounced_at,
  unsubscribed_at,
  last_event_at
from public.outreach
where id = '00000000-0000-0000-0000-000000000000';
```

### 7.4 Requeue failed sends safely
```sql
update public.outreach
set status = 'ready_to_send'
where status = 'failed'
  and created_at >= now() - interval '3 days';
```

## 8) Weekly Review
- Keep only top-performing niches (reply rate).
- Remove low-performing cities with high bounce.
- Refresh email template first lines.
- Keep daily limit conservative if domain is new.
