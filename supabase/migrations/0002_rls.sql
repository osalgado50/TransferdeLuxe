create or replace function es_operador() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from perfiles where id = auth.uid() and rol = 'operador') $$;

alter table vehiculos enable row level security;
alter table perfiles enable row level security;
alter table servicios enable row level security;
alter table eventos_servicio enable row level security;
alter table posiciones enable row level security;
alter table posicion_actual enable row level security;
alter table tickets_combustible enable row level security;
alter table lugares_frecuentes enable row level security;
alter table ajustes enable row level security;
alter table acciones_procesadas enable row level security;

-- Lectura: operador todo; conductor lo suyo. Escrituras de negocio: solo service role (Server Actions).
create policy leer_vehiculos on vehiculos for select to authenticated using (true);
create policy leer_perfiles on perfiles for select to authenticated using (es_operador() or id = auth.uid());
create policy leer_servicios on servicios for select to authenticated using (es_operador() or conductor_id = auth.uid());
create policy leer_eventos on eventos_servicio for select to authenticated
  using (es_operador() or exists (select 1 from servicios s where s.id = servicio_id and s.conductor_id = auth.uid()));
create policy leer_posicion_actual on posicion_actual for select to authenticated using (es_operador() or conductor_id = auth.uid());
create policy leer_posiciones on posiciones for select to authenticated using (es_operador() or conductor_id = auth.uid());
create policy leer_tickets on tickets_combustible for select to authenticated using (es_operador() or conductor_id = auth.uid());
create policy leer_lugares on lugares_frecuentes for select using (true);
create policy leer_ajustes on ajustes for select to authenticated using (true);

-- El conductor escribe su propia posición directamente (baja latencia).
create policy insertar_posicion on posiciones for insert to authenticated with check (conductor_id = auth.uid());

create policy leer_fotos_tickets on storage.objects for select to authenticated
  using (bucket_id = 'tickets' and (es_operador() or (storage.foldername(name))[1] = auth.uid()::text));
