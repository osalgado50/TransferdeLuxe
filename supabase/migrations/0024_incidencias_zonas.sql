-- Incidencias con parte de golpes: zonas dañadas del diagrama del coche (mismos ids que la hoja de cierre, validados en
-- el servidor contra IDS_ZONAS) y nuevo tipo «golpe» (daño en el vehículo; grave, como accidente y avería). Solo aditivo:
-- la columna tiene valor por defecto (las apps antiguas no la envían) y el check de tipo se AMPLÍA (admite lo de antes).
alter table incidencias add column if not exists zonas text[] not null default '{}';
alter table incidencias drop constraint if exists incidencias_zonas_check;
alter table incidencias add constraint incidencias_zonas_check check (cardinality(zonas) <= 60);

alter table incidencias drop constraint if exists incidencias_tipo_check;
alter table incidencias add constraint incidencias_tipo_check
  check (tipo in ('averia','accidente','golpe','no_presentado','retraso','otro'));

-- Precarga de la hoja de cierre: incidencias de hoy de un conductor.
create index if not exists incidencias_conductor_creado_idx on incidencias (conductor_id, creado_en desc);
