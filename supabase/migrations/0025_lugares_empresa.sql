-- Lugares de la empresa (clientes y sitios habituales): salen primero en el autocompletado de la central.
-- Privados: la central lee y escribe; los conductores solo leen (para el futuro servicio inmediato).
-- La página pública /reservar no los usa y /api/geocodificar nunca los devuelve.
create table if not exists public.lugares_empresa (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  direccion text not null check (length(btrim(direccion)) between 1 and 300),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  notas text check (notas is null or length(notas) <= 500),
  telefono text check (telefono is null or length(telefono) <= 30),
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index if not exists lugares_empresa_nombre_idx on public.lugares_empresa (lower(nombre));

alter table public.lugares_empresa enable row level security;
create policy lugares_empresa_select on public.lugares_empresa for select to authenticated
  using (es_operador() or exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'conductor'));
create policy lugares_empresa_insert on public.lugares_empresa for insert to authenticated with check (es_operador());
create policy lugares_empresa_update on public.lugares_empresa for update to authenticated using (es_operador()) with check (es_operador());
create policy lugares_empresa_delete on public.lugares_empresa for delete to authenticated using (es_operador());
