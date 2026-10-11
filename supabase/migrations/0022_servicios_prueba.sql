-- Servicios creados por las pruebas automáticas: se conservan pero no salen en listados, informes ni actividad.
alter table servicios add column if not exists es_prueba boolean not null default false;
update servicios set es_prueba = true where notas like 'PRUEBA AUTOMÁTICA%' and es_prueba = false;
create index if not exists servicios_es_prueba_idx on servicios (es_prueba) where es_prueba;
