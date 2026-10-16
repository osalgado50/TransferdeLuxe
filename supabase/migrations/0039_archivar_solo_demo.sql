-- «Archivar» durante la evaluación (aditiva): la central y el jurado comparten cuenta, así que del 20 al 27/10 el botón
-- solo retira los datos de demostración (notas = 'Datos de demostración') y deja intactos los servicios preparados.
-- Misma mecánica que archivar_servicios(uuid) de 0038, pero sobre un conjunto de servicios; restaurar_ultimo_archivo()
-- sirve igual para estos lotes.
create or replace function public.archivar_servicios(p_actor uuid, p_solo_demo boolean) returns json
language plpgsql security definer set search_path = public as $$
declare l uuid; ids uuid[];
begin
  if not p_solo_demo then return public.archivar_servicios(p_actor); end if;
  select coalesce(array_agg(id), '{}') into ids from servicios where notas = 'Datos de demostración';
  if cardinality(ids) = 0 then return json_build_object('lote', null, 'servicios', 0); end if;
  insert into archivo_lotes (actor_id, servicios) values (p_actor, cardinality(ids)) returning id into l;
  insert into archivo_filas (lote, tabla, fila) select l, 'servicios', to_jsonb(s) from servicios s where s.id = any(ids);
  insert into archivo_filas (lote, tabla, fila) select l, 'eventos_servicio', to_jsonb(e) from eventos_servicio e where e.servicio_id = any(ids);
  insert into archivo_filas (lote, tabla, fila) select l, 'recorridos', to_jsonb(r) from recorridos r where r.servicio_id = any(ids);
  insert into archivo_filas (lote, tabla, fila) select l, 'seguimientos', to_jsonb(g) from seguimientos g where g.servicio_id = any(ids);
  insert into archivo_filas (lote, tabla, fila) select l, 'incidencias', to_jsonb(i) from incidencias i where i.servicio_id = any(ids);
  insert into archivo_filas (lote, tabla, fila) select l, 'alertas_horario', to_jsonb(a) from alertas_horario a where a.servicio_id = any(ids);
  delete from incidencias where servicio_id = any(ids);
  delete from alertas_horario where servicio_id = any(ids);
  update servicios set servicio_vuelta_id = null where servicio_vuelta_id = any(ids) or (id = any(ids) and servicio_vuelta_id is not null);
  delete from servicios where id = any(ids); -- en cascada: eventos, recorridos y seguimientos (ya copiados)
  return json_build_object('lote', l, 'servicios', cardinality(ids));
end $$;

revoke execute on function public.archivar_servicios(uuid, boolean) from public, anon, authenticated;
grant execute on function public.archivar_servicios(uuid, boolean) to service_role;
