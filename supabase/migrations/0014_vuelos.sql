-- Módulo «Seguimiento de vuelos»: hora real de llegada del vuelo y margen para recoger el equipaje.
alter table servicios add column if not exists hora_llegada_real timestamptz;
alter table ajustes add column if not exists margen_equipaje_min int not null default 20
  check (margen_equipaje_min between 0 and 180);
