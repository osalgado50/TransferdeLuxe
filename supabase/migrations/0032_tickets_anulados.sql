-- Tickets de combustible anulados por la central (mal leídos, de prueba, duplicados…). Nada se borra: el ticket y su
-- foto se quedan, pero dejan de contar en Combustible, Informes, consumo, km del vehículo e historial del conductor.
-- Aditiva: los tickets que ya había quedan como no anulados.
alter table public.tickets_combustible add column if not exists anulado boolean not null default false;
alter table public.tickets_combustible add column if not exists anulado_en timestamptz;
alter table public.tickets_combustible add column if not exists anulado_motivo text check (anulado_motivo is null or char_length(anulado_motivo) <= 200);

-- Consultas habituales: tickets válidos de un vehículo por fecha (consumo, km mínimo, aviso de duplicado).
create index if not exists tickets_combustible_vehiculo_fecha_idx on public.tickets_combustible (vehiculo_id, fecha desc) where not anulado;
create index if not exists tickets_combustible_fecha_idx on public.tickets_combustible (fecha desc);
