create or replace function public.actualizar_posicion_actual() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into posicion_actual (conductor_id, lat, lng, velocidad, en_servicio, registrado_en)
  values (new.conductor_id, new.lat, new.lng, new.velocidad, true, new.registrado_en)
  on conflict (conductor_id) do update
    set lat = excluded.lat, lng = excluded.lng, velocidad = excluded.velocidad,
        en_servicio = true, registrado_en = excluded.registrado_en
    where posicion_actual.registrado_en <= excluded.registrado_en;
  return new;
end $$;

revoke execute on function public.expirar_asignaciones() from public, anon, authenticated;
revoke execute on function public.actualizar_posicion_actual() from public, anon, authenticated;
