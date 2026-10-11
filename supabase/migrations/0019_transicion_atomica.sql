-- Cambio de estado del servicio + evento del historial en UNA transacción: si el proceso del servidor muere entre
-- las dos escrituras (p. ej. durante un despliegue), no puede quedar el servicio cambiado sin su evento.
create or replace function public.transicion_servicio(
  p_id uuid, p_esperado estado_servicio, p_cambios jsonb, p_tipo text, p_actor uuid, p_motivo text
) returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update servicios set
    estado             = coalesce((p_cambios->>'estado')::estado_servicio, estado),
    conductor_id       = case when p_cambios ? 'conductor_id' then (p_cambios->>'conductor_id')::uuid else conductor_id end,
    vehiculo_id        = case when p_cambios ? 'vehiculo_id' then (p_cambios->>'vehiculo_id')::uuid else vehiculo_id end,
    asignado_en        = case when p_cambios ? 'asignado_en' then (p_cambios->>'asignado_en')::timestamptz else asignado_en end,
    incidencia_vista   = case when p_cambios ? 'incidencia_vista' then (p_cambios->>'incidencia_vista')::boolean else incidencia_vista end,
    ultima_incidencia  = case when p_cambios ? 'ultima_incidencia' then p_cambios->>'ultima_incidencia' else ultima_incidencia end
  where id = p_id and estado = p_esperado;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  insert into eventos_servicio (servicio_id, tipo, actor_id, motivo) values (p_id, p_tipo, p_actor, p_motivo);
  return true;
end $$;
revoke execute on function public.transicion_servicio(uuid, estado_servicio, jsonb, text, uuid, text) from public, anon, authenticated;
grant execute on function public.transicion_servicio(uuid, estado_servicio, jsonb, text, uuid, text) to service_role;
