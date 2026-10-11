-- Módulos opcionales que la central activa o desactiva (Flota y ajustes → Módulos). Ausente = activo.
alter table ajustes add column if not exists modulos jsonb not null default '{}'::jsonb;
