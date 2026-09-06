alter table public.reservations
  add column if not exists assigned_tables text[] default '{}'::text[];

update public.reservations
set assigned_tables = '{}'::text[]
where assigned_tables is null;

alter table public.reservations
  alter column assigned_tables set default '{}'::text[],
  alter column assigned_tables set not null;

create index if not exists reservations_assigned_tables_idx
  on public.reservations using gin (assigned_tables);

comment on column public.reservations.assigned_tables is
  'Numeri tavolo assegnati dal foglio sala digitale del manager. Supporta più tavoli per una stessa prenotazione.';
