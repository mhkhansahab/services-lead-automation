-- Enable helpers
create extension if not exists pgcrypto;

-- Businesses
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  place_id text unique,
  business_name text not null,
  website text,
  domain text,
  phone text,
  business_category text,
  short_description text,
  city text,
  state text,
  country text not null default 'US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_businesses_domain on public.businesses (domain);
create index if not exists idx_businesses_category on public.businesses (business_category);
create index if not exists idx_businesses_city_state on public.businesses (city, state);

-- Contacts
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_name text,
  contact_role text,
  email text,
  email_verified boolean not null default false,
  source text,
  created_at timestamptz not null default now(),
  unique (business_id, email)
);

create index if not exists idx_contacts_email on public.contacts (email);

-- Outreach log
create table if not exists public.outreach (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  campaign_name text not null,
  step integer not null default 1,
  status text not null check (
    status in ('ready_to_send','sent','delivered','opened','replied','bounced','unsubscribed','failed')
  ),
  provider_message_id text,
  subject text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  replied_at timestamptz,
  bounced_at timestamptz,
  unsubscribed_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_name, business_id)
);

create index if not exists idx_outreach_status on public.outreach (status);
create index if not exists idx_outreach_sent_at on public.outreach (sent_at);

-- Suppression list
create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  domain text,
  business_id uuid references public.businesses(id) on delete set null,
  reason text not null check (reason in ('unsubscribed','replied','manual_block','hard_bounce')),
  created_at timestamptz not null default now()
);

create index if not exists idx_suppression_domain on public.suppression_list (domain);
create unique index if not exists idx_suppression_domain_unique
  on public.suppression_list (domain)
  where domain is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'suppression_list_email_or_domain_check'
      and conrelid = 'public.suppression_list'::regclass
  ) then
    alter table public.suppression_list
      add constraint suppression_list_email_or_domain_check
      check (email is not null or domain is not null);
  end if;
end
$$;

-- Event sync run log for Resend -> Supabase -> Sheets
create table if not exists public.event_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'resend',
  run_started_at timestamptz not null default now(),
  run_finished_at timestamptz,
  delivery_count integer not null default 0,
  bounce_count integer not null default 0,
  reply_count integer not null default 0,
  suppression_count integer not null default 0,
  outreach_updated_count integer not null default 0,
  sheet_updated_count integer not null default 0,
  failed_updates_count integer not null default 0,
  failure_details jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_sync_runs_started_at on public.event_sync_runs (run_started_at desc);

-- Updated-at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_businesses_updated_at on public.businesses;
create trigger trg_businesses_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

-- View: send queue with strict filtering
create or replace view public.v_ready_to_send as
select
  o.id as outreach_id,
  o.campaign_name,
  o.step,
  b.id as business_id,
  b.business_name,
  b.domain,
  b.phone,
  b.business_category,
  b.short_description,
  b.city,
  b.state,
  c.id as contact_id,
  c.contact_name,
  c.email
from public.outreach o
join public.businesses b on b.id = o.business_id
left join public.contacts c on c.id = o.contact_id
where o.status = 'ready_to_send'
  and not exists (
    select 1 from public.suppression_list s
    where (c.email is not null and s.email = c.email)
       or (b.domain is not null and s.domain = b.domain)
  )
  and not exists (
    select 1 from public.outreach o2
    where o2.business_id = o.business_id
      and o2.campaign_name = o.campaign_name
      and o2.status in ('sent','delivered','opened','replied','unsubscribed')
      and o2.id <> o.id
  );
