-- Horarios de los conductores (jornada continua o partida), base/depósito donde se hace el relevo del coche y alertas
-- de horario a la central. Todo aditivo: un conductor SIN horario definido sigue disponible todo el día (como antes).

-- ── Base / depósito ── el coche siempre vuelve aquí y aquí se hace el relevo (editable en «Flota y ajustes»).
alter table public.ajustes add column if not exists base_texto text;
alter table public.ajustes add column if not exists base_lat double precision check (base_lat is null or base_lat between -90 and 90);
alter table public.ajustes add column if not exists base_lng double precision check (base_lng is null or base_lng between -180 and 180);

-- Tramos: [{"inicio":"08:00","fin":"13:00"}, {"inicio":"16:00","fin":"20:00"}] (hora de Madrid; lo valida el servidor).
-- ── Plantillas reutilizables («Mañanas 06–14», «Partido 08–13 / 16–20») ──
create table if not exists public.plantillas_horario (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 60),
  tramos jsonb not null default '[]'::jsonb check (jsonb_typeof(tramos) = 'array'),
  creado_en timestamptz not null default now()
);

-- ── Semana tipo de cada conductor ── una fila por día (1 = lunes … 7 = domingo); tramos [] = libre ese día.
create table if not exists public.horarios_conductor (
  conductor_id uuid not null references public.perfiles on delete cascade,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  tramos jsonb not null default '[]'::jsonb check (jsonb_typeof(tramos) = 'array'),
  -- Vehículo del turno (el coche que coge en la base ese día); null = su vehículo habitual.
  vehiculo_id uuid references public.vehiculos on delete set null,
  plantilla_id uuid references public.plantillas_horario on delete set null,
  actualizado_en timestamptz not null default now(),
  primary key (conductor_id, dia_semana)
);

-- ── Cambios de un día concreto ── mandan sobre la semana tipo; tramos [] = libre ese día.
create table if not exists public.excepciones_horario (
  conductor_id uuid not null references public.perfiles on delete cascade,
  fecha date not null,
  tramos jsonb not null default '[]'::jsonb check (jsonb_typeof(tramos) = 'array'),
  nota text not null default '' check (char_length(nota) <= 200),
  creado_en timestamptz not null default now(),
  primary key (conductor_id, fecha)
);

alter table public.plantillas_horario enable row level security;
alter table public.horarios_conductor enable row level security;
alter table public.excepciones_horario enable row level security;

drop policy if exists operador_plantillas_horario on public.plantillas_horario;
create policy operador_plantillas_horario on public.plantillas_horario for all to authenticated using (es_operador()) with check (es_operador());

drop policy if exists leer_horarios_conductor on public.horarios_conductor;
create policy leer_horarios_conductor on public.horarios_conductor for select to authenticated using (es_operador() or conductor_id = auth.uid());
drop policy if exists operador_horarios_conductor on public.horarios_conductor;
create policy operador_horarios_conductor on public.horarios_conductor for all to authenticated using (es_operador()) with check (es_operador());

drop policy if exists leer_excepciones_horario on public.excepciones_horario;
create policy leer_excepciones_horario on public.excepciones_horario for select to authenticated using (es_operador() or conductor_id = auth.uid());
drop policy if exists operador_excepciones_horario on public.excepciones_horario;
create policy operador_excepciones_horario on public.excepciones_horario for all to authenticated using (es_operador()) with check (es_operador());

-- ── Alertas de horario a la central (las inserta el vigilante; una por caso gracias a la clave única) ──
-- fuera_horario: servicio asignado fuera del horario del conductor (clave = servicio).
-- sin_jornada:   sin iniciar jornada 15 min después del inicio de su tramo (clave = día + inicio del tramo).
-- fin_turno:     sigue en servicio > 30 min pasado el fin de su turno sin tiempo de volver a la base (clave = día + fin).
create table if not exists public.alertas_horario (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('fuera_horario', 'sin_jornada', 'fin_turno')),
  conductor_id uuid not null references public.perfiles on delete cascade,
  servicio_id uuid references public.servicios on delete cascade,
  clave text not null,
  texto text not null check (char_length(texto) <= 300),
  creado_en timestamptz not null default now(),
  unique (tipo, conductor_id, clave)
);
create index if not exists alertas_horario_creado_idx on public.alertas_horario (creado_en desc);
alter table public.alertas_horario enable row level security;
drop policy if exists leer_alertas_horario on public.alertas_horario;
create policy leer_alertas_horario on public.alertas_horario for select to authenticated using (es_operador());

do $$ begin
  alter publication supabase_realtime add table public.alertas_horario;
exception when duplicate_object then null; end $$;
