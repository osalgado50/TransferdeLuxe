-- Capacidad de equipaje por vehículo (validación de capacidad).
-- Nota: los vehículos existentes se resembraron con valores explícitos; ver 0006_maletas_backfill.sql.
alter table public.vehiculos
  add column if not exists maletas int not null default 4 check (maletas between 0 and 30);
