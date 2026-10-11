-- Las jornadas y pausas se escriben solo por las rutas del servidor (que comprueban el módulo):
-- el conductor no puede insertarlas directamente con la clave anónima ni falsear la hora de inicio.
drop policy if exists crear_jornadas on jornadas;
drop policy if exists crear_pausas on pausas;
