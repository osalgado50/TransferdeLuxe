-- Retraso en la recogida (solo aditiva): si pasan 2 min de la hora de recogida y el servicio sigue sin recoger
-- (asignado / aceptado / en camino), se registra UNA vez el evento 'retraso_recogida' para que la central lo vea
-- (actividad, sonido y push), aunque el móvil del conductor no tenga cobertura.
-- Solo recogidas de las últimas 6 h: los servicios antiguos que se quedaron «aceptado» no inundan la actividad.

-- Una sola vez por servicio, garantizado por la base de datos (también si el vigilante y pg_cron coinciden).
create unique index if not exists eventos_servicio_retraso_recogida_uno
  on eventos_servicio (servicio_id) where tipo = 'retraso_recogida';

create or replace function public.detectar_retrasos_recogida() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into eventos_servicio (servicio_id, tipo, motivo)
  select s.id, 'retraso_recogida', 'Hora de recogida superada y sin recoger'
    from servicios s
   where s.estado in ('asignado', 'aceptado', 'en_camino')
     and s.conductor_id is not null
     and s.fecha_hora_recogida < now() - interval '2 minutes'
     and s.fecha_hora_recogida > now() - interval '6 hours'
  on conflict (servicio_id) where tipo = 'retraso_recogida' do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.detectar_retrasos_recogida() from public, anon, authenticated;
grant execute on function public.detectar_retrasos_recogida() to service_role;

-- Red de seguridad sin servidor web: cada minuto desde pg_cron (el vigilante lo llama además cada ~20 s).
select cron.unschedule(jobid) from cron.job where jobname = 'detectar-retrasos-recogida';
select cron.schedule('detectar-retrasos-recogida', '* * * * *', $$select public.detectar_retrasos_recogida()$$);
