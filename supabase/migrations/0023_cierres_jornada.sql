-- Hoja de cierre de jornada: estado del vehículo al terminar el día (zonas dañadas del diagrama, estado técnico,
-- combustible, km y comentario a la central). Un cierre por jornada. Se escribe SOLO con la función cerrar_jornada
-- (service role), que en una transacción inserta el cierre, sube los km del vehículo y finaliza la jornada abierta.
create table if not exists cierres_jornada (
  id uuid primary key default gen_random_uuid(),
  jornada_id uuid not null unique references jornadas on delete cascade,
  conductor_id uuid not null references perfiles on delete cascade,
  vehiculo_id uuid not null references vehiculos on delete cascade,
  id_accion uuid unique,
  zonas text[] not null default '{}',
  tecnico jsonb not null default '{}'::jsonb,
  combustible text not null check (combustible in ('lleno','3_4','1_2','1_4','reserva')),
  km int check (km is null or km between 0 and 2000000),
  comentario text not null default '' check (char_length(comentario) <= 1000),
  gravedad text not null check (gravedad in ('grave','mantenimiento','ok')),
  creado_en timestamptz not null default now(),
  visto boolean not null default false
);
create index if not exists cierres_jornada_vehiculo_idx on cierres_jornada (vehiculo_id, creado_en desc);
create index if not exists cierres_jornada_creado_idx on cierres_jornada (creado_en desc);
create index if not exists cierres_jornada_conductor_idx on cierres_jornada (conductor_id, creado_en desc);
create index if not exists cierres_jornada_pendientes_idx on cierres_jornada (creado_en) where gravedad = 'grave' and not visto;

alter table cierres_jornada enable row level security;
drop policy if exists leer_cierres_jornada on cierres_jornada;
create policy leer_cierres_jornada on cierres_jornada for select to authenticated using (es_operador() or conductor_id = auth.uid());
-- Sin políticas de escritura: solo el service role (rutas del servidor) inserta y marca «visto».

do $$ begin
  alter publication supabase_realtime add table cierres_jornada;
exception when duplicate_object then null; end $$;

-- Cursor del vigilante de push para los cierres (empieza ahora: no se avisa de nada anterior).
alter table vigilante_push add column if not exists ultimo_cierre_en timestamptz not null default now();

-- Cierre atómico. Devuelve {id, jornada_id, duplicada} o {error: 'sin_jornada'}.
-- Idempotente por id_accion (reintento del mismo envío) y por jornada (unique jornada_id).
create or replace function public.cerrar_jornada(
  p_conductor uuid, p_vehiculo uuid, p_id_accion uuid, p_zonas text[], p_tecnico jsonb, p_combustible text,
  p_km int, p_comentario text, p_gravedad text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_jornada uuid;
  v_id uuid;
  v_ahora timestamptz := now();
begin
  if p_id_accion is not null then
    select id, jornada_id into v_id, v_jornada from cierres_jornada where id_accion = p_id_accion and conductor_id = p_conductor;
    if v_id is not null then return jsonb_build_object('id', v_id, 'jornada_id', v_jornada, 'duplicada', true); end if;
  end if;
  select id into v_jornada from jornadas where conductor_id = p_conductor and fin is null for update;
  if v_jornada is null then return jsonb_build_object('error', 'sin_jornada'); end if;
  insert into cierres_jornada (jornada_id, conductor_id, vehiculo_id, id_accion, zonas, tecnico, combustible, km, comentario, gravedad)
    values (v_jornada, p_conductor, p_vehiculo, p_id_accion, coalesce(p_zonas, '{}'), coalesce(p_tecnico, '{}'::jsonb), p_combustible,
            p_km, coalesce(p_comentario, ''), p_gravedad)
    on conflict (jornada_id) do nothing
    returning id into v_id;
  if v_id is null then
    select id into v_id from cierres_jornada where jornada_id = v_jornada;
    return jsonb_build_object('id', v_id, 'jornada_id', v_jornada, 'duplicada', true);
  end if;
  if p_km is not null then
    update vehiculos set km_actuales = greatest(km_actuales, p_km) where id = p_vehiculo;
  end if;
  update pausas set fin = v_ahora where jornada_id = v_jornada and fin is null;
  update jornadas set fin = v_ahora where id = v_jornada and fin is null;
  return jsonb_build_object('id', v_id, 'jornada_id', v_jornada, 'duplicada', false);
end $$;
revoke execute on function public.cerrar_jornada(uuid, uuid, uuid, text[], jsonb, text, int, text, text) from public, anon, authenticated;
grant execute on function public.cerrar_jornada(uuid, uuid, uuid, text[], jsonb, text, int, text, text) to service_role;
