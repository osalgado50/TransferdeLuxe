-- Capacidad de equipaje por vehículo (validación de capacidad).
alter table public.vehiculos
  add column if not exists maletas int not null default 4 check (maletas between 0 and 30);
