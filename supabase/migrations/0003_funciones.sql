create extension if not exists pg_cron;

create or replace function actualizar_posicion_actual() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into posicion_actual (conductor_id, lat, lng, velocidad, en_servicio, registrado_en)
  values (new.conductor_id, new.lat, new.lng, new.velocidad, true, new.registrado_en)
  on conflict (conductor_id) do update
    set lat = excluded.lat, lng = excluded.lng, velocidad = excluded.velocidad,
        en_servicio = true, registrado_en = excluded.registrado_en;
  return new;
end $$;
create trigger trg_posicion after insert on posiciones for each row execute function actualizar_posicion_actual();

create or replace function expirar_asignaciones() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with vencidos as (
    update servicios
       set estado = 'pendiente', conductor_id = null, vehiculo_id = null, asignado_en = null,
           ultima_incidencia = 'expirado', incidencia_vista = false
     where estado = 'asignado' and asignado_en + make_interval(mins => plazo_respuesta_min) < now()
     returning id
  )
  insert into eventos_servicio (servicio_id, tipo, motivo)
  select id, 'expirado', 'Sin respuesta del conductor en el plazo' from vencidos;
  get diagnostics n = row_count;
  return n;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'expirar-asignaciones';
select cron.schedule('expirar-asignaciones', '* * * * *', $$select public.expirar_asignaciones()$$);
