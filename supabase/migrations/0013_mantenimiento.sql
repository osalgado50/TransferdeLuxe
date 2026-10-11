-- Módulo «mantenimiento»: plan por vehículo (ITV, seguro, próxima revisión) y registro de mantenimientos.
-- Solo aditiva. Escrituras por service role (Server Actions); lectura: operador todo, conductor su vehículo habitual.
create table if not exists vehiculos_mantenimiento (
  vehiculo_id uuid primary key references vehiculos on delete cascade,
  itv_fecha date,
  seguro_vence date,
  revision_fecha date,
  revision_km int check (revision_km >= 0),
  actualizado_en timestamptz not null default now()
);

create table if not exists mantenimientos (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references vehiculos on delete cascade,
  fecha date not null,
  km int not null check (km >= 0),
  tipo text not null check (tipo in ('revision','itv','aceite','neumaticos','frenos','reparacion','otro')),
  descripcion text,
  coste numeric(10,2) check (coste >= 0),
  taller text,
  creado_en timestamptz not null default now()
);
create index if not exists mantenimientos_vehiculo_fecha on mantenimientos (vehiculo_id, fecha desc);

alter table vehiculos_mantenimiento enable row level security;
alter table mantenimientos enable row level security;

create policy leer_plan_mantenimiento on vehiculos_mantenimiento for select to authenticated
  using (es_operador() or exists (select 1 from perfiles p where p.id = auth.uid() and p.vehiculo_habitual_id = vehiculo_id));
create policy leer_mantenimientos on mantenimientos for select to authenticated
  using (es_operador() or exists (select 1 from perfiles p where p.id = auth.uid() and p.vehiculo_habitual_id = vehiculo_id));

-- Registro atómico: inserta y sube vehiculos.km_actuales solo si el nuevo km es mayor (greatest, sin carreras).
create or replace function registrar_mantenimiento(p_vehiculo uuid, p_fecha date, p_km int, p_tipo text,
  p_descripcion text, p_coste numeric, p_taller text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into mantenimientos (vehiculo_id, fecha, km, tipo, descripcion, coste, taller)
    values (p_vehiculo, p_fecha, p_km, p_tipo, p_descripcion, p_coste, p_taller) returning id into v_id;
  update vehiculos set km_actuales = greatest(km_actuales, p_km) where id = p_vehiculo;
  return v_id;
end $$;
revoke all on function registrar_mantenimiento(uuid, date, int, text, text, numeric, text) from public, anon, authenticated;
grant execute on function registrar_mantenimiento(uuid, date, int, text, text, numeric, text) to service_role;
