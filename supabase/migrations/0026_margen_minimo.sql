-- Asignación automática: margen mínimo (min) entre la llegada estimada a una recogida y su hora, contando desde el fin
-- del servicio anterior del conductor. Lo usan la propuesta automática y el semáforo de la hoja de ruta. Aditiva.
alter table ajustes add column if not exists margen_minimo_min int not null default 15
  check (margen_minimo_min between 0 and 120);
