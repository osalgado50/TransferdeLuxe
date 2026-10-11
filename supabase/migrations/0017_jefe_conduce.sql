-- Jefe multitarea: un operador puede conducir (perfiles.conduce) y la central recibe push (vigilante_push). Solo aditiva.
-- RLS revisada: posiciones, posicion_actual, servicios, jornadas, incidencias, checklist, tickets, dispositivos_push y
-- storage ya filtran por conductor_id = auth.uid() (o carpeta = auth.uid()) y el operador ve todo con es_operador():
-- no filtran por rol = 'conductor', así que un operador con conduce = true ya puede operar sobre lo suyo.
alter table perfiles add column if not exists conduce boolean not null default false;

-- Cursor del vigilante de push a la central (una sola fila; solo service role).
create table if not exists vigilante_push (
  id int primary key default 1 check (id = 1),
  ultimo_evento_id bigint not null default 0,
  ultima_incidencia_en timestamptz not null default now(),
  ultima_revision_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table vigilante_push enable row level security; -- sin políticas: solo service role
insert into vigilante_push (id, ultimo_evento_id)
  values (1, coalesce((select max(id) from eventos_servicio), 0)) on conflict (id) do nothing;

-- Demo: la cuenta de la central también conduce (único perfil afectado).
update perfiles set conduce = true
  where id = (select id from auth.users where email = 'central@transferdeluxe.test') and rol = 'operador';
