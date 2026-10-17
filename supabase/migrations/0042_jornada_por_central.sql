-- La central puede empezar y terminar la jornada de un conductor (p. ej. se olvidó de cerrarla). Para el registro
-- horario (art. 34.9 ET) queda quién lo hizo: null = el propio conductor. Aditiva: las filas existentes no cambian.
alter table public.jornadas add column if not exists inicio_por uuid references public.perfiles(id) on delete set null;
alter table public.jornadas add column if not exists fin_por uuid references public.perfiles(id) on delete set null;
