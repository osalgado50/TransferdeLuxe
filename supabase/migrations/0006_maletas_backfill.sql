-- Los vehículos existentes tomaron el valor por defecto (4); se ajusta al de sus plazas. Idempotente.
update public.vehiculos set maletas = least(plazas, 30) where maletas = 4 and plazas > 4;
