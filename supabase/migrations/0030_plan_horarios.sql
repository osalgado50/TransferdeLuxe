-- Planificación de horarios por fechas (semanas, meses o todo el año): cada día planificado es una fila de
-- excepciones_horario con tipo = 'plan' y, opcionalmente, el vehículo del turno de ese día. Manda sobre la semana tipo.
-- Los «cambios de un día» de siempre quedan como tipo = 'cambio' (valor por defecto: las filas que ya había lo son).
-- Todo aditivo: sin filas de plan, cada día sigue saliendo de la semana tipo (o sin horario = disponible todo el día).
alter table public.excepciones_horario add column if not exists vehiculo_id uuid references public.vehiculos on delete set null;
alter table public.excepciones_horario add column if not exists tipo text not null default 'cambio';
do $$ begin
  alter table public.excepciones_horario add constraint excepciones_horario_tipo check (tipo in ('cambio', 'plan'));
exception when duplicate_object then null; end $$;
-- Las consultas van por rango de fechas (vista de mes, vigilante, asignación).
create index if not exists excepciones_horario_fecha_idx on public.excepciones_horario (fecha);
