-- Aceptación tardía: al vencer el plazo de respuesta el servicio NO se quita al conductor; se marca una vez
-- (alerta «Sin respuesta» en la central) y el conductor aún puede aceptarlo mientras la central no lo reasigne.
alter table servicios add column if not exists plazo_vencido_en timestamptz;

create or replace function public.expirar_asignaciones() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with vencidos as (
    update servicios
       set plazo_vencido_en = now(), ultima_incidencia = 'expirado', incidencia_vista = false
     where estado = 'asignado' and plazo_vencido_en is null
       and asignado_en + make_interval(mins => plazo_respuesta_min) < now()
     returning id
  )
  insert into eventos_servicio (servicio_id, tipo, motivo)
  select id, 'expirado', 'Plazo de respuesta vencido: el conductor aún puede aceptarlo' from vencidos;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.expirar_asignaciones() from public, anon, authenticated;

-- Nueva asignación (o vuelta a pendiente) = plazo nuevo.
create or replace function public.reiniciar_plazo_vencido() returns trigger language plpgsql set search_path = public as $$
begin
  if new.asignado_en is distinct from old.asignado_en or new.conductor_id is distinct from old.conductor_id
     or new.estado <> 'asignado' then
    new.plazo_vencido_en := null;
  end if;
  return new;
end $$;
revoke execute on function public.reiniciar_plazo_vencido() from public, anon, authenticated;
drop trigger if exists reiniciar_plazo_vencido on servicios;
create trigger reiniciar_plazo_vencido before update on servicios for each row execute function public.reiniciar_plazo_vencido();
