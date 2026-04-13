-- Backend-only security baseline
-- Use with server-side automations and Supabase Edge Functions.

-- 1) Enable RLS on all operational tables
alter table public.businesses enable row level security;
alter table public.contacts enable row level security;
alter table public.outreach enable row level security;
alter table public.suppression_list enable row level security;

-- 2) Lock down anon and authenticated direct access by default
-- (Service key / Edge Functions can still perform trusted writes)
drop policy if exists businesses_deny_anon on public.businesses;
create policy businesses_deny_anon on public.businesses
for all to anon
using (false) with check (false);

drop policy if exists contacts_deny_anon on public.contacts;
create policy contacts_deny_anon on public.contacts
for all to anon
using (false) with check (false);

drop policy if exists outreach_deny_anon on public.outreach;
create policy outreach_deny_anon on public.outreach
for all to anon
using (false) with check (false);

drop policy if exists suppression_deny_anon on public.suppression_list;
create policy suppression_deny_anon on public.suppression_list
for all to anon
using (false) with check (false);

drop policy if exists businesses_deny_authenticated on public.businesses;
create policy businesses_deny_authenticated on public.businesses
for all to authenticated
using (false) with check (false);

drop policy if exists contacts_deny_authenticated on public.contacts;
create policy contacts_deny_authenticated on public.contacts
for all to authenticated
using (false) with check (false);

drop policy if exists outreach_deny_authenticated on public.outreach;
create policy outreach_deny_authenticated on public.outreach
for all to authenticated
using (false) with check (false);

drop policy if exists suppression_deny_authenticated on public.suppression_list;
create policy suppression_deny_authenticated on public.suppression_list
for all to authenticated
using (false) with check (false);
