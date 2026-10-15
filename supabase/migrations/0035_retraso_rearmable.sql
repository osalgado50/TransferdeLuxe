-- El aviso de retraso en la recogida se podía registrar UNA sola vez en la vida del servicio (índice único por
-- servicio): si después se reasignaba o se movía la recogida (vuelo con retraso) y el nuevo conductor también llegaba
-- tarde, la central no se enteraba. Ahora es una vez por «ciclo»: hora de recogida + conductor (columna `clave`).
alter table public.eventos_servicio add column if not exists clave text;

create unique index if not exists eventos_servicio_retraso_recogida_ciclo
  on public.eventos_servicio (servicio_id, clave) where tipo = 'retraso_recogida';
-- Los avisos ya registrados conservan su ciclo (para no repetirlos al aplicar esto).
update public.eventos_servicio e set clave = s.fecha_hora_recogida::text || '|' || coalesce(s.conductor_id::text, '')
  from public.servicios s where e.servicio_id = s.id and e.tipo = 'retraso_recogida' and e.clave is null;
drop index if exists public.eventos_servicio_retraso_recogida_uno;

create or replace function public.detectar_retrasos_recogida() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into eventos_servicio (servicio_id, tipo, motivo, clave)
  select s.id, 'retraso_recogida', 'Hora de recogida superada y sin recoger',
         s.fecha_hora_recogida::text || '|' || s.conductor_id::text
    from servicios s
   where s.estado in ('asignado', 'aceptado', 'en_camino')
     and s.conductor_id is not null
     and s.fecha_hora_recogida < now() - interval '2 minutes'
     and s.fecha_hora_recogida > now() - interval '6 hours'
  on conflict (servicio_id, clave) where tipo = 'retraso_recogida' do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.detectar_retrasos_recogida() from public, anon, authenticated;
grant execute on function public.detectar_retrasos_recogida() to service_role;
