-- Tokens de notificaciones push (Expo) de la app nativa del conductor.
create table if not exists dispositivos_push (
  token text primary key,
  conductor_id uuid not null references perfiles(id) on delete cascade,
  plataforma text not null check (plataforma in ('ios', 'android')),
  actualizado_en timestamptz not null default now()
);
create index if not exists dispositivos_push_conductor_idx on dispositivos_push (conductor_id);
alter table dispositivos_push enable row level security;
create policy push_leer on dispositivos_push for select to authenticated using (es_operador() or conductor_id = auth.uid());
create policy push_insertar on dispositivos_push for insert to authenticated with check (conductor_id = auth.uid());
create policy push_actualizar on dispositivos_push for update to authenticated using (conductor_id = auth.uid()) with check (conductor_id = auth.uid());
create policy push_borrar on dispositivos_push for delete to authenticated using (conductor_id = auth.uid());
