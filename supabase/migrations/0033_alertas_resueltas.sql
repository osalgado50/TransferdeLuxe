-- Alertas de horario que se cierran solas (informe de estrés n.º 5 y n.º 17). Migración ADITIVA.
-- resuelta_en: el vigilante la rellena cuando la situación termina (inicia la jornada, acaba el tramo, ausencia,
-- queda libre o cierra la jornada…). La central solo muestra como aviso las que siguen sin resolver y el texto deja
-- de contar minutos en ese instante.
alter table public.alertas_horario add column if not exists resuelta_en timestamptz;

-- Nuevo tipo «jornada_larga»: jornada abierta más de 14 h (¿se olvidó de cerrarla?). Una por jornada (clave = id).
-- Solo amplía los valores admitidos: las filas existentes siguen siendo válidas.
alter table public.alertas_horario drop constraint if exists alertas_horario_tipo_check;
alter table public.alertas_horario add constraint alertas_horario_tipo_check
  check (tipo in ('fuera_horario', 'sin_jornada', 'fin_turno', 'jornada_larga'));

-- El vigilante repasa las abiertas en cada pasada.
create index if not exists alertas_horario_abiertas_idx on public.alertas_horario (creado_en) where resuelta_en is null;
