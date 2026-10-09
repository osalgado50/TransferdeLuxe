create type rol_usuario as enum ('operador','conductor');
create type estado_servicio as enum ('pendiente','asignado','aceptado','en_camino','recogido','completado','cancelado','subcontratado');
create type tipo_vehiculo as enum ('sedan','minivan','minivan_premium','microbus','minibus');

create table vehiculos (
  id uuid primary key default gen_random_uuid(),
  matricula text not null unique,
  modelo text not null,
  plazas int not null check (plazas between 1 and 19),
  estado text not null default 'activo' check (estado in ('activo','taller')),
  km_actuales int not null default 0
);

create table perfiles (
  id uuid primary key references auth.users on delete cascade,
  rol rol_usuario not null,
  nombre text not null,
  telefono text,
  vehiculo_habitual_id uuid references vehiculos
);

create table servicios (
  id uuid primary key default gen_random_uuid(),
  cliente_nombre text not null,
  cliente_apellidos text not null default '',
  cliente_email text not null,
  cliente_telefono text not null,
  origen_texto text not null, origen_lat double precision, origen_lng double precision,
  destino_texto text not null, destino_lat double precision, destino_lng double precision,
  fecha_hora_recogida timestamptz not null,
  pasajeros int not null check (pasajeros between 1 and 19),
  maletas int not null default 0 check (maletas between 0 and 19),
  tipo_vehiculo_pedido tipo_vehiculo not null default 'minivan',
  numero_vuelo text,
  notas text,
  origen_pedido text not null check (origen_pedido in ('web','manual')),
  servicio_vuelta_id uuid references servicios on delete set null,
  conductor_id uuid references perfiles,
  vehiculo_id uuid references vehiculos,
  estado estado_servicio not null default 'pendiente',
  asignado_en timestamptz,
  plazo_respuesta_min int not null default 15,
  duracion_estimada_min int not null default 45,
  subcontratar boolean not null default false,
  ultima_incidencia text,           -- 'rechazado: <motivo>' | 'expirado'
  incidencia_vista boolean not null default true,
  creado_en timestamptz not null default now()
);
create index on servicios (fecha_hora_recogida);
create index on servicios (conductor_id, fecha_hora_recogida);

create table eventos_servicio (
  id bigint generated always as identity primary key,
  servicio_id uuid not null references servicios on delete cascade,
  tipo text not null,
  actor_id uuid references perfiles,
  motivo text,
  creado_en timestamptz not null default now()
);

create table acciones_procesadas (id uuid primary key, creado_en timestamptz not null default now());

create table posiciones (
  id bigint generated always as identity primary key,
  conductor_id uuid not null references perfiles on delete cascade,
  lat double precision not null, lng double precision not null,
  velocidad double precision, precision_m double precision,
  registrado_en timestamptz not null default now()
);
create index on posiciones (conductor_id, registrado_en desc);

create table posicion_actual (
  conductor_id uuid primary key references perfiles on delete cascade,
  lat double precision not null, lng double precision not null,
  velocidad double precision,
  en_servicio boolean not null default true,
  registrado_en timestamptz not null
);

create table tickets_combustible (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references perfiles,
  vehiculo_id uuid not null references vehiculos,
  fecha date not null,
  gasolinera text,
  litros numeric(8,2) not null check (litros > 0),
  precio_litro numeric(6,3),
  importe numeric(8,2) not null check (importe > 0),
  tipo_combustible text,
  km int not null check (km >= 0),
  foto_path text,
  datos_ia jsonb,
  corregido boolean not null default false,
  creado_en timestamptz not null default now()
);

create table lugares_frecuentes (
  id serial primary key, nombre text not null, tipo text not null,
  lat double precision not null, lng double precision not null
);

create table ajustes (
  id int primary key default 1 check (id = 1),
  plazo_respuesta_min int not null default 15,
  umbral_sin_senal_min int not null default 5
);
insert into ajustes default values;

alter publication supabase_realtime add table servicios, eventos_servicio, posicion_actual;

insert into storage.buckets (id, name, public) values ('tickets','tickets', false);
