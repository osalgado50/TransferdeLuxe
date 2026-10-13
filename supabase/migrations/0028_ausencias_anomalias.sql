-- Ausencias de los conductores (vacaciones, fiestas, días libres, bajas), anomalías de CARGA/DESCARGA lejos del punto y
-- aviso de «jornada cerrada con servicios pendientes hoy». Todo aditivo: nada existente cambia de comportamiento.

-- ── Ausencias ── (las escribe solo la central por el servidor; el conductor lee las suyas)
create table if not exists public.ausencias (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references public.perfiles on delete cascade,
  desde date not null,
  hasta date not null,
  franja text not null default 'dia' check (franja in ('dia','manana','tarde')),
  tipo text not null check (tipo in ('vacaciones','fiesta','libre','baja','otro')),
  nota text not null default '' check (char_length(nota) <= 300),
  creado_por uuid references public.perfiles on delete set null,
  creado_en timestamptz not null default now(),
  check (hasta >= desde),
  check (hasta - desde <= 366)
);
create index if not exists ausencias_conductor_idx on public.ausencias (conductor_id, desde, hasta);
create index if not exists ausencias_rango_idx on public.ausencias (desde, hasta);

alter table public.ausencias enable row level security;
drop policy if exists leer_ausencias on public.ausencias;
create policy leer_ausencias on public.ausencias for select to authenticated using (es_operador() or conductor_id = auth.uid());
drop policy if exists operador_ausencias on public.ausencias;
create policy operador_ausencias on public.ausencias for all to authenticated using (es_operador()) with check (es_operador());

-- ── Anomalías de CARGA/DESCARGA ── umbral (m) editable en «Flota y ajustes».
alter table public.ajustes add column if not exists umbral_anomalia_m int not null default 500
  check (umbral_anomalia_m between 50 and 20000);
-- Una alerta por servicio y tipo (el vigilante inserta el evento; un reintento o un «deshacer + CARGA» no duplica).
create unique index if not exists eventos_servicio_anomalia_uno
  on public.eventos_servicio (servicio_id, tipo) where tipo in ('anomalia_carga', 'anomalia_descarga');

-- ── Jornada cerrada con servicios pendientes hoy ── lo rellena el vigilante una sola vez por jornada:
-- `pendientes_revisada_en` (cuándo se comprobó) y `pendientes_cierre` ([{id, hora}] sin devolver al cerrar; [] si ninguno).
alter table public.jornadas add column if not exists pendientes_revisada_en timestamptz;
alter table public.jornadas add column if not exists pendientes_cierre jsonb;
create index if not exists jornadas_fin_sin_revisar_idx on public.jornadas (fin) where fin is not null and pendientes_revisada_en is null;
