create table if not exists public.reservation_slot_blocks (
  id uuid primary key default gen_random_uuid(),
  reservation_date date not null,
  reservation_time text not null,
  service text not null default 'outside',
  reason text,
  created_by text default 'manager',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_slot_blocks_unique unique (reservation_date, reservation_time)
);

create index if not exists reservation_slot_blocks_date_idx
  on public.reservation_slot_blocks (reservation_date);

create index if not exists reservation_slot_blocks_date_time_idx
  on public.reservation_slot_blocks (reservation_date, reservation_time);

alter table public.reservation_slot_blocks enable row level security;

drop policy if exists "reservation_slot_blocks_read" on public.reservation_slot_blocks;
create policy "reservation_slot_blocks_read"
  on public.reservation_slot_blocks
  for select
  using (true);

drop policy if exists "reservation_slot_blocks_insert" on public.reservation_slot_blocks;
create policy "reservation_slot_blocks_insert"
  on public.reservation_slot_blocks
  for insert
  with check (true);

drop policy if exists "reservation_slot_blocks_update" on public.reservation_slot_blocks;
create policy "reservation_slot_blocks_update"
  on public.reservation_slot_blocks
  for update
  using (true)
  with check (true);

drop policy if exists "reservation_slot_blocks_delete" on public.reservation_slot_blocks;
create policy "reservation_slot_blocks_delete"
  on public.reservation_slot_blocks
  for delete
  using (true);

grant select, insert, update, delete on public.reservation_slot_blocks to anon, authenticated;
