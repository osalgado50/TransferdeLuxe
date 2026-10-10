# TransferdeLuxe — Documentación técnica

> Borrador en Markdown. Al final se pasa a **un único Google Doc** (entregable 1).
> El historial de prompts NO va aquí: va en otro Google Doc.

## 1. Descripción del proyecto
TransferdeLuxe es el **centro de control de una empresa de traslados VTC de Salou** (Costa Dorada) con 3 vehículos
propios (2 de 8 plazas y 1 de 7) y 3 conductores. Hoy los pedidos llegan por un formulario web y por teléfono y se
reparten a mano. La aplicación cubre todo el ciclo:

1. **Reserva pública** (`/reservar`): el cliente pide su traslado (ida y vuelta opcional) con los mismos campos que
   el formulario de la web de referencia; las direcciones se autocompletan con lugares frecuentes y OpenStreetMap.
2. **Centro de control** (`/central`): mapa en tiempo real de la flota, alertas (reservas nuevas, rechazos, plazos
   vencidos, grupos de más de 8 que hay que subcontratar), asignación con sugerencia de conductor, hoja de ruta por
   arrastre, flota y ajustes, y panel de gasto en combustible.
3. **App del conductor** (`/conductor`, PWA instalable): hoja del día y próximos días, GPS, aceptar o rechazar
   servicios con cuenta atrás, botones de en camino / CARGA / DESCARGA que funcionan sin cobertura, y lectura del
   ticket de combustible con OCR en el propio móvil.

Todo con datos de demostración inventados (cuentas `@transferdeluxe.test`, matrículas imposibles, clientes ficticios).

**Acceso para el jurado**:
- URL: https://app.transfersvipluxe.com (central: `/central`, conductor en el móvil: `/conductor`, reserva pública: `/reservar`)
- Cuentas: `central@transferdeluxe.test` (central) y `conductor1@…`, `conductor2@…`, `conductor3@transferdeluxe.test`
  (conductores). La contraseña de prueba aparece en la propia pantalla de acceso.
- Repositorio: https://github.com/osalgado50/TransferdeLuxe
- Botones de demo en el panel: «Simular ruta» (mueve los coches) y «Restablecer demo» (vuelve al estado inicial).

## 2. Plataforma utilizada
Claude Code (agente de codificación en terminal / app de escritorio), modelo Claude Opus 5.5.

## 3. Arquitectura
```
Navegador (central)    Móvil del conductor (PWA)    Navegador (cliente)
        │                       │  OCR Tesseract.js         │
        └────────── Next.js 15 (App Router) en Hostinger ───┘
           /central            /conductor            /reservar
           Server Actions y rutas API: validación zod, máquina de estados,
           sugerencia de conductor, idempotencia, subida de fotos
                         │
           Supabase (Postgres + RLS, Auth, Realtime, Storage privado, pg_cron)
```
- **Un único proyecto Next.js** (TypeScript, Tailwind 4) con tres zonas por rol. Las escrituras de negocio pasan por
  Server Actions que validan con la máquina de estados y escriben con la clave de servicio (solo en servidor); las
  lecturas y el tiempo real usan el cliente con **RLS** (cada conductor solo ve lo suyo).
- **Dominio puro y testeado** (`src/lib/dominio`): estados del servicio, sugerencia de conductor (solapes, plazas,
  taller, cercanía por GPS o por el servicio anterior), geografía, combustible (gasto y L/100 km), plazos.
- **Tiempo real**: Supabase Realtime sobre `servicios`, `eventos_servicio` y `posicion_actual`, con reconexión y
  recarga si se pierde la conexión.
- **Plazo de respuesta**: `pg_cron` cada minuto devuelve a la central los servicios no aceptados a tiempo.
- **Sin cobertura**: cola local por conductor; cada pulsación lleva un `idAccion` y el servidor ignora duplicados.
- **Tickets**: OCR gratuito en el navegador (Tesseract.js) + reglas de extracción; la foto va a un bucket privado.
- **Mapas**: Leaflet + OpenStreetMap; geocodificación con Nominatim y lugares frecuentes.
- **Despliegue**: Hostinger Cloud Startup (Node.js Web App importada de GitHub, redespliegue en cada push) y
  GitHub Actions que reinicia la demo cada madrugada (y mantiene activo Supabase).
- **Calidad**: 70 tests unitarios (Vitest) y 2 tests de punta a punta (Playwright) del flujo completo y del rechazo.
- Documentos de diseño: `docs/superpowers/specs/` (especificación) y `docs/superpowers/plans/` (plan de 22 tareas).

## 4. Casos de uso
1. **Reserva web con vuelta**: el cliente reserva Aeropuerto de Reus → PortAventura y la vuelta; se crean dos
   servicios enlazados y salta una alerta en la central.
2. **Alta telefónica**: el operador crea el servicio desde «Nuevo servicio».
3. **Asignar con sugerencia**: la central ve los conductores ordenados (libre, plazas, distancia) y asigna el
   recomendado; el conductor recibe la tarjeta con sonido y cuenta atrás.
4. **Rechazo**: el conductor rechaza por «Avería»; el servicio vuelve a pendiente y la central ve «Rechazado por
   Laia Demo: Avería» para reasignarlo.
5. **Plazo vencido**: si nadie responde en 15 min (configurable), vuelve solo a la central con alerta.
6. **Ejecución del servicio**: en camino → CARGA → DESCARGA; si no hay cobertura, se envía al recuperarla.
7. **Seguimiento en vivo**: la central ve los coches moverse y su estado (libre, en camino, con pasajeros, sin señal).
8. **Grupo grande**: una reserva de 12 personas se marca para subcontratar un autobús.
9. **Ticket de combustible**: foto → datos leídos en el móvil → revisión → la central ve gasto y consumo por vehículo.
10. **Planificación del día**: hoja de ruta por conductor, reasignando servicios por arrastre.
11. **Taller**: un vehículo en taller hace que su conductor deje de sugerirse.
12. **Validación de capacidad**: el formulario avisa si el tipo de vehículo no cabe con los pasajeros y maletas y sugiere el mínimo; si ningún vehículo propio cabe, la reserva se marca para subcontratar con el motivo.
13. **Agenda de servicios**: la central abre «Esta semana», navega con ◀ ▶ entre semanas o meses, ve los servicios agrupados por día con los contadores del periodo y filtra por estado, conductor u origen.
14. **Favoritos**: el operador guarda «Aeropuerto de Reus» o el trayecto Reus → Salou (4 pax, MiniVan) y lo reutiliza en un clic al dar de alta un servicio telefónico.
15. **Calendario de servicios**: la central alterna «Lista | Calendario», ve los servicios sobre una rejilla horaria (día/semana) o por chips (mes) coloreados por estado, y abre la ficha con un clic.

## 5. Proceso iterativo con la IA
- **09/10/2026**: preparación del entorno. Repo nuevo, reglas de las bases en `CLAUDE.md` para que el
  agente las respete, hook que registra cada prompt y script que exporta las transcripciones.
- **09/10/2026**: diseño con la IA (brainstorming guiado, una pregunta cada vez). Se analiza el formulario de la
  web de referencia y se decide: reserva pública + alta manual, PWA para el conductor, asignación manual con
  sugerencia, lectura de tickets con Claude Haiku 5.5, stack Next.js + Supabase + OpenStreetMap, desplegado en Hostinger Cloud (Node.js Web App) con dominio propio.
  Resultado: `docs/superpowers/specs/2026-10-09-centro-control-design.md`.
- **09/10/2026**: fase 1, lógica de dominio con TDD (test que falla, implementación mínima, test en verde).
  La IA escribe primero los tests y después el código de: máquina de estados del servicio con permisos por rol,
  distancias, duración estimada y sugerencia de conductor, cálculos de gasto y consumo de combustible, y lector
  de tickets (interfaz `LectorTicket` + implementación con Claude Haiku 5.5, validación con zod y comprobación
  de coherencia litros x precio = importe).
- **09–10/10/2026**: fases 2 y 3. Base de datos en Supabase (tablas, RLS, `pg_cron`), login por rol, acciones de
  servicio validadas e idempotentes y página pública de reserva con ida/vuelta, geocodificación y anti-spam.
- **10/10/2026**: cambio de requisito del responsable: **nada de APIs de pago**. El lector de tickets pasa de
  Claude Haiku a OCR local con Tesseract.js (nueva tarea 6b) sin tocar el resto gracias a la interfaz `LectorTicket`.
- **10/10/2026**: fase 4, centro de control. La IA construye la central: listado de servicios con filtros, ficha
  del servicio y alta manual; asignación con sugerencia de conductor (disponibilidad, plazas, vehículo en taller);
  panel en vivo con Supabase Realtime (posiciones, estados e incidencias); hoja de ruta diaria con reasignación
  por arrastre; y gestión de flota, conductores y ajustes (plazo de respuesta y umbral sin señal), con validación
  zod en las acciones de servidor.
- **10/10/2026**: fase 5, app del conductor. La IA construye la PWA (instalable, service worker y navegación
  móvil), el GPS con envío de posición, aceptar/rechazar un servicio con plazo de respuesta, el servicio en curso
  (en camino, carga y descarga) con cola de acciones para tramos sin cobertura, el ticket de combustible leído con
  OCR local en el navegador y, al final, el historial de 7 días del conductor y el panel de combustible de la
  central (KPI, gráfico de gasto por mes y tabla con miniaturas firmadas).

- **10/10/2026**: forma de trabajo. Cada tarea del plan la implementa un subagente de Claude Code y la revisa otro
  subagente (cumplimiento de la especificación y calidad); los fallos vuelven al implementador en rondas de
  corrección hasta quedar limpios. El agente principal prueba además cada pantalla en el navegador con datos de demo.
  Al final, una revisión completa con el modelo más capaz detecta riesgos para la semana de evaluación (datos de demo
  que envejecen, pausa de Supabase, borrado de usuarios de prueba) y se corrigen: reinicio diario de la demo por
  `/api/demo/reset` con secreto, fotos de demo embebidas y migraciones idempotentes.

- **10/10/2026**: validación de capacidad pedida por el responsable. Cada vehículo tiene ahora capacidad de maletas
  (migración `0005_maletas.sql`, editable en Flota). Módulo puro `capacidad.ts` (tipos genéricos, tipo mínimo,
  vehículos aptos) con TDD; aviso en vivo en el formulario con botón «Usar MiniVan», validación equivalente en el
  servidor (zod), subcontratación por «ningún vehículo propio cabe» con motivo en la alerta, y las maletas entran
  en la sugerencia de conductores.
- **10/10/2026**: agenda de servicios. El listado de servicios pasa a ser una agenda con atajos (hoy, mañana, pasado
  mañana, semana, mes), vistas día/semana/mes con navegación y selector de fecha en la URL, servicios agrupados por
  día, contadores del periodo y paginación. Helpers puros en `periodo.ts` con TDD, incluida la semana del cambio de
  hora del 26/10/2026.
- **10/10/2026**: favoritos del operador. Migración `0007_favoritos.sql` (tabla con RLS solo para operadores),
  módulo puro `favoritos.ts` con TDD, acciones de servidor, ⭐ «Guardar en favoritos» junto a cada dirección de
  «Nuevo servicio», direcciones favoritas primero en las sugerencias, selector «Trayectos favoritos» que rellena
  origen, destino, pasajeros, maletas y vehículo, y gestión (renombrar/borrar) en Flota. No aparece en la reserva pública.
- **10/10/2026**: vista de calendario en la agenda (`&modo=calendario`) junto a la lista: rejilla horaria día/semana
  (06:00–24:00, madrugada aparte, solapes en columnas) y mes con chips y «+N más». Helpers puros en `calendario.ts`
  con TDD (solapes, hora de Madrid con cambio de hora, meses de 28 a 42 celdas).

## 6. Challenges y soluciones
- **OCR de tickets: ¿OCR clásico o IA?** Se comparan OCR.space (25.000 peticiones/mes gratis, pero solo texto
  plano), Mindee, Tabscanner, Azure y Google Document AI. Se elige Claude Haiku 5.5 porque devuelve los datos ya
  estructurados y aguanta formatos de ticket distintos, a ~0,0003 $ por ticket. El lector queda detrás de una
  interfaz para poder cambiar de proveedor.
- **GPS en una PWA**: el navegador no envía la ubicación en segundo plano (sobre todo en iPhone). Se acepta para
  el hackathon (la app se usa abierta durante el servicio) y se añade un simulador de ruta para la demo.
- **Pedidos de más de 8 pasajeros**: la flota propia es de 7–8 plazas; se marcan como «subcontratar».
- **Lector de tickets sin APIs de pago**: se sustituyó la lectura con Claude Haiku por OCR local gratuito (Tesseract.js en el navegador + reglas de extracción en `lector/extraer.ts`), porque el responsable no admite conexiones a APIs de pago. Claude Haiku queda como alternativa desactivada.
- **Realtime no entregaba eventos**: el canal se suscribía antes de que el JWT del usuario llegara al socket, así
  que las políticas RLS descartaban los eventos. Solución: `getSession` + `realtime.setAuth` antes de suscribir.
- **Service worker de otro proyecto en localhost**: servía bundles viejos y el panel parecía no actualizarse.
  Solución: dar de baja el service worker y limpiar la caché del origen en desarrollo.
- **Cola sin cobertura con carreras e idempotencia**: las acciones guardadas offline podían duplicarse o
  pisarse al reintentar. Solución: cola por conductor, clave de asignación normalizada, acciones idempotentes
  (tabla `acciones_procesadas`), reversión local si el servidor rechaza y drenaje global al volver la conexión.
- **Tarjeta a pantalla completa que podía bloquear al conductor**: la tarjeta de servicio nuevo tapaba toda la
  app si algo fallaba. Se rediseñó para poder cerrarse y responder siempre, sin dejar la interfaz inutilizable.
- **Validación de rutas de fotos**: el ticket recibía `foto_path` del cliente. Se valida que la ruta pertenezca
  al conductor y al bucket privado `tickets`; las miniaturas de la central usan URL firmadas de 1 hora.

- **Contadores de la agenda truncados**: contar filas en JS se topaba con el máximo de 1000 filas de Supabase y ocultaba errores. Ahora cada tarjeta usa un `count` exacto (head) y, si falla, muestra «—» con un aviso.
- **La demo envejece durante la evaluación**: los datos se crean relativos a «hoy», así que se añade un reinicio
  diario automático protegido con secreto, que además mantiene activo el plan gratuito de Supabase.
- **Revisiones que encontraban fallos reales**: carreras en la cola offline, pulsaciones duplicadas, fechas
  imposibles, enlaces ida/vuelta sin comprobar errores, rutas de foto de otro conductor, límite de reservas por IP
  falsificable… Todos se corrigieron con tests que los reproducen.

## 7. Capturas
Ver `docs/capturas/` (login, panel en vivo, servicios, hoja de ruta, ficha y asignación con sugerencia).
Pendientes: capturas de la app del conductor en el móvil.
