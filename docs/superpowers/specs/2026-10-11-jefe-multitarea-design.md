# Jefe multitarea: central en el móvil + operador que también conduce · Diseño

Fecha: 11/10/2026 · Aprobado por el responsable (opción A): «la central de la oficina no hay nadie para dirigir y lo
hace todo el jefe desde su coche a la vez que tiene servicios de clientes que hacer».

## Decisiones
1. **Rol combinado**: `perfiles.conduce boolean default false` (migración 0017). Un operador con `conduce = true` cuenta
   como conductor en todas las listas (sugerencia, mapa, hoja de ruta, informes, jornadas), puede tener vehículo
   habitual y GPS, y ejecutar las acciones de conductor sobre los servicios que tenga asignados. Casilla «También
   conduce» en Flota y ajustes para usuarios operador. La seguridad de las acciones de conductor sigue siendo
   «el servicio está asignado a quien la ejecuta».
2. **Push a la central**: un vigilante en el servidor Next (instrumentation, cada ~20 s, un solo proceso en Hostinger)
   lee eventos nuevos (`eventos_servicio`: reserva nueva/creado web, rechazado, expirado; `incidencias`;
   `checklist_revisiones` con fallos) posteriores a un cursor persistido y envía push a los dispositivos de todos los
   operadores (`dispositivos_push` sirve para cualquier usuario). Sin duplicados (cursor) y nunca rompe nada.
3. **Modo central en la app nativa**: si el usuario es operador, pestañas Central (alertas + mapa de flota en vivo),
   Servicios (pendientes y de hoy; asignar/reasignar con la sugerencia existente; llamar), Mis servicios (solo si
   `conduce`, con interruptor GPS) y Más (abre la central web). Escrituras vía rutas API Bearer que reutilizan la
   lógica de las Server Actions de la central.
4. Demo: «Central Demo» con `conduce = true`. Migraciones aditivas; sin seed ni reinicios.
