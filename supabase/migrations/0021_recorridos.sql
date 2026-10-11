-- Recorrido real de cada servicio completado (solo aditiva). Las posiciones GPS se purgan a los 30 días (0009), así
-- que el recorrido se guarda aparte, ya simplificado: lo calcula el vigilante del servidor (service role) con
-- `src/lib/dominio/recorrido.ts` y lo guarda con upsert (idempotente). Si el servicio se deshace y se vuelve a
-- completar, `fin` deja de coincidir con el último «completado» y se recalcula.
create table if not exists recorridos (
  servicio_id uuid primary key references servicios on delete cascade,
  conductor_id uuid references perfiles on delete set null,
  inicio timestamptz not null,               -- «en camino» (o «aceptado»)
  fin timestamptz not null,                  -- «completado»
  puntos jsonb not null default '[]'::jsonb, -- [[lng,lat], …] simplificados (Douglas-Peucker, ≤ 500)
  corte int,                                 -- índice del punto de recogida: [0..corte] hacia la recogida, [corte..] con pasajeros
  km numeric(8,2) not null default 0,
  km_con_pasajeros numeric(8,2),
  duracion_min int not null default 0,
  puntos_originales int not null default 0,
  calculado_en timestamptz not null default now()
);
create index if not exists recorridos_conductor_fin_idx on recorridos (conductor_id, fin desc);
create index if not exists recorridos_fin_idx on recorridos (fin desc);
-- El vigilante busca cada ~20 s los «completado» recientes.
create index if not exists eventos_servicio_completado_idx on eventos_servicio (creado_en) where tipo = 'completado';

alter table recorridos enable row level security;
-- Lectura: la central todo; el conductor, los suyos. Escritura: solo service role (sin políticas de escritura).
drop policy if exists leer_recorridos on recorridos;
create policy leer_recorridos on recorridos for select to authenticated
  using (es_operador() or conductor_id = auth.uid());
