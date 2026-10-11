-- Validación de posiciones: coordenadas imposibles se descartan en silencio (no rompe la cola offline);
-- una hora futura se sustituye por la del servidor (evita que la posición quede congelada en el mapa).
-- Las posiciones antiguas legítimas (cola offline) se conservan con su hora.
create or replace function public.validar_posicion() returns trigger language plpgsql set search_path = public as $$
begin
  if new.lat is null or new.lng is null or new.lat not between -90 and 90 or new.lng not between -180 and 180
     or (new.lat = 0 and new.lng = 0) then
    return null;
  end if;
  if new.registrado_en > now() + interval '1 minute' then
    new.registrado_en := now();
  end if;
  return new;
end $$;
revoke execute on function public.validar_posicion() from public, anon, authenticated;

drop trigger if exists validar_posicion on posiciones;
create trigger validar_posicion before insert on posiciones for each row execute function public.validar_posicion();

-- Corrige posiciones actuales ya congeladas en el futuro.
update posicion_actual set registrado_en = now() where registrado_en > now() + interval '1 minute';

-- Purga diaria (03:15 UTC): posiciones y acciones procesadas de más de 30 días.
create index if not exists posiciones_registrado_en_idx on posiciones (registrado_en);
create index if not exists acciones_procesadas_creado_en_idx on acciones_procesadas (creado_en);
select cron.schedule('purgar-antiguos', '15 3 * * *', $$
  delete from public.posiciones where registrado_en < now() - interval '30 days';
  delete from public.acciones_procesadas where creado_en < now() - interval '30 days';
$$);
