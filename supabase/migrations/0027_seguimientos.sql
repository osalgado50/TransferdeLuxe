-- Página pública de seguimiento del traslado (/s/<token>) para el cliente: un token aleatorio largo por servicio,
-- creado al aceptar o con el primer aviso al cliente. Sin políticas RLS: solo el servidor (service role) lo lee y
-- escribe; la página pública nunca consulta la tabla directamente. La validez (desde aceptado hasta 30 min después
-- de completar/cancelar) se calcula con el estado y los eventos del servicio; `caduca_en` queda como tope opcional.
create table if not exists public.seguimientos (
  servicio_id uuid primary key references public.servicios on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  creado_en timestamptz not null default now(),
  caduca_en timestamptz
);
alter table public.seguimientos enable row level security;
revoke all on public.seguimientos from anon, authenticated;

