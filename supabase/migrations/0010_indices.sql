-- Índices para consultas frecuentes y tabla de tickets push pendientes de recibo (solo aditivo).
create index if not exists eventos_servicio_servicio_creado_idx on eventos_servicio (servicio_id, creado_en);
create index if not exists servicios_estado_idx on servicios (estado);
create index if not exists tickets_combustible_conductor_idx on tickets_combustible (conductor_id);

-- Tickets devueltos por Expo al enviar; un cron consulta sus recibos y limpia tokens DeviceNotRegistered.
create table if not exists push_tickets (
  ticket_id text primary key,
  token text not null,
  creado_en timestamptz not null default now()
);
create index if not exists push_tickets_creado_en_idx on push_tickets (creado_en);
alter table push_tickets enable row level security; -- sin políticas: solo service role
