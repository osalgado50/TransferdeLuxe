-- Índices preventivos para los filtros que usa la app (auditoría de estrés 15/10/2026). Hoy las tablas son pequeñas y
-- todo va por debajo de 10 ms; con meses de datos, estas consultas (panel, vigilante, combustible) dejarían de escanear
-- tablas enteras. Solo aditivo.
create index if not exists eventos_servicio_creado_en_idx on public.eventos_servicio (creado_en desc);
create index if not exists checklist_revisiones_creado_en_idx on public.checklist_revisiones (creado_en desc);
create index if not exists jornadas_inicio_idx on public.jornadas (inicio desc);
create index if not exists jornadas_fin_idx on public.jornadas (fin desc);
create index if not exists servicios_incidencia_no_vista_idx on public.servicios (fecha_hora_recogida) where not incidencia_vista and not es_prueba;
create index if not exists incidencias_servicio_idx on public.incidencias (servicio_id);
create index if not exists alertas_horario_conductor_idx on public.alertas_horario (conductor_id);
