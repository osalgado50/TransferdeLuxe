-- Marca las posiciones que inserta el simulador de la demo (aditiva). Así no cuentan para los km de los recorridos ni
-- para las anomalías de CARGA/DESCARGA; las reales (apps) no envían el campo y quedan en false.
alter table public.posiciones add column if not exists simulada boolean not null default false;
