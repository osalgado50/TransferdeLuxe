-- Conductores dados de baja (aditiva): quien tiene historial no se borra (el registro de jornada se conserva 4 años y
-- servicios, tickets y eventos lo referencian); pasa a rol «baja»: no entra en la app, no sale en listas ni
-- asignaciones y su historial sigue con su nombre. Se puede reactivar.
alter type public.rol_usuario add value if not exists 'baja';
alter table public.perfiles add column if not exists baja_en timestamptz;
