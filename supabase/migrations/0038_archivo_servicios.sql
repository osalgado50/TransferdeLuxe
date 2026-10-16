-- «Archivar todos los servicios» desde el panel en vivo, con «Deshacer» (aditiva). Los servicios y todo lo que cuelga de
-- ellos (eventos, recorridos, seguimientos, incidencias y alertas de horario) se copian como JSON a archivo_filas y se
-- quitan de las tablas activas, en UNA transacción: así ninguna pantalla ni consulta necesita saber nada del archivo.
-- Restaurar devuelve el último lote tal cual (mismos ids).
create table if not exists public.archivo_lotes (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  actor_id uuid references public.perfiles on delete set null,
  servicios int not null default 0,
  restaurado_en timestamptz
);
create table if not exists public.archivo_filas (
  lote uuid not null references public.archivo_lotes on delete cascade,
  tabla text not null check (tabla in ('servicios', 'eventos_servicio', 'recorridos', 'seguimientos', 'incidencias', 'alertas_horario')),
  fila jsonb not null
);
create index if not exists archivo_filas_lote_idx on public.archivo_filas (lote, tabla);
alter table public.archivo_lotes enable row level security;
alter table public.archivo_filas enable row level security; -- sin políticas: solo el servidor (service role)

create or replace function public.archivar_servicios(p_actor uuid) returns json
language plpgsql security definer set search_path = public as $$
declare l uuid; n int;
begin
  select count(*) into n from servicios;
  if n = 0 then return json_build_object('lote', null, 'servicios', 0); end if;
  insert into archivo_lotes (actor_id, servicios) values (p_actor, n) returning id into l;
  insert into archivo_filas (lote, tabla, fila) select l, 'servicios', to_jsonb(s) from servicios s;
  insert into archivo_filas (lote, tabla, fila) select l, 'eventos_servicio', to_jsonb(e) from eventos_servicio e;
  insert into archivo_filas (lote, tabla, fila) select l, 'recorridos', to_jsonb(r) from recorridos r;
  insert into archivo_filas (lote, tabla, fila) select l, 'seguimientos', to_jsonb(g) from seguimientos g;
  insert into archivo_filas (lote, tabla, fila) select l, 'incidencias', to_jsonb(i) from incidencias i where i.servicio_id is not null;
  insert into archivo_filas (lote, tabla, fila) select l, 'alertas_horario', to_jsonb(a) from alertas_horario a where a.servicio_id is not null;
  delete from incidencias where servicio_id is not null;
  delete from alertas_horario where servicio_id is not null;
  update servicios set servicio_vuelta_id = null where servicio_vuelta_id is not null;
  delete from servicios; -- en cascada: eventos, recorridos y seguimientos (ya copiados)
  return json_build_object('lote', l, 'servicios', n);
end $$;

create or replace function public.restaurar_ultimo_archivo() returns json
language plpgsql security definer set search_path = public as $$
declare l uuid; n int;
begin
  select id into l from archivo_lotes where restaurado_en is null order by creado_en desc limit 1;
  if l is null then return json_build_object('lote', null, 'servicios', 0); end if;
  -- Primero sin la ida/vuelta enlazada (puede apuntar a otro del lote) y luego se enlaza.
  insert into servicios select (jsonb_populate_record(null::servicios, fila - 'servicio_vuelta_id')).* from archivo_filas where lote = l and tabla = 'servicios'
    on conflict (id) do nothing;
  get diagnostics n = row_count;
  update servicios s set servicio_vuelta_id = (f.fila->>'servicio_vuelta_id')::uuid
    from archivo_filas f where f.lote = l and f.tabla = 'servicios' and (f.fila->>'id')::uuid = s.id and f.fila->>'servicio_vuelta_id' is not null
      and exists (select 1 from servicios v where v.id = (f.fila->>'servicio_vuelta_id')::uuid);
  insert into eventos_servicio overriding system value
    select (jsonb_populate_record(null::eventos_servicio, fila)).* from archivo_filas where lote = l and tabla = 'eventos_servicio' on conflict do nothing;
  insert into recorridos select (jsonb_populate_record(null::recorridos, fila)).* from archivo_filas where lote = l and tabla = 'recorridos' on conflict do nothing;
  insert into seguimientos select (jsonb_populate_record(null::seguimientos, fila)).* from archivo_filas where lote = l and tabla = 'seguimientos' on conflict do nothing;
  insert into incidencias select (jsonb_populate_record(null::incidencias, fila)).* from archivo_filas where lote = l and tabla = 'incidencias' on conflict do nothing;
  insert into alertas_horario select (jsonb_populate_record(null::alertas_horario, fila)).* from archivo_filas where lote = l and tabla = 'alertas_horario' on conflict do nothing;
  update archivo_lotes set restaurado_en = now() where id = l;
  delete from archivo_filas where lote = l;
  return json_build_object('lote', l, 'servicios', n);
end $$;

revoke execute on function public.archivar_servicios(uuid) from public, anon, authenticated;
revoke execute on function public.restaurar_ultimo_archivo() from public, anon, authenticated;
grant execute on function public.archivar_servicios(uuid) to service_role;
grant execute on function public.restaurar_ultimo_archivo() to service_role;
