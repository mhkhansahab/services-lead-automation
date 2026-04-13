-- Daily KPI view for Sheets/BI
create or replace view public.v_outreach_daily_kpi as
select
  date_trunc('day', coalesce(sent_at, created_at))::date as day,
  count(*) filter (where status = 'sent') as sent_count,
  count(*) filter (where status = 'delivered') as delivered_count,
  count(*) filter (where status = 'opened') as opened_count,
  count(*) filter (where status = 'replied') as replied_count,
  count(*) filter (where status = 'bounced') as bounced_count,
  round(
    100.0 * count(*) filter (where status = 'replied')
    / nullif(count(*) filter (where status in ('sent','delivered','opened','replied','bounced')), 0),
    2
  ) as reply_rate_pct,
  round(
    100.0 * count(*) filter (where status = 'bounced')
    / nullif(count(*) filter (where status in ('sent','delivered','opened','replied','bounced')), 0),
    2
  ) as bounce_rate_pct
from public.outreach
group by 1
order by 1 desc;

-- Niche performance
create or replace view public.v_niche_performance as
select
  b.business_category,
  count(*) filter (where o.status = 'sent') as sent_count,
  count(*) filter (where o.status = 'replied') as replied_count,
  round(
    100.0 * count(*) filter (where o.status = 'replied')
    / nullif(count(*) filter (where o.status in ('sent','delivered','opened','replied','bounced')), 0),
    2
  ) as reply_rate_pct
from public.outreach o
join public.businesses b on b.id = o.business_id
group by 1
order by replied_count desc nulls last;
