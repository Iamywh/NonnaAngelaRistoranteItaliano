create or replace function public.prevent_reservation_on_blocked_slot()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.reservation_slot_blocks
    where reservation_date = new.reservation_date
      and reservation_time = new.reservation_time
  ) then
    raise exception 'Este horario está bloqueado para reservas online.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_reservation_on_blocked_slot_insert_update on public.reservations;

create trigger prevent_reservation_on_blocked_slot_insert_update
  before insert or update of reservation_date, reservation_time
  on public.reservations
  for each row
  execute function public.prevent_reservation_on_blocked_slot();
