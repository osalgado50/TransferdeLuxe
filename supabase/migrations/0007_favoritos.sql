-- Favoritos del operador: direcciones sueltas y trayectos (origen + destino + pasajeros/maletas/vehículo).
create table if not exists public.favoritos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('direccion','trayecto')),
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  origen_texto text not null,
  origen_lat double precision,
  origen_lng double precision,
  destino_texto text,
  destino_lat double precision,
  destino_lng double precision,
  pasajeros int check (pasajeros between 1 and 19),
  maletas int check (maletas between 0 and 30),
  tipo_vehiculo_pedido tipo_vehiculo,
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  check (tipo = 'trayecto' or destino_texto is null)
);
alter table public.favoritos enable row level security;
create policy favoritos_select on public.favoritos for select to authenticated using (es_operador());
create policy favoritos_insert on public.favoritos for insert to authenticated with check (es_operador());
create policy favoritos_update on public.favoritos for update to authenticated using (es_operador()) with check (es_operador());
create policy favoritos_delete on public.favoritos for delete to authenticated using (es_operador());
