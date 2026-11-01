-- Analytics daily register, independent from the reservation system.
begin;
create table if not exists public.analytics_daily_entries (
  id uuid primary key default gen_random_uuid(),
  business_date date not null unique,
  lunch_status text not null default 'open' check (lunch_status in ('open','closed')),
  dinner_status text not null default 'open' check (dinner_status in ('open','closed')),
  notes text,
  status text not null default 'draft' check (status in ('draft','finalized')),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.analytics_service_entries (
  id uuid primary key default gen_random_uuid(),
  daily_entry_id uuid not null references public.analytics_daily_entries(id) on delete cascade,
  service_type text not null check (service_type in ('lunch','dinner')),
  covers integer not null default 0 check(covers >= 0),
  food_revenue_amount numeric(12,2) not null default 0 check(food_revenue_amount >= 0),
  beverage_revenue_amount numeric(12,2) not null default 0 check(beverage_revenue_amount >= 0),
  tax_basis text not null default 'gross' check(tax_basis in ('gross','net')),
  tax_details jsonb not null default '{"status":"unverified"}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (daily_entry_id, service_type)
);
create index if not exists analytics_service_daily_idx on public.analytics_service_entries(daily_entry_id);
alter table public.analytics_daily_entries enable row level security;
alter table public.analytics_service_entries enable row level security;
revoke all on public.analytics_daily_entries, public.analytics_service_entries from public, anon;
grant select,insert,update on public.analytics_daily_entries, public.analytics_service_entries to authenticated;
create policy analytics_daily_read on public.analytics_daily_entries for select to authenticated
using ((select public.analytics_has_permission('analytics.read')));
create policy analytics_daily_insert on public.analytics_daily_entries for insert to authenticated
with check ((select public.analytics_has_permission('analytics.write')) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy analytics_daily_update on public.analytics_daily_entries for update to authenticated
using ((select public.analytics_has_permission('analytics.write')))
with check ((select public.analytics_has_permission('analytics.write')) and updated_by = (select auth.uid()));
create policy analytics_service_read on public.analytics_service_entries for select to authenticated
using ((select public.analytics_has_permission('analytics.read')));
create policy analytics_service_insert on public.analytics_service_entries for insert to authenticated
with check ((select public.analytics_has_permission('analytics.write')) and exists (
select 1 from public.analytics_daily_entries d where d.id = daily_entry_id and d.status = 'draft'));
create policy analytics_service_update on public.analytics_service_entries for update to authenticated
using ((select public.analytics_has_permission('analytics.write')) and exists (
select 1 from public.analytics_daily_entries d where d.id = daily_entry_id and d.status = 'draft'))
with check ((select public.analytics_has_permission('analytics.write')) and exists (
select 1 from public.analytics_daily_entries d where d.id = daily_entry_id and d.status = 'draft'));
-- Atomically save the parent and both child services. No automatic net/IGIC inference.
create or replace function public.analytics_save_daily(p_date date,p_lunch_status text,p_dinner_status text,p_notes text,p_status text,p_services jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_service jsonb; v_type text; v_covers int; v_food numeric(12,2); v_bev numeric(12,2); v_basis text; v_existing text;
begin
if not public.analytics_has_permission('analytics.write') then raise exception 'Access denied'; end if;
if p_date is null or p_lunch_status not in ('open','closed') or p_dinner_status not in ('open','closed') or p_status not in ('draft','finalized') then raise exception 'Invalid daily entry'; end if;
if jsonb_typeof(p_services) is distinct from 'array' or jsonb_array_length(p_services) <> 2 then raise exception 'Two service records required'; end if;
insert into public.analytics_daily_entries(business_date,lunch_status,dinner_status,notes,status,created_by,updated_by)
values(p_date,p_lunch_status,p_dinner_status,p_notes,'draft',auth.uid(),auth.uid())
on conflict (business_date) do nothing;
select id,status into v_id,v_existing from public.analytics_daily_entries where business_date=p_date for update;
if v_existing = 'finalized' then raise exception 'Finalized entry cannot be overwritten'; end if;
update public.analytics_daily_entries set lunch_status=p_lunch_status,dinner_status=p_dinner_status,notes=p_notes,updated_by=auth.uid(),updated_at=now() where id=v_id;
if (select count(distinct x->>'service_type') from jsonb_array_elements(p_services) x where x->>'service_type' in ('lunch','dinner')) <> 2 then raise exception 'Invalid service types'; end if;
for v_service in select * from jsonb_array_elements(p_services) loop
 v_type:=v_service->>'service_type';v_covers:=(v_service->>'covers')::integer;v_food:=(v_service->>'food_revenue_amount')::numeric;v_bev:=(v_service->>'beverage_revenue_amount')::numeric;v_basis:=v_service->>'tax_basis';
 if v_covers is null or v_covers<0 or v_food is null or v_food<0 or v_bev is null or v_bev<0 or v_basis not in ('gross','net') then raise exception 'Invalid financial values'; end if;
 if (v_type='lunch' and p_lunch_status='closed') or (v_type='dinner' and p_dinner_status='closed') then
   if v_covers<>0 or v_food<>0 or v_bev<>0 then raise exception 'Closed service cannot have figures'; end if;
 end if;
 insert into public.analytics_service_entries(daily_entry_id,service_type,covers,food_revenue_amount,beverage_revenue_amount,tax_basis,tax_details,notes)
 values(v_id,v_type,v_covers,v_food,v_bev,v_basis,coalesce(v_service->'tax_details','{"status":"unverified"}'::jsonb),v_service->>'notes')
 on conflict (daily_entry_id,service_type) do update set covers=excluded.covers,food_revenue_amount=excluded.food_revenue_amount,beverage_revenue_amount=excluded.beverage_revenue_amount,tax_basis=excluded.tax_basis,tax_details=excluded.tax_details,notes=excluded.notes,updated_at=now();
end loop;
update public.analytics_daily_entries set status=p_status,updated_at=now() where id=v_id;
return v_id;
end $$;
revoke all on function public.analytics_save_daily(date,text,text,text,text,jsonb) from public,anon;
grant execute on function public.analytics_save_daily(date,text,text,text,text,jsonb) to authenticated;
commit;
