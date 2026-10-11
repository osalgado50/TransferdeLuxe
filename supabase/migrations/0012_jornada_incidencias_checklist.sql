-- Módulos del conductor: jornada laboral (registro horario), incidencias y checklist del vehículo. Solo aditivo.
-- Escrituras de negocio por service role (Server Actions / rutas API); RLS de lectura: conductor lo suyo, operador todo.

create table if not exists jornadas (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references perfiles on delete cascade,
  inicio timestamptz not null default now(),
  fin timestamptz,
  check (fin is null or fin >= inicio)
);
create index if not exists jornadas_conductor_inicio_idx on jornadas (conductor_id, inicio desc);
create unique index if not exists jornadas_una_abierta on jornadas (conductor_id) where fin is null;

create table if not exists pausas (
  id uuid primary key default gen_random_uuid(),
  jornada_id uuid not null references jornadas on delete cascade,
  inicio timestamptz not null default now(),
  fin timestamptz,
  check (fin is null or fin >= inicio)
);
create index if not exists pausas_jornada_idx on pausas (jornada_id);
create unique index if not exists pausas_una_abierta on pausas (jornada_id) where fin is null;

alter table jornadas enable row level security;
alter table pausas enable row level security;
create policy leer_jornadas on jornadas for select to authenticated using (es_operador() or conductor_id = auth.uid());
create policy crear_jornadas on jornadas for insert to authenticated with check (conductor_id = auth.uid());
create policy leer_pausas on pausas for select to authenticated
  using (es_operador() or exists (select 1 from jornadas j where j.id = jornada_id and j.conductor_id = auth.uid()));
create policy crear_pausas on pausas for insert to authenticated
  with check (exists (select 1 from jornadas j where j.id = jornada_id and j.conductor_id = auth.uid()));

create table if not exists incidencias (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references perfiles on delete cascade,
  servicio_id uuid references servicios on delete set null,
  tipo text not null check (tipo in ('averia','accidente','no_presentado','retraso','otro')),
  descripcion text not null default '' check (char_length(descripcion) <= 1000),
  foto_path text,
  lat double precision, lng double precision,
  creado_en timestamptz not null default now(),
  resuelta boolean not null default false,
  resuelta_en timestamptz
);
create index if not exists incidencias_creado_idx on incidencias (creado_en desc);
create index if not exists incidencias_pendientes_idx on incidencias (resuelta) where not resuelta;
alter table incidencias enable row level security;
create policy leer_incidencias on incidencias for select to authenticated using (es_operador() or conductor_id = auth.uid());

insert into storage.buckets (id, name, public) values ('incidencias', 'incidencias', false) on conflict (id) do nothing;
create policy leer_fotos_incidencias on storage.objects for select to authenticated
  using (bucket_id = 'incidencias' and (es_operador() or (storage.foldername(name))[1] = auth.uid()::text));

create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (char_length(texto) between 1 and 120),
  orden int not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table checklist_items enable row level security;
create policy leer_checklist_items on checklist_items for select to authenticated using (true);

create table if not exists checklist_revisiones (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references perfiles on delete cascade,
  vehiculo_id uuid not null references vehiculos on delete cascade,
  fecha date not null,
  respuestas jsonb not null default '{}'::jsonb,
  observaciones text not null default '' check (char_length(observaciones) <= 1000),
  foto_path text,
  con_fallos boolean not null default false,
  revisada boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (conductor_id, vehiculo_id, fecha)
);
create index if not exists checklist_revisiones_fecha_idx on checklist_revisiones (fecha desc);
alter table checklist_revisiones enable row level security;
create policy leer_checklist_revisiones on checklist_revisiones for select to authenticated using (es_operador() or conductor_id = auth.uid());

-- Ítems por defecto: solo si la tabla está vacía (nunca se borra nada).
insert into checklist_items (texto, orden)
select t, o from (values ('Luces', 1), ('Neumáticos', 2), ('Limpieza interior', 3), ('Nivel de combustible', 4),
  ('Documentación del vehículo', 5), ('Daños visibles', 6)) v(t, o)
where not exists (select 1 from checklist_items);

do $$ begin
  alter publication supabase_realtime add table incidencias;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table checklist_revisiones;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table jornadas;
exception when duplicate_object then null; end $$;
