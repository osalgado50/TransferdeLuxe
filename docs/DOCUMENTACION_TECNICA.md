# TransferdeLuxe — Documentación técnica

Hackathon de Vibe Coding · Máster en Inteligencia Artificial (Big School), edición 7. Desarrollado del 9 al 19 de
octubre de 2026 íntegramente con Claude Code. El historial de prompts va en su propio documento.

## 1. Descripción del proyecto
TransferdeLuxe es una **empresa ficticia de traslados privados de la Costa Dorada** (Salou, Cambrils, Tarragona,
aeropuertos de Reus y Barcelona). Recibía las reservas por teléfono y formularios y coordinaba a sus conductores a mano.
El proyecto cubre todo el ciclo con tres piezas:

1. **Web de reservas** (`/`, en castellano, catalán e inglés): reserva en un minuto con botones grandes, destinos
   frecuentes, dirección por GPS («Usar mi ubicación») o dictada por voz, vehículo elegido según pasajeros y maletas,
   mínimo media hora de antelación y comprobación de que hay algún conductor libre (si no, WhatsApp o llamada a la
   central). Formulario completo en `/reservar` (ida y vuelta, vehículo concreto, vuelo).
2. **Centro de control** (`/central`): panel en vivo con el mapa de la flota y las alertas, agenda y hoja de ruta,
   asignación con sugerencia y **asignación automática** (turnos, pausas, plazas, maletas, distancias y márgenes),
   horarios por semanas y meses (también nocturnos), ausencias, jornadas, combustible con tickets leídos por OCR,
   mantenimiento, checklists, incidencias, informes e historial de viajes con el recorrido GPS.
3. **App del conductor «TDL Conductor»** (Android/iOS, Expo; también versión web en `/conductor`): aceptar o rechazar
   con cuenta atrás, en camino / carga / descarga con un botón (funciona sin cobertura), GPS en segundo plano,
   navegación con el mapa en el sentido de la marcha y zoom en los cruces, avisos al cliente por WhatsApp con enlace de
   seguimiento en directo, ticket de combustible por foto, jornada y devolver servicios a la central.

Todos los datos son de demostración: marca, clientes, conductores y matrículas inventados (cuentas `@transferdeluxe.test`);
los textos legales son una plantilla con un titular ficticio.

**Acceso para el jurado**:
- URL: https://app.transfersvipluxe.com (web de reservas: `/`; central: `/central`; conductor: `/conductor`)
- Cuentas: `central@transferdeluxe.test` (central) y `conductor1@…`, `conductor2@…`, `conductor3@transferdeluxe.test`
  (conductores). La contraseña de prueba aparece en la propia pantalla de acceso.
- Repositorio: https://github.com/osalgado50/TransferdeLuxe
- En el panel en vivo, una **guía rápida** explica qué probar; «✨ Cargar datos de demo» llena el día con servicios en
  todos los estados y los conductores de demo trabajan solos (aceptan, salen, recogen y terminan por carretera).

## 2. Plataforma utilizada
**Claude Code** (agente de codificación, en la app de escritorio), modelo Claude Opus 5.5, para todo el código, los
tests, la documentación y los despliegues. No se ha usado ninguna otra plataforma de desarrollo con IA. Servicios de
alojamiento y despliegue (permitidos por las bases): Hostinger (web), Supabase (base de datos, autenticación,
almacenamiento y tiempo real), Expo/EAS (compilación y actualizaciones de la app) y servicios gratuitos de
OpenStreetMap (mapas, direcciones y rutas). Para probar el OCR desde el móvil, el responsable fotografió tickets de
prueba, uno de ellos una imagen de ticket ficticia creada con un generador de imágenes; ese generador no produjo
código ni ninguna parte de la aplicación.

## 3. Arquitectura
```
Navegador (central)   App TDL Conductor (Expo) / PWA   Navegador (cliente)
        │                       │                          │
        └────────── Next.js 15 (App Router) en Hostinger ───┘
           /central       /conductor + /api/conductor     /  y  /reservar
           vigilante (avisos push, alertas, demo viva)   OCR de tickets (Tesseract)
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
- **Plazo de respuesta**: `pg_cron` cada minuto marca los servicios no aceptados a tiempo y avisa a la central; el conductor aún puede aceptarlos mientras no se reasignen.
- **Sin cobertura**: cola local por conductor; cada pulsación lleva un `idAccion` y el servidor ignora duplicados.
- **Tickets**: OCR gratuito (Tesseract) en el servidor con preprocesado de imagen y varias pasadas, más reglas de
  extracción (importe, litros, precio, CIF con dígito de control, factura) y comprobación del precio con el del
  Ministerio; la foto va a un bucket privado.
- **Reservas**: castellano, catalán e inglés; dictado por voz (Web Speech API del navegador), «Usar mi ubicación»
  (Nominatim reverse), antelación mínima y comprobación de conductor libre con el mismo motor que la asignación.
- **Demo viva** (`src/lib/demo`): datos de demostración en todos los estados, renovación automática, conductores de
  demo que aceptan, salen, recogen y terminan, y coches que circulan por rutas de OpenStreetMap precalculadas.
- **Mapas**: Leaflet + OpenStreetMap; búsqueda de direcciones con Photon y Nominatim en paralelo (consulta limpiada, localidad detectada, número aproximado), lugares de la empresa, favoritos y lugares frecuentes (Google Places preparado, apagado sin clave).
- **Despliegue**: Hostinger Cloud Startup (Node.js Web App importada de GitHub, redespliegue en cada push) y
  GitHub Actions diario que mantiene activo Supabase y limpia tokens push caducados (sin reiniciar datos).
- **App nativa TDL Conductor** (`movil/`, Expo SDK 57): GPS en segundo plano con cola sin pérdidas, notificaciones push,
  mapa MapLibre + OSM «rumbo arriba» con zoom en los cruces y pantalla completa, avisos de proximidad, ticket con
  cámara y modo central. Android (APK) e iOS (TestFlight) con EAS; cambios de JavaScript por actualizaciones en el
  aire (EAS Update) comprobando antes la huella nativa.
- **Módulos activables** desde la central: jornada laboral, incidencias, checklist del vehículo, mantenimiento,
  informes y seguimiento de vuelos.
- **Seguridad y legal**: RLS en todas las tablas, cabeceras HTTP, validación y purga de posiciones (30 días),
  páginas `/privacidad` y `/aviso-legal`. Auditoría completa en `docs/INFORME_AUDITORIA.md`.
- **Calidad**: 840 tests unitarios (Vitest), pruebas de punta a punta (Playwright), auditoría técnica, pruebas de
  estrés de la central (`docs/INFORME_ESTRES_CENTRAL.md`) y dependencias sin vulnerabilidades (`npm audit`).
- Documentos de diseño: `docs/superpowers/specs/` (especificación) y `docs/superpowers/plans/` (plan de 22 tareas).

## 4. Casos de uso
1. **Reserva web con vuelta**: el cliente reserva Aeropuerto de Reus → PortAventura y la vuelta; se crean dos
   servicios enlazados y salta una alerta en la central.
2. **Alta telefónica**: el operador crea el servicio desde «Nuevo servicio».
3. **Asignar con sugerencia**: la central ve los conductores ordenados (libre, plazas, distancia) y asigna el
   recomendado; el conductor recibe la tarjeta con sonido y cuenta atrás.
4. **Rechazo**: el conductor rechaza por «Avería»; el servicio vuelve a pendiente y la central ve «Rechazado por
   Laia Demo: Avería» para reasignarlo.
5. **Plazo vencido**: si el conductor no responde en 15 min (configurable), la central recibe la alerta «Sin respuesta» y puede reasignarlo; mientras tanto el conductor aún puede aceptarlo.
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
16. **Navegación del conductor**: con el servicio aceptado, en camino o con pasajeros, el conductor ve en la app su posición, la ruta por carretera hasta la recogida o el destino y «Hacia la recogida · 4,2 km · 7 min»; a 500 m suena un aviso «Estás llegando…», la central ve «Llegando» y, al llegar (100 m), se resalta el botón CARGA/DESCARGA.
17. **Planificación con tiempos**: en la hoja de ruta cada servicio muestra «13:00 → 13:45 · 45 min» y, entre dos servicios del mismo conductor, una franja «🚗 Barcelona T1 → Tarragona · 1 h 10 min · llega 15:20 · 40 min de margen» (verde/ámbar/roja). Al arrastrar un servicio a un conductor que no llegaría a tiempo se pide confirmación con el motivo; los servicios sin asignar proponen «💡 Mejor: …» con botón «Asignar».
18. **Jornada laboral**: el conductor inicia la jornada, hace pausas y la finaliza; la central consulta y exporta a CSV el registro horario por conductor y día.
19. **Incidencia con foto**: una avería en ruta se notifica con foto y posición; aparece al momento en las alertas de la central, que la marca como resuelta.
20. **Checklist del vehículo**: al empezar la jornada el conductor revisa el vehículo; un punto «mal» genera aviso en la central. Los puntos se editan desde la central.
21. **Mantenimiento e informes**: semáforo de ITV, seguro y revisiones por vehículo; informe mensual de servicios, km y consumo con export CSV.
22. **Vuelo retrasado**: el operador anota la hora real de llegada y la app propone mover la recogida; el conductor recibe un aviso push.
23. **Módulos**: en Flota y ajustes la empresa activa o desactiva cada módulo y desaparece de la central y de la app.
24. **Reserva desde el móvil en otro idioma**: un turista en inglés toca «Use my location», dicta el destino y reserva;
    si a esa hora no hay ningún coche libre, la web se lo dice y le ofrece WhatsApp o llamar a la central.
25. **Asignación automática del día siguiente**: la central pulsa ⚡, revisa la propuesta (conductor, llegada, margen,
    km en vacío), cambia alguna línea y confirma; los conductores reciben el aviso.
26. **Horarios y planificación**: turnos partidos o nocturnos, semana tipo, cambios de una semana concreta y copiar al
    mes siguiente; la asignación no propone a nadie fuera de turno.
27. **Navegación del conductor**: mapa en el sentido de la marcha, zoom al acercarse a un cruce, «↱ Gira a la derecha en
    120 m» y pantalla completa al tocar el mapa.
28. **Aviso al cliente**: el conductor avisa por WhatsApp de que va de camino o llega tarde; el cliente sigue el coche
    en una página sin registro que caduca al terminar.
29. **Devolver servicios**: con trabajos acumulados, el conductor devuelve uno (✕) o todos a la central con un motivo,
    y la central los redistribuye.
30. **Demo para el jurado**: «Cargar datos de demo» llena el día; «Archivar» lo vacía (solo la demo durante la
    evaluación) y «Deshacer» lo recupera.
31. **Baja de un conductor**: sin historial se elimina; con historial se da de baja conservando sus registros.

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

- **10/10/2026**: a petición del responsable, se **desactiva el reinicio diario** de la demo y el botón «Restablecer
  demo»: lo que se crea en la app se conserva. La tarea diaria de GitHub Actions solo hace una petición de lectura
  para que Supabase no se pause.
- **10/10/2026**: **navegación en la app del conductor**. Proxy `/api/ruta` (OSRM, caché 10 min, límite 30/min por
  usuario, fallback en línea recta), helpers puros `navegacion.ts` con TDD (objetivo, proximidad con histéresis,
  formatos es-ES, distancia restante sobre la polilínea), mapa con punto azul + precisión, ruta, «Centrar»,
  avisos de proximidad (vibración + pitido + banner) y evento `llegando_*` que la central muestra como «Llegando».
- **10/10/2026**: **planificación con tiempos**. Módulo puro `planificacion.ts` con TDD (traslado en vacío con el
  mismo modelo recta × 1,3 a 70 km/h sin margen de carga, plan del día, `encaja` con motivo legible). La sugerencia
  de conductores exige llegar a tiempo desde el servicio anterior y al siguiente; la hoja de ruta muestra franjas de
  traslado, confirma asignaciones inviables y sugiere el mejor conductor para cada servicio sin asignar.
- **10/10/2026**: **app nativa TDL Conductor (N1, andamiaje)**. Proyecto Expo SDK 57 en `movil/` (Expo Router,
  TypeScript), proyecto EAS `@osalgado/tvl-conductor`, identidad (bundle `com.transfersvipluxe.conductor`, icono
  de la marca generado con sharp, tema oscuro de marca), permisos de ubicación en segundo plano, perfiles `eas.json`,
  cliente Supabase con AsyncStorage y login con guardia de rol conductor y cuentas de demo (Copiar/Usar).
- **11/10/2026**: **módulos Mantenimiento e Informes** (activables). Mantenimiento: plan por vehículo (ITV, seguro,
  próxima revisión por fecha/km) y registro de intervenciones (migración 0013, RLS de lectura operador/conductor de su
  vehículo); semáforo puro en `src/lib/dominio/mantenimiento.ts` y avisos en el panel. Informes: `/central/informes`
  por mes/conductor/vehículo con km estimados, combustible, consumo, rechazos e incidencias, gráfico y export CSV;
  agregaciones puras en `src/lib/dominio/informes.ts`.
- **Módulo de vuelos (11/10/2026)**: nº de vuelo validado y normalizado (IATA/ICAO + 1-4 dígitos) en `/reservar` y en
  la central; enlace «Ver vuelo» a Flightradar24 en ficha, lista, hoja de ruta y app del conductor (web y nativa);
  «Hora real de llegada» en la ficha que propone mover la recogida a llegada + margen de equipaje (ajustes, 20 min por
  defecto), con confirmación, evento en `eventos_servicio` y push al conductor. Consulta automática preparada
  (`src/lib/vuelos/`, AeroDataBox) que solo aparece con `AERODATABOX_API_KEY`. Migración 0014; lógica pura en
  `src/lib/dominio/vuelos.ts`.

- **Módulos del conductor (11/10/2026)**: **Jornada** (iniciar/pausa/reanudar/finalizar, horas de hoy y semana;
  `/central/jornadas` por conductor y día con CSV de registro horario, art. 34.9 ET), **Incidencias** (avería,
  accidente, no presentado, retraso u otro, con foto en el bucket privado `incidencias` y posición; alerta en vivo en el
  panel y `/central/incidencias` con URL firmada para resolverlas) y **Checklist** del vehículo (ítems editables y
  ordenables en `/central/checklist`, una revisión por día y vehículo; lo «mal» avisa en el panel). En PWA (Server
  Actions) y app nativa (rutas `/api/conductor/{jornada,incidencia,checklist}` con Bearer). Migración 0012; lógica pura
  en `src/lib/dominio/{jornada,incidencias,checklist}.ts`.

- **Jefe multitarea, parte servidor (11/10/2026)**: el responsable dirige la central desde el coche mientras hace
  servicios. Migración 0017: `perfiles.conduce` (operador que también conduce) y `vigilante_push` (cursor). Todas las
  listas de conductores usan `FILTRO_CONDUCEN` (`src/lib/conductores.ts`); las acciones de conductor admiten al operador
  con `conduce` sobre lo que tiene asignado (`puedeConducir`, `exigirConductor`, `exigirConductorBearer`); casilla
  «También conduce» en Flota y enlace «Mis servicios». Un vigilante en `src/instrumentation.ts` (cada 20 s) manda push a
  la central de reservas web nuevas, rechazos, plazos vencidos, incidencias y checklists con fallos (textos en
  `src/lib/dominio/avisosCentral.ts`). Rutas Bearer `/api/central/{resumen,sugerencia,asignar,reasignar,alerta-vista}`
  para el modo central de la app nativa, con la lógica compartida con las Server Actions en `src/lib/central/operaciones.ts`.
- **Jefe multitarea, modo central en la app nativa (11/10/2026)**: la app «TDL Conductor» deja entrar también a los
  operadores. El operador aterriza en `movil/app/central/` con pestañas Central (alertas con texto legible y botón
  «Visto» + mapa MapLibre de la flota con color por estado y umbral «sin señal» de los ajustes), Servicios (sin asignar,
  en curso, asignados y terminados; ficha con llamar al cliente/conductor, ver vuelo y asignar/reasignar eligiendo entre
  las sugerencias con su motivo), Mis servicios (solo si `conduce`: monta la misma pantalla «Hoy» y el interruptor GPS
  del conductor) y Más (central web, privacidad, salir). Un único `ProveedorCentral` carga `/api/central/resumen` y lo
  refresca por Realtime (`servicios` y `posicion_actual`), pull-to-refresh y cada 30 s en primer plano. Tocar un push de
  la central abre la pestaña Central. Lógica pura en `src/lib/dominio/centralMovil.ts` y `marcadoresFlota` en `mapa.ts`.

- **Blindaje de la conexión app ↔ servidor ↔ Supabase (11/10/2026)**: tras el incidente del mismo día (ver
  «Challenges»), auditoría de bucles y reintentos. App: `movil/lib/red.ts` (todo fetch con tiempo máximo, también el
  de supabase-js vía `global.fetch`; estado de conexión por destino y sondas con backoff a `/api/salud` y
  `/auth/v1/health`), aviso «Sin conexión con el servidor · reintentando en Xs» en las cabeceras, cola de acciones con
  backoff exponencial con tope y `Retry-After`, recargas agrupadas y frenadas. Servidor: límite por IP y por token
  ANTES de autenticar, caché de la verificación del JWT (60 s, nunca más allá de `exp`), 429/503 con `Retry-After`,
  `GET /api/salud`, cliente admin con tiempo máximo y vigilante sin solapes y con backoff. Web: un único freno de
  `router.refresh` en Realtime. Lógica pura en `src/lib/dominio/reintento.ts`; tests en
  `tests/unit/{reintento,proteccion-servidor}.test.ts`.
- **Filtros por grupo en Servicios (11/10/2026)**: a petición del responsable («que toques unos botoncitos arriba y
  te filtre»), fila de chips con contador —Todos, Sin asignar, Esperando respuesta, En curso, Terminados— encima de la
  lista de la app (modo central; por defecto «Sin asignar» si hay alguno, y la elección se conserva mientras la app
  está abierta) y encima de la tabla/calendario de `/central/servicios` en la web (parámetro `grupo=`, que conserva
  periodo, modo, conductor y origen). Los grupos, contadores y el filtrado son lógica pura compartida en
  `src/lib/dominio/centralMovil.ts` (tests en `tests/unit/centralMovil.test.ts`).
- **Sonidos de la central y aviso sonoro al conductor (11/10/2026)**: a petición del responsable («una serie de
  sonidos que al oírlos desde la central puedas entender lo que está pasando con los portes» y «que suene una
  notificación… para que nadie se quede despistado»). *Web*: vocabulario de 9 sonidos sintetizados con Web Audio
  (`src/lib/sonidos.ts`, sin ficheros ni APIs): reserva nueva web (dos tonos ascendentes), enviado/asignado (whoosh),
  aceptado (ding-ding), rechazado o plazo vencido (dos tonos graves descendentes), en camino (tono suave), cargado
  (tono doble), completado (arpegio), incidencia/checklist con fallos (alarma de 3 pitidos) y llegando (campanita).
  El panel en vivo los dispara con cada evento nuevo de `eventos_servicio` que llega por Realtime (los ya presentes
  al cargar no suenan; nunca dos veces el mismo evento; tras una reconexión, solo los de los últimos 2 min) y con las
  incidencias/checklists nuevos; anti-ráfaga: como mucho uno cada 1,5 s y, si coinciden, el más grave. Interruptor
  🔊/🔇 en la barra lateral y en la cabecera móvil (localStorage), desbloqueo del audio en el primer clic/tecla, y
  apartado «Sonidos» en Flota con ▶ para escuchar cada uno. Un único AudioContext compartido también por la web del
  conductor (antes había tres). Mapeo tipo→sonido, gravedad y anti-ráfaga son lógica pura en
  `src/lib/dominio/sonidos.ts` (tests en `tests/unit/sonidos.test.ts`). *App*: con la app abierta, el servicio nuevo
  (o reasignado a mí) además del modal lanza una notificación local con sonido (canal «servicios» de importancia alta
  en Android) y se repite cada 20 s (máx. 5) con vibración fuerte mientras no se responda; si la central me lo quita,
  aviso sonoro. En modo central, cada alerta nueva (rechazo, plazo vencido, subcontratar, reserva web) suena con
  notificación local y vibración distinta (Error/Warning); los push del servidor (incidencias, checklist) vibran
  igual. Para no sonar dos veces, un push del servidor de algo que la app acaba de anunciar solo va a la lista.
  Solo con `expo-notifications` y `expo-haptics` (ya instalados): la huella nativa no cambia y llega por EAS Update.
- **Actividad en vivo y alarma de lo grave (11/10/2026)**: a petición del responsable («acabo de aceptar un porte
  desde el móvil del conductor y debería salir en la pantalla de control… en alertas tendrían que salir TODOS los
  movimientos… averías, accidentes o cosas graves en ROJO con alarma… indica SIEMPRE qué conductor y la zona»).
  *Dominio* (`src/lib/dominio/actividad.ts`, tests en `tests/unit/actividad.test.ts`): feed unificado con eventos de
  servicio, incidencias, checklists y jornadas en frases naturales («Marc ha aceptado el servicio de las 15:00 ·
  Salou → Aeropuerto de Reus», «Laia ha recogido a Lucía en Salou – Plaza Europa», «Jordi ha dejado a … en
  Aeropuerto de Reus · queda libre», «⚠ AVERÍA · Laia · cerca de Reus · …»), con gravedad (grave: avería y accidente;
  aviso: rechazo, plazo vencido, retraso, no presentado, checklist con fallos; info: el resto), conductor, teléfono,
  servicio y zona. La zona se calcula SIN APIs (`src/lib/dominio/zonas.ts`): ~60 localidades del Camp de Tarragona,
  Costa Daurada, Terres de l'Ebre, Penedès, Barcelona y Lleida → «en Reus» (< 3 km), «cerca de Reus» (< 15 km) o «a
  23 km de Reus»; la incidencia usa sus coordenadas y, si no tiene, la última posición del conductor. *Web*
  (`/central`): sección «Actividad en vivo» (últimos 40 movimientos de 12 h, lo nuevo arriba, con icono y hora;
  Realtime en `eventos_servicio`, `incidencias`, `checklist_revisiones` y `jornadas`) bajo «Alertas», y lo GRAVE en
  tarjeta roja fija arriba del todo (en móvil, antes del mapa) con conductor, zona, hora, servicio y descripción,
  «📞 Llamar» (`tel:`), «Ver en el mapa» (centra el mapa en el punto), «Visto» (este navegador) y «Marcar resuelta».
  Sonido nuevo «sirena» para lo grave: suena al aparecer y se repite cada 30 s (máx. 5) mientras haya graves sin ver
  (lógica pura `pasoAlarma`), respetando 🔇; tres pitidos para los avisos; el resto, el sonido de su evento (aceptado
  = ding-ding). *App* (modo central): `/api/central/resumen` trae `actividad` y `graves` ya redactados con la misma
  lógica; tarjeta roja fija arriba (Llamar, Visto, Marcar resuelta → nuevo `POST /api/central/incidencia-resuelta`
  con Bearer de operador), luego Alertas y luego «Actividad en vivo» compacta. Cada grave nueva lanza una
  notificación local con sonido y vibración Error que insiste cada 30 s (máx. 5) hasta «Visto»/«Resuelta»; el resto
  de movimientos solo vibra suave. *Push*: el vigilante avisa también de «aceptado» y de lo grave con tipo,
  conductor y zona (primero, para que nunca se pierda en el resumen de muchos avisos).
- **Puntualidad: «¿llego a tiempo a la recogida?» (11/10/2026)**. Petición del responsable: con un servicio a las
  19:50 aún de camino, que la app se lo diga y que la central se entere. Lógica pura `src/lib/dominio/puntualidad.ts`
  (tests en `tests/unit/puntualidad.test.ts`): solo en asignado / aceptado / en camino; con la hora de recogida, la
  hora actual y la ETA de la ruta OSRM (el mismo tiempo restante del banner del mapa) devuelve verde «Faltan 12 min ·
  llegas a tiempo», ámbar «Llegas justo · 3 min de margen» (< 5 min), rojo «Llegas tarde · +8 min» (llegada estimada
  > hora + 2 min de tolerancia) o rojo «Recogida hace 6 min · aún no has llegado». Sin ruta, solo el reloj.
  *App nativa*: contador GRANDE con fondo de color arriba de la pantalla del servicio (antes del botón de paso), se
  refresca cada 15 s; `MapaServicio` expone `alCambiarEta` (redondeada a 15 s para no re-renderizar en cada fix);
  chip compacto en las tarjetas de hoy sin recoger. *PWA*: el mismo contador, con la ETA que `NavegacionConductor`
  publica por un evento de ventana. *Aviso anticipado*: cuando la ETA pasa a «tarde» antes de la hora, la app (y la
  PWA) mandan UNA incidencia «retraso» automática («Aviso automático: llegada estimada 19:58 (+8 min)», con la
  posición), marcada en AsyncStorage/localStorage; si falla, un intento cada 60 s como mucho. *Aviso definitivo del
  servidor* (sin depender del móvil): migración `0018_retraso_recogida.sql` con `detectar_retrasos_recogida()` →
  evento `retraso_recogida` (sin actor) para recogidas de las últimas 6 h pasadas 2 min y sin recoger; índice único
  parcial = una sola vez por servicio. La llama el vigilante en cada pasada (~20 s) y pg_cron cada minuto. La central
  lo ve en la actividad («⏰ Marc llega tarde a la recogida de las 19:50 · Salou → Reus · cerca de Cambrils», aviso),
  con tres pitidos y push. `scripts/prueba-mision.mjs` lo comprueba con un tercer servicio de prueba.
- **11/10/2026 · Deshacer un paso pulsado sin querer**. Petición del responsable: «si el conductor sin querer finaliza
  el servicio y todavía no ha llegado a destino… que exista la opción de volver atrás». Lógica pura en
  `src/lib/dominio/deshacer.ts` (tests en `tests/unit/deshacer.test.ts`). *Prevención*: CARGA a más de 300 m de la
  recogida o DESCARGA a más de 300 m del destino (distancia GPS en línea recta que ya calcula la navegación:
  `MapaServicio` expone `alCambiarDistancia` en la app y `NavegacionConductor` la publica por un evento de ventana en la
  PWA) piden confirmación: «Aún estás a 2,3 km del destino. ¿Finalizar igualmente?». Sin GPS o sin coordenadas, sin
  confirmación extra. *Deshacer*: nueva acción `deshacer` en la máquina de estados (completado→recogido,
  recogido→en_camino, en_camino→aceptado). El conductor asignado (o el jefe que conduce lo suyo) solo puede deshacer
  SU último paso y durante 10 min desde ese evento; si después hubo otra acción (de la central o un «deshacer» previo)
  se rechaza con el motivo. Los eventos informativos (llegando, vuelos, retraso) no cuentan. Pasa por la RPC atómica
  `transicion_servicio` (0019) con evento `deshecho` y motivo «Deshecho por el conductor: descarga»; idempotente por
  `idAccion` y por la misma cola offline que los demás pasos. En la app y la PWA, tras cada paso y en «¡Servicio
  terminado!», botón «↩ Deshacer descarga (quedan 9:41)» con confirmación; si el servidor lo rechaza se muestra el
  motivo. La central (ficha web y modo central de la app, nueva ruta `POST /api/central/deshacer`) puede deshacer el
  último paso sin límite de tiempo, con confirmación («Deshecho por la central: …»). La Actividad en vivo lo muestra
  como aviso («↩ Marc ha deshecho la descarga del servicio de las 19:50»), con tres pitidos y push si lo hizo el
  conductor. `scripts/prueba-mision.mjs` lo prueba en producción con servicios de prueba. Sin migración nueva (el
  tipo de evento es texto libre) y sin dependencias nativas nuevas (huella de la app sin cambios).
- **11/10/2026 · Ruta recorrida e «Historial de viajes»**. Petición del responsable: «cuando finalizas un porte,
  guarda la ruta que se ha recorrido con el coche, aunque sea un dibujito del mapa… en una pestaña de historial de
  viajes». Las posiciones GPS se purgan a los 30 días (0009), así que el recorrido se guarda aparte: migración
  `0021_recorridos.sql` (tabla `recorridos`, una fila por servicio con `puntos` [[lng,lat],…] simplificados, `corte`
  = índice del punto de recogida, `km`, `km_con_pasajeros`, `duracion_min`, `puntos_originales`; RLS: la central lee
  todo y el conductor los suyos; escritura solo con service role). Lógica pura `src/lib/dominio/recorrido.ts` (tests
  en `tests/unit/recorrido.test.ts`): ventana entre el último «en camino» (o «aceptado») y el último «completado»;
  descarta precisión > 100 m y saltos imposibles (> 200 km/h, con recuperación si el raro era el primer punto);
  Douglas-Peucker iterativo (15 m, ≤ 500 puntos subiendo la tolerancia) por tramos —hacia la recogida y con
  pasajeros— unidos en la recogida; km por haversine sobre los puntos filtrados. *Cálculo*: el vigilante
  (`src/lib/servicios/recorridos.ts`, cada ~20 s, máx. 5 por pasada, upsert idempotente) busca los completados de las
  últimas 48 h sin recorrido, con uno de un «completado» anterior (se deshizo y se volvió a completar) o recién
  completados (se refresca cada 2 min durante 15 min: la cola offline del móvil sube posiciones tarde). Al arrancar el
  proceso, retro-relleno de los completados de los últimos 30 días que falten. *Central*: la ficha del servicio
  muestra «Recorrido realizado» (Leaflet: azul hacia la recogida, rojo con pasajeros, inicio/recogida/destino, km y
  duración); nueva página `/central/viajes` («Historial de viajes», en el menú) con filtros de fechas y conductor y
  miniatura SVG de cada viaje (sin teselas: ligera). *Conductor*: en la PWA, el historial dibuja la ruta de cada
  viaje completado y abre `/conductor/historial/[id]` con el mapa grande; en la app nativa, miniatura con Views
  giradas (sin `react-native-svg`: no está instalado) y, al tocar, un modal con el mapa MapLibre
  (GeoJSONSource + Layer), km y duración. Sin dependencias nativas nuevas (huella de la app sin cambios).
  `scripts/prueba-recorrido.mjs` lo prueba en producción con un servicio de prueba (Salou → Aeropuerto de Reus).
- **12/10/2026 · Hoja de cierre de jornada (estado del vehículo)**. Petición del responsable: «cuando termine la
  jornada, una pantalla en la que el conductor marque si el vehículo ha sufrido algún daño, con un mapa del coche visto
  desde arriba… una hoja de cierre del estado del vehículo para que al día siguiente esté preparado». Lógica pura en
  `src/lib/dominio/cierre.ts` (tests en `tests/unit/cierre.test.ts`): 25 `ZONAS_VEHICULO` (parachoques, faros, aletas,
  capó, parabrisas, ruedas, retrovisores, puertas, techo, luna trasera, portón, pilotos) con posición en una rejilla de
  100 × 155 que dibujan igual la web (divs con %) y la app (Views absolutas escaladas al ancho de pantalla, sin
  `react-native-svg`); `ITEMS_TECNICOS` (neumáticos, aceite, agua de motor, luces, testigos del cuadro —motor, revisión,
  inspección— y otra avería) con OK / Revisar|Falta; combustible (lleno…reserva); km opcional ≥ km actuales;
  comentario ≤ 1000. `gravedadCierre()`: **grave** (daños, testigo encendido u otra avería), **mantenimiento** (falta
  aceite/agua, neumáticos o luces a revisar, reserva) u **ok**; `resumenCierre()` redacta «🔴 Daños en Puerta del. izq.,
  Aleta tras. der. · testigo de motor · 0001-TDL · Marc» o «🟢 Cierre sin incidencias · 0001-TDL · Laia».
  *Base de datos* (`0023_cierres_jornada.sql`): tabla `cierres_jornada` (un cierre por jornada, `id_accion` único,
  RLS: el conductor lee los suyos, la central todo, escritura solo service role, en Realtime) y función
  `cerrar_jornada(...)` (solo `service_role`) que en UNA transacción inserta el cierre, sube `vehiculos.km_actuales`
  con `greatest` y finaliza pausas y jornada abiertas; idempotente por `idAccion` y por jornada. *Servidor*:
  `registrarCierre` en `src/lib/conductor/modulos.ts` (zod), ruta `POST /api/conductor/cierre` (Bearer) y Server
  Action `cierreConductor` (PWA). Nuevo módulo «Hoja de cierre del vehículo» (`cierre`, en Flota y ajustes → Módulos,
  activo por defecto): con jornada + checklist + cierre activos (y algún vehículo activo), «Finalizar jornada» solo se
  puede hacer enviando la hoja (la acción `finalizar` suelta responde 409); si no, funciona como antes. *Conductor*:
  en la PWA (`HojaCierre.tsx`) y en la app (`movil/components/HojaCierre.tsx`, Modal a pantalla completa con su propio
  `SafeAreaProvider`), 3 pasos: diagrama tocable («Borrar todo» / «Hecho» en rojo; zonas ≥ 40 px, accesibles con
  etiqueta y estado seleccionado), estado técnico con botones grandes + combustible + km, y comentario con resumen en
  color + «Enviar y cerrar jornada». «Atrás» entre pasos, «Cancelar» no finaliza; vehículo habitual o selector; sin
  red, error y «Reintentar» con el mismo `idAccion` (no se pierde lo marcado). *Central*: la actividad en vivo muestra
  el cierre (grave → tarjeta roja fija con mini-diagrama, sirena insistente y push con alarma hasta «Visto», que es
  para toda la central; mantenimiento → aviso ámbar con tres pitidos y push con sonido de aviso; ok → línea verde con
  el arpegio de cierre). El vigilante avisa por push (cursor `ultimo_cierre_en`). La app central lista las zonas de la
  tarjeta roja y tiene «Visto» (`POST /api/central/cierre-visto`). `/central/mantenimiento` muestra el «Último
  cierre» de cada vehículo con semáforo, fecha, conductor, daños, técnico, combustible, km y comentario. Prueba de punta
  a punta en producción: `scripts/prueba-cierre.mjs`. Sin dependencias nativas nuevas (huella de la app sin cambios:
  la parte nativa llega con una actualización EAS).
- **12/10/2026 · Jornada en su propia pantalla, GPS automático y parte de golpes en las incidencias**. Petición del
  responsable: la pestaña «Jornada» de la app abría un menú y la pantalla parecía la principal; tiene que ser una
  PÁGINA con iniciar / pausa / finalizar, un botón de incidencias con el dibujo del coche para marcar golpes, envío
  rápido y con alarma de lo grave, todo acumulado en el parte diario, y GPS automático al iniciar la jornada.
  *App nativa*: `movil/app/(conductor)/(tabs)/jornada.tsx` pasa a ser una pantalla normal (icono de la pestaña según
  el estado, `IconoJornada.tsx`): tarjeta grande «Sin iniciar / Trabajando desde HH:MM / En pausa desde HH:MM», horas
  de hoy y de la semana y «📍 GPS activo / apagado»; botones grandes «▶ Iniciar jornada» (verde), «⏸ Pausa» /
  «▶ Reanudar» (ámbar) y «🏁 Finalizar jornada» (hoja de cierre). «Iniciar» enciende antes el GPS con el mismo flujo
  de permisos que el interruptor de la cabecera (`encenderServicio` en `movil/lib/gps.ts` y la pantalla explicativa
  «Ubicación Siempre» compartida, `useExplicacionUbicacion`): sin permiso de ubicación NO se inicia y se explica con
  «Abrir Ajustes»; con solo «Mientras se usa» se inicia y sale el aviso amarillo. «Finalizar» (tras enviar la hoja)
  apaga el GPS (`apagarServicio`: `pararGps` + «Fuera de servicio»); la pausa no lo toca. Un pequeño emisor de eventos
  (`movil/lib/jornada.ts`: `avisarCambioGps` / `alCambiarGps`) mantiene sincronizado el interruptor de la cabecera
  (mismo almacenamiento). Sección «Incidencias»: «⚠ Comunicar incidencia» (avería, accidente, golpe / daño en el
  vehículo, cliente no presentado, retraso, otro) a pantalla completa; para accidente y golpe aparece el diagrama de
  daños (extraído a `movil/components/DiagramaDanos.tsx`, el mismo de la hoja de cierre) + descripción + foto; envío
  inmediato y lista «Incidencias de hoy» con hora, tipo y zonas. La pantalla Hoy queda en servicios + checklist. La
  ficha del servicio mantiene su botón Incidencia (ahora con zonas). *PWA*: nueva página `/conductor/jornada` (en el
  menú inferior) con los mismos botones; «Iniciar» enciende el GPS del navegador a través de `InterruptorServicio`
  (evento `tdl-encender`, que pide la ubicación y solo con «denegado» impide iniciar) y «Finalizar» lo apaga
  (`tdl-apagar`); incidencias con `DiagramaVehiculo`. *Datos* (`0024_incidencias_zonas.sql`, aditiva): columna
  `incidencias.zonas text[]` (por defecto vacía) y tipo `golpe` en el check. El servidor valida las zonas con zod
  contra `IDS_ZONAS` (`registrarIncidencia`; `/api/conductor/incidencia` y la Server Action las aceptan; las apps
  antiguas, sin zonas, siguen funcionando). Dominio (`src/lib/dominio/incidencias.ts`): golpe es grave como avería y
  accidente (`TIPOS_GRAVES`), `validarZonasIncidencia`, y `acumuladoDelDia()` para la hoja de cierre, que al abrirse
  (app y PWA) precarga marcadas las zonas de los golpes/accidentes de hoy y muestra «Incidencias de hoy: …» en el paso
  3: el parte diario se envía con todo. *Central*: la tarjeta roja de un golpe/accidente con zonas dibuja el
  mini-diagrama (web, como en los cierres) o lista las zonas (app); actividad «⚠ GOLPE · Marc · cerca de Reus · Puerta
  del. izq., Aleta tras. der.»; push con alarma («Daños: …» en el cuerpo); `/central/incidencias` también dibuja las
  zonas. Tests: `tests/unit/incidencias-golpe.test.ts`. `scripts/prueba-cierre.mjs` añade una tercera jornada con un
  golpe de 2 zonas y un cierre que las incluye. Sin dependencias nativas (huella sin cambios; llega con EAS update).
- **12/10/2026 · Búsqueda de direcciones con Photon y «Lugares de la empresa»**. Petición del responsable: buscar
  empresas por su nombre (como en Google Maps) sin escribir la dirección completa. *Búsqueda externa*
  (`src/lib/geocodificacion/buscador.ts`): Photon (photon.komoot.io, datos de OpenStreetMap, gratis; tolera mejor los
  nombres y encuentra puntos de interés como hoteles) es el proveedor principal, con sesgo a la Costa Dorada
  (`lat=41.08&lon=1.14`), filtro a España y Andorra, User-Agent propio, timeout de 5 s, caché en memoria de 24 h solo de
  respuestas buenas y como mucho 1 petición por segundo y proceso; si falla, no tiene hueco o no encuentra nada, se
  usa Nominatim de respaldo (mismas reglas). Etiquetas «Nombre · Calle nº · Localidad» (`etiquetaPhoton` en
  `src/lib/dominio/geocodificacion.ts`, pura y con tests). Bajo el desplegable, «Búsqueda: Photon / © OpenStreetMap».
  *Lugares de la empresa* (`0025_lugares_empresa.sql`, aditiva): clientes y sitios habituales (nombre, dirección,
  coordenadas, notas, teléfono opcional). RLS: la central lee y escribe; los conductores solo leen (para el futuro
  servicio inmediato). Gestión en `/central/lugares` (menú y enlace desde Flota y ajustes): añadir, editar y borrar;
  la dirección se elige con el mismo autocompletado para fijar las coordenadas. En «Nuevo servicio» (origen, destino
  y vuelta) el autocompletado muestra primero 🏢 empresa, luego ⭐ favoritos, 📍 frecuentes y la búsqueda externa;
  todo sin acentos ni mayúsculas (`normalizarBusqueda`; también los favoritos y los frecuentes). Los lugares de la
  empresa se filtran en el navegador de la central: `/api/geocodificar` (pública, la usan `/reservar` y las apps
  antiguas, misma forma de respuesta + campo `fuente`) nunca los devuelve. *Google Places (preparado, apagado)*:
  `src/lib/geocodificacion/google.ts` (Autocomplete + Place Details de la API «New»; las coordenadas se piden al
  elegir la sugerencia con `GET /api/geocodificar?lugar=<placeId>`) solo se activa si existe `GOOGLE_PLACES_API_KEY`
  (documentada vacía en `.env.example`; es de pago). Tests: `geocodificacion.test.ts`, `lugaresEmpresa.test.ts`,
  `google-places.test.ts` (fetch simulado).
- **13/10/2026 · Direcciones de calle en el autocompletado**. Medido en producción: los lugares («aeropuerto reus»)
  salían, pero las direcciones no: «Dr. Eduard Punset 7, 3-1 de Salou. Tarragona» y «Carrer Eduard Punset Salou» sin
  resultados (la calle es «Avinguda del Doctor Eduard Punset»), «Carrer Barcelona 10 Salou» devolvía «Carrer de Salou
  10 · Barcelona» y «hotel piramide salou» nada. Se probaron las URLs reales de Photon y Nominatim (≈30 peticiones a
  cada uno, 1 por segundo) antes de programar: con una caja alrededor de la localidad los dos encuentran la calle
  aunque el tipo de vía no coincida; cuando el portal no está en OpenStreetMap devuelven la calle sin número; y
  «hotel piramide» no da nada pero «piramide» sí. *Limpieza de la consulta* (`src/lib/dominio/consultaDireccion.ts`,
  pura): `analizarConsulta` / `normalizarConsulta` expanden abreviaturas (Dr./Dra., Avda./Av., C/, Pg./Pº, Ctra.,
  Pl./Pza., Urb., s/n, nº), quitan piso/puerta/escalera tras el portal («3-1», «3º 1ª», «3o 1a», «bajo», «ático»,
  «esc. B», «piso», «puerta», «izq.»), código postal, país y la provincia sobrante («Salou, Tarragona»), y «de Salou» →
  «Salou». Detectan la localidad conocida (las de `zonas.ts` sin aeropuertos ni estaciones, con alias sin acentos:
  La Pineda/Vila-seca, Mont-roig/Miami Platja, L'Hospitalet de l'Infant…), sin confundirla con el nombre de la calle
  («Carrer Barcelona 10 Salou» → Salou; «Avinguda de Tarragona 5 Reus» → Reus). Dan también un *núcleo* de respaldo:
  la calle o el nombre sin número ni localidad («hotel piramide salou» → consulta «piramide Salou», núcleo «piramide»). *Búsqueda*
  (`buscador.ts`): Photon y Nominatim en paralelo, cada uno con su cola de 1 petición/s (espera hasta 2 s; si no,
  se salta) y caché de 24 h por URL; con localidad, Photon con `bbox` de ~8 km (15 km en capitales de provincia) y
  Nominatim con `viewbox` + `bounded=1`. Si la consulta limpia no da nada, se prueba el núcleo. *Fusión*
  (`fusionarResultados` en `geocodificacion.ts`, pura): repetidos fuera (misma calle + número + localidad, o < 30 m del
  mismo tipo); orden: localidad detectada > cercanía a Salou por anillos de 10/30/60 km > palabras buscadas presentes >
  dirección exacta > calle > lugar > población (sin número tecleado, el lugar antes que la calle: si no, «aeropuerto
  reus» ponía primero la carretera de acceso al aeropuerto). Si el portal tecleado no existe en el mapa, la calle sale como
  «Avinguda del Doctor Eduard Punset, 7 · Salou (número aproximado)» con las coordenadas de la calle (campo
  `aproximado`), así el conductor ve el número. *UI* (`CampoDireccion`): si tras ≥ 6 letras no hay ninguna
  sugerencia, el desplegable ofrece «Usar “…” tal cual (sin punto en el mapa)»; el orden 🏢/⭐ de la central no cambia.
  Tests: `consultaDireccion.test.ts` (los casos reales y ~60 variantes) y `geocodificacion.test.ts` (paralelo, cajas,
  respaldo, cola y caché con fetch y reloj simulados).
- **Aviso al cliente y «No puedo hacer este servicio» (13/10/2026)**: diseño aprobado
  (`docs/superpowers/specs/2026-10-11-aviso-pasajero-design.md`) más la petición del responsable de que el conductor
  pueda decir al cliente «estoy en camino», «me retraso» o «se ha cancelado y la central te asignará otro conductor».
  *WhatsApp «un toque»* (sin API ni coste): `src/lib/dominio/avisoCliente.ts` (pura, con tests) normaliza el teléfono a
  E.164 (+34 por defecto), redacta las plantillas es/en (en camino con ETA y enlace, retraso con minutos y hora,
  «ya estoy aquí» con modelo y matrícula, cambio de conductor; la central escribe en 3.ª persona) y monta `wa.me` o
  `sms:`. Botón verde «💬 Avisar al cliente» en la app nativa (ETA del mapa y minutos del contador de puntualidad,
  recordatorio «Envíalo parado»), en la PWA y en la ficha de la central (web y app). Tras abrir el chat se anota el
  evento `aviso_cliente` (POST `/api/conductor|central/aviso-cliente`, idempotente por idAccion) → «💬 Marc ha avisado
  al cliente: en camino» en la Actividad. *Seguimiento en directo*: tabla `seguimientos` (migración 0027, sin
  políticas RLS: solo el servidor), token aleatorio de 32 bytes creado al aceptar o con el primer aviso; página
  pública `/s/<token>` (noindex, sin login, es/en por `Accept-Language`) con mapa Leaflet que refresca cada 15 s desde
  `GET /api/s/<token>`, que devuelve SOLO estado («confirmado», «de camino», «llegando», «a bordo», «finalizado»),
  posición del coche, ETA (modelo de traslado, sin OSRM por petición), nombre de pila, modelo y matrícula; caduca 30 min
  después de completar/cancelar. *Devolver*: nueva acción `devolver` en `estados.ts` (aceptado/en camino → pendiente,
  solo el conductor asignado, motivo obligatorio: Avería, Retraso grave, Emergencia personal u Otro), por la RPC
  atómica de 0019 y la cola offline (que ahora guarda el motivo); `ultima_incidencia «devuelto: …»` → alerta
  «🔁 Marc ha devuelto el servicio de las 15:00: Avería» en la central (sonido de aviso, push del vigilante, columna de
  alertas con «Asignar», app central) y el servicio aparece en «Sin asignar». Tras devolver, la app ofrece «Avisar al
  cliente del cambio». Prueba en producción: `scripts/prueba-aviso.mjs` (23 comprobaciones, todo OK).

- **13/10/2026 · Duración por servicio, «⚡ Asignar automáticamente» y semáforo de puntualidad en la central**.
  Petición del responsable: «cada servicio tendría que calcular lo que tarda más o menos, para evitar que al
  distribuir servicios haya muy poco margen y el conductor no llegue; con muchos servicios acumulados, un botón
  "Asignar automáticamente": se selecciona la lista de conductores disponibles y la lógica asigna» y «indicador visual
  en los servicios del centro de control: verde llegamos bien, naranja justo, rojo retrasado». *Duración*
  (`src/lib/dominio/duracion.ts`, pura): trayecto (ruta OSRM si ya está en la caché de la instancia —`rutaEnCache`, sin
  pedir nada—; si no, recta × 1,3 a 70 km/h) + carga en el origen + descarga en el destino: 15 min en aeropuertos y
  estaciones (por texto —«Aeropuerto», «Aeroport», «T1», «Estació», «Renfe»…— o por estar a ≤ 1,2 km de los de
  `zonas.ts`), 5 min en el resto; mínimo 15. Los servicios nuevos guardan ya esa duración y el plan (`aPlan`) usa la
  mayor entre la guardada y la calculada (conservador con los antiguos). Se ve en la ficha («≈ 50 min (trayecto 30 +
  carga 15 en aeropuerto + descarga 5)») y en la hoja de ruta. Nuevo ajuste `ajustes.margen_minimo_min` (migración
  0026, aditiva, por defecto 15, editable en Flota y ajustes): margen que debe sobrar entre la llegada a una recogida
  y su hora desde el fin del servicio anterior; también marca «justa» (naranja) la franja de traslado de la hoja de ruta.
  *Asignación automática* (`src/lib/dominio/autoasignacion.ts`, pura y determinista, 45 tests): entrada = pendientes
  elegidos + conductores elegidos (vehículo habitual con plazas/maletas, taller, compromisos fijos asignado…recogido,
  posición GPS reciente) + estrategia + margen. Ordena por hora y hace inserción voraz comprobando capacidad, solapes,
  llegada con ≥ margen desde el servicio anterior (o desde la posición si la recogida es en < 3 h) y que no rompe el
  siguiente compromiso; un grupo que no cabe en ningún vehículo elegido sale como «subcontratar». Después, mejora local
  (mover y luego intercambiar servicios entre conductores, hasta 6 pasadas, solo movimientos que mantienen todo
  factible) según la estrategia: *equitativo* (suma de cuadrados del nº de servicios del día, contando los que ya
  tienen, y después km), *menos km* (km en vacío) o *equilibrado* (menos km sin que nadie pase de 2× el que menos;
  tope blando: si nadie más puede, se asigna igual). Sin coordenadas se supone un traslado de 30 min. Salida por línea:
  conductor o motivo, llegada estimada, margen, km en vacío, y métricas por conductor (servicios, horas, km).
  *Servidor* (`src/lib/central/autoasignar.ts`): datos del diálogo, propuesta y confirmación; la confirmación vuelve a
  leer todo, reevalúa la asignación completa (`evaluarAsignacion`) y salta las líneas que ya no están pendientes o ya
  no encajan (salvo «Asignar igualmente»); cada línea va por `ejecutarAccionOperador` (push al conductor) con un
  `idAccion` derivado del lote y el servicio (UUID v5), así reintentar el mismo lote no duplica nada («ya asignado»).
  *UI web* (`DialogoAutoasignar`, en Servicios y Hoja de ruta): día (pendientes preseleccionados, se pueden desmarcar),
  conductores con conexión, vehículo y plazas (marcados los que conducen y no tienen el vehículo en taller), estrategia
  y margen → «Calcular propuesta» → tabla con selector de conductor por línea (al cambiarlo se recalcula en el
  navegador y avisa en rojo/naranja), no asignables con motivo y resumen por conductor → «Confirmar y enviar» con
  contadores. *API* para la app/pruebas: `GET|POST /api/central/autoasignar/propuesta` y `POST …/confirmar` (Bearer
  de la central). *Semáforo* (`src/lib/dominio/puntualidadCentral.ts`, pura): para asignado/aceptado/en camino de hoy,
  ETA desde la posición GPS reciente encadenando lo que el conductor lleva antes (lo que va a bordo + descarga, y
  servicios previos), con el modelo de traslado (sin OSRM); sin GPS reciente, por hora y plan con la etiqueta gris
  «sin GPS». Clasifica con `calcularPuntualidad` (la misma regla que ve el conductor): «a tiempo · 12 min de margen»,
  «justo · 3 min», «retraso +8 min». Se ve en la lista de servicios, en los contadores del panel en vivo («En curso»
  y «Esperando respuesta» desglosan cuántos van tarde o justos, también en su ventana), en la hoja de ruta (chip en cada
  tarjeta y la franja de traslado toma el color en vivo si el GPS dice que va peor que el plan), en la ficha y en la app
  nativa (lista y ficha del modo central) con el campo `puntualidad` de `/api/central/resumen`. App: sin dependencias
  nativas (huella sin cambios). Prueba de punta a punta en producción: `scripts/prueba-autoasignar.mjs` (6 servicios
  de prueba para mañana entre 09:00 y 10:30 con orígenes distintos y 3 conductores demo, estrategia equitativa): 19
  comprobaciones OK — reparto 2/2/2, sin solapes ni márgenes < 15 min (auditoría independiente en el script),
  confirmar asigna los 6 con el vehículo habitual, cada conductor ve solo los suyos, reintento del lote sin duplicar,
  lote nuevo sobre uno ya asignado → saltado; al final quedan `es_prueba` y cancelados.
- **Fin de jornada con servicios pendientes, CARGA/DESCARGA lejos del punto y ausencias (13/10/2026)**. Tres peticiones
  del responsable. *Fin de jornada*: al pulsar «Finalizar jornada» (PWA y app nativa, antes de la hoja de cierre) se
  consultan los servicios del conductor de HOY (día de Madrid) en asignado/aceptado/en camino con la recogida posterior a
  ahora (`src/lib/dominio/finJornada.ts`, pura): si hay, se listan con hora y trayecto y se pregunta. «No, devolverlos a
  la central» encola por la cola offline cada uno con motivo «Fin de jornada» (`devolver` si estaba aceptado/en camino,
  `rechazar` si solo estaba asignado); «Sí, volveré» sugiere ⏸ Pausa (o «Finalizar igualmente»). Los de mañana no se
  tocan. La central recibe UN aviso agrupado («🔁 Jordi ha terminado la jornada y ha devuelto 2 servicios de esta
  tarde»), en push y en la actividad. Red de seguridad en el servidor (también para apps antiguas): el vigilante revisa
  cada jornada cerrada (2 min de gracia para la cola offline, marca atómica `jornadas.pendientes_revisada_en`, una sola
  vez) y, si quedan servicios de hoy sin devolver, avisa «⚠️ Marc ha cerrado la jornada con 2 servicios pendientes hoy
  (16:00, 18:30)» (sonido de aviso, push y tarjeta ámbar en el panel); no devuelve nada solo. La sugerencia y la
  asignación automática no proponen para HOY a quien ya cerró su jornada hoy («Jornada cerrada hoy»). *CARGA/DESCARGA
  lejos*: el vigilante, al ver un evento «recogido»/«completado», toma la posición del conductor en ese momento
  (posiciones ±2 min o la actual reciente) y la compara con el origen/destino (`src/lib/dominio/anomalias.ts`, pura);
  por encima de `ajustes.umbral_anomalia_m` (500 m por defecto, editable en «Flota y ajustes») inserta UNA vez el
  evento `anomalia_carga`/`anomalia_descarga` (índice único) y sale el aviso «⚠️ Marc ha marcado CARGA a 2,3 km de la
  recogida (Salou – Plaza Europa) · está cerca de Cambrils» con «Ver en el mapa» (centra el mapa en esa posición),
  «Llamar» y «Visto». Sin coordenadas o sin GPS: no se alerta. *Ausencias*: tabla `ausencias` (migración 0028, RLS:
  la central todo, el conductor lee las suyas) y página «Ausencias» en la central con alta/edición/borrado (día completo,
  mañana < 14:00 o tarde), calendario mensual de toda la plantilla coloreado por tipo y, al guardar, la lista de
  servicios asignados/aceptados en esas fechas con «Devolver para reasignar» (nueva acción de la central `desasignar`,
  por la RPC atómica `transicion_servicio`: «Sin asignar» con alerta y aviso push al conductor). La sugerencia y la
  asignación automática marcan al ausente «No disponible · vacaciones» (o «… (tarde)»); asignarlo a mano pide
  confirmación («Está de vacaciones ese día. ¿Asignar igualmente?», web y app) y el servidor no lo impide pero lo
  registra en el evento («ausente: vacaciones», visible en la actividad). El conductor ve «Próximas ausencias» en su
  pestaña Jornada (solo lectura). Además, el vigilante ya no manda push de servicios cuyas notas empiezan por
  «PRUEBA AUTOMÁTICA». App nativa: solo JS (huella sin cambios). Prueba en producción
  `scripts/prueba-ausencias-jornada.mjs`: 28 comprobaciones OK (devolver/rechazar con «Fin de jornada», el de mañana
  sigue asignado, aviso agrupado en `/api/central/resumen`, «Jornada cerrada hoy» solo para hoy, RLS de ausencias,
  sugerencia y propuesta con «No disponible · vacaciones», tarde libre que bloquea solo la tarde, asignación a un
  ausente registrada, CARGA a 3,0 km → aviso con posición y teléfono, «deshacer + CARGA» sin duplicar, DESCARGA en el
  destino sin alerta y jornada revisada una vez por el vigilante); al final, servicios `es_prueba` y cancelados,
  ausencias de prueba borradas y conductor3 fuera de servicio.

- **Horarios de los conductores y base / depósito (13/10/2026)**. Petición del responsable: «un conductor de VTC trabaja
  normalmente una jornada continuada de una hora a otra y se va a casa, o el coche queda en depósito y lo coge otro
  conductor con otro horario; también puede tener horario partido de mañana y tarde con un rato para comer». Decisión: el
  coche SIEMPRE vuelve a la base y allí se hace el relevo. *Datos* (migración `0029`, aditiva): `ajustes.base_texto/
  base_lat/base_lng` («Base / depósito» en Flota y ajustes con el autocompletado de direcciones), `plantillas_horario`,
  `horarios_conductor` (semana tipo: un día por fila con sus tramos `[{inicio,fin}]` y el vehículo del turno),
  `excepciones_horario` (cambios de un día) y `alertas_horario` (una por caso: clave única). RLS: la central todo; el
  conductor lee lo suyo. Un conductor sin horario sigue disponible todo el día. *Dominio puro*
  `src/lib/dominio/horarios.ts` (48 tests, incluido el cambio de hora del 25/10/2026): tramos del día (excepción > semana
  tipo > sin restricción), en turno, estado del turno («en turno hasta 15:00», «en pausa hasta 16:00», «fuera de
  turno»), `cabeServicio` (la recogida dentro de un tramo; si es el primero del tramo, salir de la base después del inicio;
  si es el último, volver a la base antes del fin, con el modelo de traslado de la planificación), vehículo del turno,
  solape de vehículo entre conductores, alertas y recordatorios. *Central*: página «Horarios» (menú) con la semana tipo de
  cada conductor (continua o partida, «+ añadir tramo», copiar el lunes a todos los días —antes solo a los laborables; el responsable prefirió de lunes a domingo—, plantillas reutilizables,
  vehículo del turno), cambios de un día, vista semanal de toda la plantilla (franjas en turno pintadas, fuera de turno
  rayado y ausencias encima) y aviso si dos conductores comparten vehículo en tramos que se solapan (el relevo 15:00/15:00
  no cuenta). *Asignación*: la sugerencia, la asignación automática, la hoja de ruta (chip «Mejor») y el diálogo de
  asignar (web y app central) marcan no apto con «Fuera de horario (pausa 13:00–16:00)», «No vuelve a la base antes de
  las 15:00», «Empieza antes de su turno…» o «Fuera de horario (libre ese día)»; asignar a mano pide confirmación y el
  servidor no lo impide pero lo registra en el evento («fuera_horario: …», visible en la actividad). Al asignar se usa el
  vehículo del turno (también si la petición no trae vehículo). *Panel*: «Turnos de hoy» con el estado de cada conductor
  con horario; la hoja de ruta pinta la barra de turno de cada columna y marca las tarjetas fuera de turno. *Conductor*
  (PWA y app nativa): «Tu horario de hoy: 08:00–13:00 · 16:00–20:00» en Jornada y, en la app, notificación local 5 min
  antes de cada tramo si no ha iniciado la jornada (expo-notifications ya instalado; se reprograma al abrir la app y al
  cambiar la jornada, y se cancela al iniciarla). *Vigilante* (como mucho una pasada por minuto, push + actividad, gravedad
  aviso, una vez por caso): servicio asignado fuera del horario del conductor; sin iniciar jornada 15 min después del
  inicio de su tramo (solo con el módulo de jornada y sin ausencia); en servicio más de 30 min pasado el fin de su turno
  con servicios que no le dejan volver a la base. App nativa: solo JS (huella sin cambios). Prueba en producción
  `scripts/prueba-horarios.mjs` (conductor de demo sin actividad, horario de prueba solo para mañana): RLS, sugerencia
  dentro/fuera/pausa/no vuelve/día libre, propuesta automática, asignación manual registrada con el vehículo del turno,
  una sola alerta «fuera de horario» (sin duplicar en la pasada siguiente, en `/api/central/resumen`) y limpieza de todo lo creado: 25 comprobaciones OK.
- **Turnos de noche (13/10/2026)**. El responsable intenta crear la plantilla «Nocturno» 22:00–06:00 y el editor lo
  rechaza («no puede cruzar la medianoche»): «¿por qué no? haz que pueda». Ahora un tramo con el fin antes del inicio es
  de noche y acaba al día siguiente (sin cambiar la BD: se guarda igual, `{inicio:"22:00", fin:"06:00"}`). Pertenece al
  día en que empieza, pero su parte de madrugada cuenta también como turno del día siguiente (`intervalosDelDia` añade la
  «cola» de la víspera), así que un servicio a las 03:00 cabe, el estado dice «en turno hasta 06:00», la asignación
  automática no da por libre el sábado a quien sale del turno del viernes y el aviso de fin de turno se vigila pasada la
  medianoche. La vista semanal pinta 22:00–24:00 en su día y 00:00–06:00 en el siguiente; el editor marca «🌙 +1 día».
  Validación: no puede durar cero ni pisar el primer tramo del día (22:00–09:00 con 08:00–12:00 se rechaza) y el solape
  de vehículo tiene en cuenta la madrugada (la furgo del turno de noche choca con quien la coge a las 05:00, no con el
  relevo de las 06:00). Incluye el cambio de hora: la noche del 24 al 25/10 dura 9 h. 10 pruebas nuevas (713 en total).
- **Planificación de horarios por semanas, meses y año (13/10/2026)**. El responsable detecta que, al pasar a la semana
  siguiente y cambiar el horario, «no se mantiene»: la semana tipo es una sola para todas las semanas, así que cambiarla
  mirando la semana que viene cambia también esta. Pide planificar los turnos de un mes o de todo el año, con
  «planificación recursiva» y un botón de copiar al mes siguiente. Diseño (migración `0030`, aditiva): cada día
  planificado es una fila de `excepciones_horario` con `tipo = 'plan'` y su vehículo del turno; manda sobre la semana
  tipo, que sigue siendo la base (y sin nada, disponible todo el día). Los «cambios de un día» de siempre son
  `tipo = 'cambio'` (médico, cambio con un compañero): mandan, pero no se copian ni se pisan. Lógica pura en
  `src/lib/dominio/planHorarios.ts`: copiar un mes al siguiente respetando el día de la semana (cada día toma el de 4
  semanas antes, o 5 si aún cae en el mes nuevo), encadenado hasta el mes que se elija (todo el año = hasta diciembre);
  repetir un bloque de 1–4 semanas hasta una fecha (rotaciones mañanas/tardes) y solapes de vehículo por fecha. En la
  página «Horarios»: pestañas *Semana* / *Mes (planificar)*; en la semana, editar «Solo la semana del …» o la «Semana
  tipo (todas las semanas)»; en el mes, la plantilla × días con 📅/✎, editar un día con un clic, copiar a los meses
  siguientes, repetir semanas y quitar lo planificado del mes. Todos los lectores (vigilante, asignación, app del
  conductor) leen ya el vehículo del día planificado y la víspera (madrugada de los turnos de noche). 10 pruebas nuevas.
- **Búsqueda de direcciones más rápida (13/10/2026)**. El usuario notaba lenta la búsqueda de direcciones y no veía que
  el sistema estuviera trabajando. Medida en producción: todas las consultas a `/api/geocodificar` tardaban 5,1 s, incluso
  repetidas. Causa: el servidor público de Photon tarda 6–7 s, el timeout era de 5 s y se esperaba siempre a los dos
  proveedores, así que cada búsqueda agotaba el timeout y Photon nunca aportaba nada (ni se guardaba en caché). Ahora, en
  cuanto un proveedor responde con resultados, al otro se le dan 600 ms de cortesía; si no llega, se contesta con lo que
  hay y su petición sigue en segundo plano (timeout 8 s) y queda en caché 24 h; no se repite una petición igual en curso
  y se mantiene el límite de 1 petición/s de Nominatim. En el navegador, pausa entre teclas de 250 ms, caché de búsquedas
  recientes e indicador «Buscando…» (icono giratorio accesible). Resultado: de ~5,6 s a 0,6–1,2 s en las consultas
  habituales, solo con servicios gratuitos.
- **Lectura de tickets también en la app nativa (13/10/2026)**. El responsable fotografía un ticket de ejemplo
  (Plenergy, prepago) con la app del iPhone y no se rellena nada: la app nativa solo subía la foto (el OCR, tesseract.js,
  corría en el navegador, solo en la web). Ahora el mismo motor libre corre en el servidor (`src/lib/lector/ocrServidor.ts`:
  un worker reutilizado, cola de uno en uno, se cierra tras 5 min sin uso, idioma cacheado en /tmp; `serverExternalPackages`)
  y `POST /api/conductor/ticket/leer` (Bearer, solo sus fotos, 10/min) devuelve los datos; la app los pone en los campos
  que el conductor no haya tocado y avisa «Leyendo el ticket…» / «Datos leídos: revisa y añade los kilómetros». Además,
  el extractor tolera el ruido del OCR entre etiqueta y número («Litros +: 15,52», «[20,00»), en prepago toma el
  «Total suministrado» y no el reservado, reconoce marcas de gasolinera y nombres comerciales (SP95, Efitec 98, Gasóleo A).
  Medido en producción: primera lectura 1,3 s (arranque), siguientes ~0,7 s; el ticket de ejemplo sale completo.
- **Números del ticket con sentido común y precio del día (13/10/2026)**. Probado con el iPhone (foto a una pantalla), el
  OCR leyó «Litros 16,50 · Precio 1287 · Importe 20,00» (real: 15,52 · 1,289 · 20,00). El responsable pide afinar comas y
  puntos y comprobar el precio en internet: «no puede ser que un litro cueste 1.289 euros». `src/lib/lector/plausibles.ts`
  (puro, con tests): el €/L se coloca dividiendo por 10/100/1000 hasta caer en el rango del combustible; se prueba la
  combinación de litros/€/L/importe que mejor cuadra (litros × €/L ≈ importe, 3 %) y, si ninguna cuadra, se fían el
  importe y el €/L y se recalculan los litros; cada corrección sale como aviso («Litros recalculados…», «1287 → 1,287»).
  El rango del día lo da el *Geoportal de Gasolineras* del Ministerio (servicio público gratuito, sin clave;
  `preciosCarburante.ts`, provincia de Tarragona, caché 6 h, rango orientativo si no responde); solo se compara con
  tickets de los últimos 15 días. La app muestra «Precio de hoy: 1,91 €/L de media, entre 1,60 y 2,21» y avisa si el
  conductor escribe un €/L imposible («1287 €/L no parece un precio por litro: ¿1,287?»). Con la foto del móvil sale
  ahora 15,54 L · 1,287 €/L · 20,00 €.
- **«Foto no válida» al guardar el ticket y kilómetros coherentes (13/10/2026)**. Con la lectura ya bien, el responsable no
  podía guardar: «foto no válida». Causa: `fotoPathValida` exigía la extensión `.jpeg` y la subida guarda `.jpg`
  (`extensionDe`), así que ningún ticket con foto JPEG se podía guardar (web ni app); el test solo probaba `.jpeg`.
  Corregido (`jpe?g`) con test del caso real. Además pide comparar los km con los últimos del coche: `kmMinimo`
  (`src/lib/servicios/tickets.ts`) — un ticket de estos días no puede tener menos km que `vehiculos.km_actuales` (que
  actualizan tickets, hoja de cierre y flota); uno atrasado, no menos que el ticket más alto de ese día o anterior. La app
  muestra «Último registrado de 0001-TDL: 125.600 km», no deja guardar si bajan y pregunta «¿seguro?» si suben más de
  3.000 km de golpe (`GET /api/conductor/ticket`).
- **Litros ↔ €/L automáticos (13/10/2026)**. Petición: «si pongo el €/L que pones aquí, rellena los litros, o al revés;
  como tienes el importe puedes hacer el cálculo». `src/lib/dominio/ticketCalculo.ts` (puro, con tests, compartido por
  web y app): con el importe, el campo del par litros/€/L que el conductor no ha escrito el último se calcula solo
  (marcado «(calc.)») y se recalcula si cambia el importe; nunca se pisa lo que se acaba de escribir. En la app, botón
  «Usar el precio medio de hoy: 1,909 €/L» (Geoportal del Ministerio) que pone ese €/L y calcula los litros.
- **Alertas con el tiempo al día (14/10/2026)**. El responsable abre la central a las 12 y la alerta dice «Oscar no ha
  iniciado la jornada… (hace 15 min)»: el texto se escribió a las 08:15 y no cambiaba. `textoAlDia` (en `actividad.ts`,
  puro con tests) suma a «(hace N min)» y a «N min después de su turno» lo que ha pasado desde que se creó la alerta
  («hace 4 h 50 min»); las tarjetas de aviso de la web y de la app se recalculan al cargar y cada 30 s.
- **Todos los datos del ticket, también los de factura (14/10/2026)**. Con una foto real del iPhone el OCR leía «Litros»
  como «Ele A» y «Precio» como «MECO “1 209»: solo salía el importe y el conductor tuvo que poner el €/L de hoy. Petición:
  «todos los campos que se puedan sacar del ticket, al formulario, de forma automática». Medido con esa foto: pasar la
  imagen a blanco y negro (gris, contraste estirado, umbral 140; `sharp` en el servidor, canvas en el navegador) hace que
  se lean bien todas las líneas. Ahora hay varias pasadas (blanco y negro por bloque, por página y la foto tal cual) que
  se paran en cuanto una lo trae todo, y `mejorLectura` se queda con la que cuadra (litros × €/L ≈ importe) y completa el
  resto con las otras. Datos nuevos (migración `0031`, aditiva): hora, CIF de la gasolinera (solo si su dígito de
  control cuadra, probando las letras que el OCR confunde: 8 → B…), nº de factura, base imponible, % y cuota de IVA
  (se completan entre sí: base + cuota = importe). Salen en el formulario de la app y de la web («Datos de factura») y en
  la tabla de Combustible de la central. Con la foto del iPhone: 25/04/2024 16:55 · PLENERGY · B93275394 ·
  039R2400065003 · 15,52 L · 1,289 €/L · 20,00 € · base 16,53 + IVA 21 % 3,47.
- **OCR medido con un banco de fotos reales (14/10/2026)**. El responsable avisa de que con su última foto la lectura
  «duda» en el 1,289 y antes iba bien: el umbral fijo (140) de la pasada en blanco y negro fallaba con fotos que traen
  bordes oscuros y el moaré de fotografiar una pantalla. Se montó un banco con sus 5 fotos de móvil del mismo ticket
  (9 datos cada una) comparando preparaciones: foto tal cual 13/45, umbral 140 17/45, recorte + umbral 16/45, umbral
  adaptativo 33/45 y **desenfoque gaussiano σ 1,5 + gris + contraste estirado 42/45** (σ 1 34/45, σ 2 40/45, σ 2,5
  22/45). Las pasadas quedan: desenfoque suave → medio → blanco y negro (umbral 120) → tal cual, parando en cuanto una lo
  trae todo; juntas dan **45/45** (casi siempre basta la primera, 2–3,6 s). Además el nº de factura se quedaba en
  «Ticket ejemplo» (primera coincidencia de «ticket») en vez de buscar la que tiene cifras. Navegador: la misma
  preparación con canvas (tres cajas de radio 1 ≈ gaussiana σ 1,4).

- **Pruebas de estrés y auditoría del centro de control (15/10/2026)**. Tres revisiones en paralelo sin escribir en la
  BD compartida (carga y memoria en local con el build de producción + sonda suave a producción; QA en navegador de las
  16 pantallas a 3 anchos; auditoría de código) → `docs/INFORME_ESTRES_CENTRAL.md`, 28 puntos. El responsable aprobó
  arreglarlos todos y se repartieron en agentes por ficheros disjuntos. Lo más grave:
  (1) **fuga de memoria del servidor**: cada página retenía ~75–360 KB (OOM a las ~1 200 páginas con 512 MB). Con un
  perfil de heap por CDP y la diferencia entre dos *heap snapshots* apareció la causa: cada `createClient` de Supabase en
  el servidor arrancaba el temporizador `autoRefreshTicker` de auth-js (por defecto fuera del navegador) que nunca se
  paraba y retenía el cliente y la petición; se crea uno por petición y por pasada del vigilante. Con
  `autoRefreshToken: false` (y el cliente de cookies con `fetch` propio, perfil con `cache()` por petición) el heap se
  queda plano (~80 MB tras 3 000 páginas); `/api/salud` expone la memoria para vigilarla en la evaluación.
  (2) **Cambio de hora**: `madridAUtc("2026-10-25","01:30")` daba las 02:30 (el desfase se medía en la hora leída como
  UTC); ahora se prueban los dos desfases del día y se queda el que da esa hora de pared (tests de otoño y primavera).
  (3) **Carrera reasignar ↔ aceptar**: el cambio atómico solo comparaba el estado; nueva sobrecarga del RPC (migración
  0034) que compara también el conductor leído, y la central envía el estado que ve (`estadoEsperado`).
  Además: alertas de horario que se resuelven solas (0033), tickets anulables y km que no se disparan con tickets
  antiguos (0032), aviso de retraso rearmable por ciclo (0035), índices preventivos (0036), posiciones simuladas
  marcadas (0037), OCR con 2 tickets a la vez como máximo, asignación automática con tope de 300 ms en la mejora (300
  servicios: de 35 s a 0,4 s), datos de prueba fuera de informes/incidencias/panel, calendario, desplegable de
  direcciones, errores 500 por fechas de URL, `error.tsx`/`loading.tsx`, CSV con coma decimal y fórmulas neutralizadas,
  consumo por tramos, combustible paginado, aviso al conductor que pierde el servicio y textos. 812 tests.

- **Portada de reservas en tres idiomas (16/10/2026)**. Petición: convertir la portada de app.transfersvipluxe.com en
  una web de reservas con fondo de la Costa Dorada, formulario simple, castellano/catalán/inglés, botones y letra
  grandes, «un giro atractivo», el acceso de la central como opción premium arriba y privacidad/aviso legal al final
  (la web de WordPress, intacta). `src/app/page.tsx`: idioma por `?lang=` o `Accept-Language` (`src/lib/i18n/portada.ts`,
  con test de que los tres idiomas tienen las mismas claves); paisaje dibujado en SVG (sin fotos de terceros) — cielo
  de atardecer, sol sobre el mar, Cap de Salou con el faro, palmeras del paseo y un coche negro con los faros encendidos
  recorriendo la costa —, animado con CSS y parado con «reducir movimiento»; titular en Playfair Display con el destino
  que va cambiando («Tu traslado privado a PortAventura… el aeropuerto…»). `ReservaRapida`: campos grandes,
  contadores − / + de pasajeros y maletas, vehículo elegido solo (`tipoMinimo`), destinos frecuentes de un toque y los
  errores del servidor traducidos; envía a la misma acción y validación que /reservar (que queda para ida y vuelta o un
  vehículo concreto). `CampoDireccion` acepta textos en otro idioma y estilos más grandes. Botón dorado «★ Acceso
  profesionales · Central y conductores» → /login.
  Después, **privacidad y aviso legal en los tres idiomas** (`contenidoPrivacidad.tsx` / `contenidoAviso.tsx`): mismo
  criterio de idioma (`?lang=` o navegador), selector ES · CA · EN en la propia página, la portada enlaza en su idioma y
  las traducciones avisan de que, si hay discrepancia, prevalece la versión en castellano.

- **Datos de demo y archivado desde el panel en vivo (16/10/2026)**. Petición: un botón para «limpiar todos los
  servicios y todos los históricos» y otro para «meter datos demo… para que un juez… tenga ya cosas funcionando».
  Antes de programar se preguntó: archivar (recuperable) en vez de borrar, todos los servicios, cualquier operador.
  Migración `0038_archivo_servicios.sql`: `archivar_servicios` copia en `archivo_filas` (JSONB) los servicios con sus
  eventos, recorridos, seguimientos, incidencias y alertas, y los quita de las tablas vivas en una sola transacción;
  `restaurar_ultimo_archivo` los devuelve tal cual (enlaces de ida y vuelta incluidos). `src/lib/demo/datosDemo.ts`
  (lógica pura con tests) construye un día de ejemplo relativo a «ahora»: completados, uno con pasajeros y otro de
  camino con su coche en el mapa y una incidencia de retraso, aceptados, uno esperando respuesta, una reserva web, un
  rechazo para reasignar y cinco pendientes de mañana para la asignación automática; clientes inventados y lugares
  públicos. Los botones (`BotonesDatosDemo`) están en la cabecera del panel, con confirmación, mensaje de resultado y
  «Deshacer archivado» mientras haya algo archivado. No se duplica la demo si ya está cargada, y un coche con GPS real
  no se mueve a una posición inventada.

- **Demo viva para el jurado (16/10/2026)**. Petición tras pedir a la IA una valoración del proyecto frente a los
  criterios del jurado: proteger «Archivar», una guía para quien evalúa y una demo que no envejezca (del 20 al 27/10 no
  se puede tocar el código). Al revisar la base apareció que solo hay UNA cuenta de central, la misma para el
  responsable y para el jurado, así que se preguntó de nuevo: del 20 al 27/10 «Archivar» retira solo los datos de demo
  (migración `0039_archivar_solo_demo.sql`, una variante de `archivar_servicios` sobre un conjunto de servicios) y los
  coches de demo se mueven solos. `GuiaJurado` en el panel: seis pasos con enlaces (cargar la demo, mapa, asignación
  automática en la hoja de ruta de mañana, entrar como conductor en incógnito, escanear un ticket, reservar desde la
  portada); se pliega y lo recuerda, y en el móvil empieza plegada. `src/lib/demo/demoViva.ts`, colgado del vigilante:
  cada 5 min mira si la demo tiene más de 4 h y nadie la ha tocado en media hora (de 06:00 a 22:00) y la renueva —la
  vieja se marca `es_prueba` (se oculta, no se borra) y se cierran sus avisos—; cada 30 s mueve los coches con servicio
  (ida y vuelta entre origen y destino, o entre su aparcamiento y la recogida) y cada 3 min refresca los aparcados para
  que no salgan «sin señal». Los coches con GPS real en la última media hora no se tocan. Se quitó el botón manual
  «Simular ruta», que habría peleado con el movimiento automático.

- **La demo trabaja sola (16/10/2026)**. Petición: movimiento suave, servicios que avanzan solos y coches por carretera.
  `src/lib/demo/movimiento.ts` (lógica pura con tests): el conductor de demo acepta a los 4 min si nadie lo hace, sale
  20 min antes de la recogida, avisa de que llega 4 min antes, recoge y termina, con la misma transición atómica que la
  app (`transicion_servicio`) y una marca (`motivo = demo-simulada`) que distingue sus pasos de los de personas. El coche
  avanza sobre rutas reales: `scripts/rutas-demo.ts` las calculó una vez con OSRM (OpenStreetMap, gratuito) para los 36
  pares de lugares de la demo y las guardó simplificadas en `rutasCarretera.ts`, así la app no depende de ningún
  servicio externo. Se queda donde deja al cliente (o vuelve a su base tras un viaje largo); de camino va como mucho a
  60 km/h y, si no le da tiempo, llega tarde y salta el aviso de retraso como en la realidad. No se dan pasos a un
  conductor que una persona está manejando (acciones suyas en la última media hora). En el mapa (`MapaFlota`), cada
  coche se desliza hasta su nueva posición en el tiempo que tardó en llegar la actualización, así parece moverse sin parar.

- **Dictar las direcciones por voz (16/10/2026)**. Petición: un botón para dictar el origen y el destino. Se usa el
  dictado que ya traen los navegadores (Web Speech API: Chrome/Android y Safari/iPhone; gratis, sin servicios nuevos):
  `BotonVoz` dentro de `CampoDireccion`, así sale en la portada, en /reservar y en los campos de dirección de la central.
  Mientras se habla va escribiendo lo que entiende; al terminar limpia el texto (`limpiarDictado`: sin el punto final
  que añade Safari) y lanza la búsqueda de sugerencias como si se hubiera tecleado. Dicta en el idioma de la página
  (es-ES, ca-ES, en-GB), avisa si no hay permiso de micrófono o no se oyó nada, y en navegadores sin dictado (Firefox)
  el botón no aparece. La política de privacidad (en los tres idiomas) explica que el reconocimiento lo hace el
  navegador con el servicio de su fabricante y que la app solo recibe el texto. En la app nativa no hace falta: el
  teclado del móvil ya trae su micrófono.

- **Mapa del conductor con el sentido de la marcha y zoom en los cruces (16/10/2026)**. `src/lib/dominio/rumbo.ts`
  (lógica pura con tests, compartida por la web y la app): rumbo del coche (el del GPS en marcha; parado o despacio, el
  de la ruta; si no, el anterior, para que el mapa no dé vueltas en un semáforo), posición sobre la ruta, próximo cruce /
  giro / rotonda / cambio de sentido (donde la ruta cambia ≥ 40° entre los 25 m anteriores y los siguientes: una curva
  suave no cuenta) y zoom según la velocidad, de cerca ~15 s antes de cada giro. App (MapLibre): mapa «rumbo arriba»,
  inclinado, con el coche abajo y la carretera por delante, flecha de dirección y aviso «↱ Gira a la derecha en 120 m»;
  si el conductor mueve el mapa, deja de seguirle hasta «Centrar». Web (Leaflet no gira el mapa): norte arriba, flecha
  orientada y el mismo zoom automático. Sin dependencias nativas nuevas: se publicó por OTA.

- **Devolver servicios desde la lista (16/10/2026)**. Petición: «un cuadrito con una X» en cada servicio del conductor,
  con confirmación, para devolverlo a la central cuando se acumulan trabajos o la app se queda enganchada (al probarlo,
  un servicio pendiente del día anterior dejaba la app en bucle). `accionDevolver` (con test): asignado → rechazar,
  aceptado o de camino → devolver; con el cliente a bordo, no. En la app y en la web: ✕ en cada tarjeta (motivo y
  confirmación; motivos nuevos «Demasiados servicios» y «La app se ha quedado bloqueada»), «Devolver todos a la central
  (N)» al final de la lista y una sección «De días anteriores, sin terminar» (hasta 2 semanas) para ver y resolver lo
  atascado, que antes no se veía en «Hoy». Todo va por la cola offline (funciona sin cobertura, nunca se duplica) y la
  central recibe la alerta de servicio devuelto/rechazado para redistribuirlo.

- **Reservas con sentido y con hueco (16/10/2026)**. Petición: no aceptar fechas pasadas (con una reserva para hoy a las
  7:00 hecha a las 21:00 salió «Application error») y, antes de registrar la reserva, comprobar si hay algún conductor
  libre; si no, decírselo al cliente y ofrecerle WhatsApp o llamar a la central. `src/lib/reserva/disponibilidad.ts`
  (con tests): mínimo media hora de antelación en la web pública (al principio 1 h; se redujo a petición) (el campo de hora no deja elegir antes y el servidor lo
  rechaza; la central sigue pudiendo registrar lo que entra por teléfono) y enlaces de llamada/WhatsApp con el mensaje
  ya escrito. `hayConductorLibre` reutiliza el motor de sugerencias de la central (horario, ausencias, otros servicios,
  plazas y maletas): si nadie es «apto», la reserva no se crea y la web dice «A esa hora tenemos todos los coches
  ocupados» con «Escribir por WhatsApp», «Llamar a la central» (número en Flota y ajustes, migración 0040), «Elegir otra
  hora» o «Enviar la solicitud igualmente». En los tres idiomas de la portada.

- **Marca ficticia y textos legales de plantilla (16/10/2026)**. Las bases no permiten datos reales y la app llevaba el
  nombre y el logotipo de la empresa real en la que se inspira. Petición: cambiar nombre, logotipo y textos legales por
  una plantilla sin nada real. Se preguntó: nombre «TransferdeLuxe» (el del proyecto), monograma dibujado, el dominio se
  mantiene y la app del móvil cambia también de nombre e icono (nueva compilación). Emblema propio en SVG
  (`src/lib/marca/emblema.ts`: anillo dorado, monograma T·L y arco de carretera, todo con trazos), componente
  `LogoMarca` y `scripts/marca.ts`, que genera desde él los iconos de la web y de la app; se eliminaron los archivos del
  logotipo real. Textos: «TransferdeLuxe Central» (web) y «TDL Conductor» (app), también en los avisos al cliente y la
  página de seguimiento. Privacidad y aviso legal (castellano, catalán e inglés): titular «TransferdeLuxe Demo, S.L.
  (empresa ficticia)» con un aviso de plantilla, los datos que faltan entre corchetes y un correo `.test` (dominio
  reservado que no existe); se quitaron los enlaces a la web real. Orden de publicación: primero lo de dentro de la app
  por OTA (las instaladas lo reciben), después nombre, icono y pantalla de inicio en una compilación nueva.

- **Mapa del conductor a pantalla completa (17/10/2026)**. Petición: al tocar el mapa, ampliarlo a pantalla completa
  con zoom y un botón para volver. El mismo mapa (MapLibre) se monta en la tarjeta o en un Modal a pantalla completa,
  con botones + / − (dejan de seguir al coche hasta «Centrar») y «✕ Salir del mapa»; al cambiar, vuelve a centrarse en
  el coche. El «cuadrito gris» con FPS/GPU que pidió quitar no es de la app: es el HUD de rendimiento gráfico de iOS
  (Ajustes → Desarrollador), que el sistema dibuja sobre cualquier vista Metal como el mapa.

- **Micrófono bien colocado en Safari y «Usar mi ubicación» (17/10/2026)**. En el iPhone el botón de dictar salía
  encima del texto: Safari no calcula «alto 100 % + proporción cuadrada» dentro de un elemento absoluto; ahora es de
  tamaño fijo y centrado (comprobado en Safari del simulador de iPhone y en Chrome a 360 px). Nuevo botón ➤ en la
  dirección de recogida: pide la ubicación al móvil y la convierte en dirección con Nominatim «reverse» (gratuito, en
  el servidor, 1 petición/s y caché); si no responde, se usa «Mi ubicación (coordenadas)», que también sirve para
  recoger. Avisos si no hay permiso o no se encuentra; textos en los tres idiomas; parser con test.

- **Eliminar conductores (17/10/2026)**. Petición: una ✕ roja junto a «Guardar» para eliminar un conductor. Borrar la
  cuenta arrastraría en cascada el registro de jornada (obligatorio 4 años), incidencias, checklists y ausencias, y la
  base de datos no lo permite si tiene servicios o tickets. Por eso: sin historial, se borra del todo; con historial,
  se da de baja (migración 0041: rol «baja» y fecha), su cuenta queda bloqueada, desaparece de listas, asignaciones y
  mapa, y su historial sigue con su nombre; se puede reactivar desde la misma página. Antes, sus servicios por hacer
  vuelven a la central con aviso; si tiene uno en curso, hay que esperar a que lo termine.

- **Privacidad sin perder el formulario y mapa sin indicaciones (17/10/2026)**. Peticiones: al abrir la política de
  privacidad desde la reserva no había botón para volver y, al ir atrás, el formulario salía vacío; y quitar del mapa
  del conductor los carteles «Gira a la derecha…». La política se abre ahora en una ventana encima del formulario
  (`<dialog>` con «Volver al formulario» y su texto cargado solo al abrirla), así que no se sale de la página; las
  páginas legales tienen además «← Volver». En la app se retiró el cartel de giro (el acercamiento automático en los
  cruces se mantiene) y se publicó por actualización en el aire.

- **La central manda sobre cualquier servicio abierto (17/10/2026)**. Petición: un servicio en camino no se podía
  cancelar ni mover desde la central («No se puede cancelar un servicio en estado en_camino»); si el conductor no
  responde, la central tiene que poder hacerlo todo. Las reglas de estados permiten ahora a la central, también en camino
  o con el cliente a bordo: reasignar (el nuevo conductor lo recibe para aceptar), quitar el conductor (vuelve a «Sin
  asignar»), cancelar, subcontratar y la acción nueva «Cerrar como completado» (mismo evento que la DESCARGA, con el
  motivo «Cerrado por la central», para que cuente en informes y recorridos). Al conductor que lo pierde le llega un aviso.
  Nuevo «✏️ Editar servicio» en la ficha: hora, direcciones, pasajeros, maletas, vehículo, vuelo, cliente y notas en
  cualquier estado; recalcula la duración si cambia el trayecto, deja en el historial qué cambió y avisa al conductor.
  La app (modo central) también permite reasignar en curso. Tests de las reglas y de la detección de cambios.

- **Una empresa de demo que funciona sola durante la evaluación (18/10/2026)**. Petición: que quien entre durante la
  semana vea la empresa viva, sin servicios caducados, con conductores que trabajen como personas y que, si no hay coche
  libre al reservar, se ofrezca otra hora o el contacto con la central. Se ocultaron (sin borrar) todos los servicios de
  prueba y de ejemplo, y se montó una plantilla que cubre las 24 h con relevos (mañana 06:00–14:30, tarde 13:30–22:00,
  noche 21:30–06:30). `src/lib/demo/empresaDemo.ts` (lógica pura, determinista por franja de 30 min) genera las reservas
  que van llegando con antelación variable (llegadas y salidas de Reus, Barcelona, AVE, trayectos locales; ≈ 8–10 al día,
  más de día que de noche) y decide la jornada de cada conductor; `empresaViva.ts` lo aplica desde el vigilante: entran
  las reservas «ya hechas», la central automática asigna lo que empieza en las próximas 4 h al conductor apto (o lo
  subcontrata si no hay nadie libre a 75 min), y los conductores fichan y revisan el coche al empezar el turno, hacen una
  pausa a media jornada cuando están libres y, al acabar (o al terminar el servicio que llevan), presentan la hoja de
  cierre con los km del día y quedan «fuera de servicio». Genera además el historial de la última semana (servicios hechos
  o subcontratados, jornadas con pausa) para Jornadas, Informes y Viajes. En la reserva sin hueco se ofrecen hasta tres
  horas cercanas con coche libre («Reservar a las 16:30»), además de WhatsApp o llamada. Si alguien archiva, no entran
  reservas durante 3 h y «✨ Cargar datos de demo» la vuelve a poner en marcha.

- **Revisión final de funcionamiento y límites (17/10/2026)**. Pruebas de carga y memoria (build de producción en local y
  sonda suave a producción), base de datos y dos revisiones de código en paralelo → `docs/INFORME_REVISION_FINAL.md`.
  Arreglos aplicados con el visto bueno del responsable: límites de peticiones que se saltaban inventando la IP, guardas
  para no quitar un servicio en marcha sin querer, relevo con el cliente a bordo, aviso al conductor que pierde un
  servicio (app y web), mapa a pantalla completa del iPhone, devueltos que desaparecían, reabrir un cierre de la central,
  marca de demo al editar, recorridos, cola común de Nominatim, sesión verificada en local (`getClaims`) y consultas en
  paralelo (página del conductor de 394 a 221 ms).

- **Empezar y terminar jornadas desde la central (17/10/2026)**. Petición: poder abrir y cerrar la jornada de los
  conductores. En Jornadas hay un panel «Ahora» con el estado de cada conductor y «Empezar / Terminar jornada» a la hora
  que se indique (por defecto ahora; nunca en el futuro, como mucho 48 h atrás, sin solaparse con la anterior ni cerrar
  antes del inicio o de la pausa en curso). Para el registro horario queda quién lo hizo (migración 0042: `inicio_por`,
  `fin_por`), con la marca «✎ central» en la tabla y una columna en el CSV; el conductor recibe un aviso.

- **Historial de prompts sin la marca real (17/10/2026)**. El registro automático y las transcripciones pasan por
  `scripts/anonimizar.py`, común al hook y al exportador: marca, web e identificadores de la empresa real, nombres,
  teléfonos, correos y direcciones privadas se sustituyen por etiquetas ([marca real], [teléfono omitido]…). Los
  literales que busca están en un fichero local ignorado por git, para que el propio script no los publique.

- **Grabación de las tomas del vídeo (18/10/2026)**. La IA graba las tomas en el simulador de Xcode: el móvil del
  cliente y la app nativa del conductor en un iPhone 17 Pro (build de EAS con el perfil `simulador`, sin compilar en
  local) y la central en un iPad Pro en horizontal, los dos grabando a la vez (`simctl io recordVideo`) para la pantalla
  dividida de la toma 5. La posición del conductor se simula con `simctl location` (de camino al aeropuerto y de allí
  a Tarragona), la hora de la barra de estado se fija y el ticket de la toma 8 es el de ejemplo. Las tomas en bruto
  quedan en `docs/video/tomas/` (fuera de git por tamaño).

- **Montaje del vídeo (18/10/2026)**. La IA monta el vídeo con ffmpeg (`scripts/montaje_video.py`): de cada toma elige
  los tramos que se ven en su bloque (acelerando las esperas), gira las del iPad, pone la toma 5 en pantalla dividida
  (central y app del conductor grabadas a la vez), añade un rótulo por bloque con fondos generados con Pillow, coloca
  cada voz en off al empezar su bloque y normaliza el volumen. Resultado: 1080p, 4:43, fuera de git
  (`docs/video/TransferdeLuxe_video_demo.mp4`). La frase 2 de la voz se cambió para describir lo grabado: sin coche
  libre, la web propone otras horas.
  Después se subtitula (`scripts/subtitular_video.py`): el texto de la voz en frases cortas, sincronizadas con las
  pausas reales de cada audio (`silencedetect`), en blanco con borde negro en la parte inferior, y además un
  `.srt` (`docs/video/TransferdeLuxe_video_demo.srt`) para subirlo como subtítulos a YouTube o Drive.

## 6. Challenges y soluciones
- **Contraseñas filtradas sin plan Pro (15/10/2026)**. El advisor de seguridad de Supabase avisa de que la
  protección de contraseñas filtradas está desactivada, pero solo existe en el plan Pro. Con el plan gratuito se
  endureció lo disponible en Authentication → Email: longitud mínima 10, minúsculas + mayúsculas + números y cambio de
  contraseña solo con sesión reciente (24 h). Las reglas se aplican al crear o cambiar contraseña, no al iniciar sesión,
  así que las cuentas de demo siguen funcionando.
- **El OCR del servidor funcionaba en local y se colgaba en Hostinger (13/10/2026)**. Síntoma: la lectura agotaba
  siempre el tiempo, sin ningún error. Se añadió un diagnóstico que devuelve los pasos del arranque y se fue acotando
  despliegue a despliegue: no era la memoria (WebAssembly sí reservaba memoria) ni los hilos; el último paso visible era
  «initializing tesseract». Al correr el worker en el propio proceso y capturar los `printErr` de emscripten apareció la
  causa real: `ENOENT … tesseract-core-simd-lstm.wasm`. El despliegue de Hostinger solo sube los ficheros que el código
  requiere de forma estática (el *file tracing* de Next), y el `.wasm` se lee en tiempo de ejecución; en el hilo aparte el
  error se perdía y la promesa no terminaba nunca. Solución: `outputFileTracingIncludes` con el motor para esa ruta, el
  worker en el proceso (los errores llegan) y corte inmediato si el motor falla. Lección: en un hosting con *tracing*,
  todo lo que se carga dinámicamente (wasm, datos) hay que declararlo, y los errores de un hilo hay que traerlos al principal.
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
- **La demo envejece durante la evaluación**: primero se añadió un reinicio diario automático; después, a petición del
  responsable (sus datos debían conservarse), se eliminó y se insertaron servicios de ejemplo para los días de evaluación sin borrar nada.
- **Revisiones que encontraban fallos reales**: carreras en la cola offline, pulsaciones duplicadas, fechas
  imposibles, enlaces ida/vuelta sin comprobar errores, rutas de foto de otro conductor, límite de reservas por IP
  falsificable… Todos se corrigieron con tests que los reproducen.

- **Rutas sin API de pago**: se usa el servidor demo gratuito de OSRM (`router.project-osrm.org`) a través de un proxy
  propio con User-Agent, timeout de 8 s, caché y límite por usuario. Si falla o tarda, la API devuelve una ruta en
  línea recta (×1,3) marcada como «aproximada»; nunca un 500. Para producción real habría que alojar OSRM propio.
  Para no abusar del servidor público: caché de fallos 60 s, máximo 1 petición/s y 50/min globales, y peticiones
  idénticas agrupadas. Las coordenadas del conductor se envían a ese servidor público de OSRM (aceptable con datos
  de demo; en producción, OSRM propio). Destinos fuera de Cataluña → ruta recta sin consultar OSRM.
- **«Llegando» que no caducaba tras recargar la central**: la carga inicial solo traía los avisos, no los eventos
  posteriores. Ahora trae todos los eventos de los últimos 20 min y además se exige que el estado del servicio
  siga correspondiendo (recogida ⇔ aceptado/en camino; destino ⇔ con pasajeros). El aviso a la central solo se da
  por enviado cuando el servidor confirma; si falla, se reintenta en un fix posterior.
- **Avisos que parpadean en el límite**: con el GPS oscilando en torno a 500 m el aviso entraba y salía. Se añade
  histéresis (entrar a 500/100 m, salir a 600/150 m) y cada aviso suena una sola vez por objetivo (sessionStorage).
- **GPS solo con la app abierta**: una web no puede seguir la ubicación en segundo plano; la navegación funciona
  mientras la pantalla del servicio está abierta. Para probar sin moverse, en desarrollo `?simular=lat,lng` fija
  una posición (y no envía el aviso a la central para no tocar datos reales).
- **Huecos de GPS en iPhone (hasta 30 min sin posiciones con la app abierta)**: en producción el conductor enviaba
  cada ~15 s mientras todo iba bien y luego dejaba de enviar durante minutos. iOS solo da GPS a una web en primer
  plano y, al bloquear la pantalla o cambiar de app, mata el `watchPosition` y a menudo no lo reanuda al volver;
  nuestro código nunca lo reiniciaba. Además un insert colgado (red móvil) dejaba la promesa `pendiente` sin
  resolver y bloqueaba todos los envíos siguientes. Solución: gestor único de GPS por página
  (`src/lib/gps/gestor.ts`) compartido por el interruptor y la navegación, que reinicia el watch al volver a primer
  plano (`visibilitychange`/`pageshow`/`online`) y con un watchdog si pasan 30 s sin fix, con `getCurrentPosition`
  de respaldo; el insert tiene timeout de 10 s, los errores se registran y se reintenta (refrescando la sesión si
  el JWT caducó); y la cabecera muestra «📍 última posición enviada hace Xs», en rojo si pasa de 60 s.
  Decisiones puras testeadas en `tests/unit/gps.test.ts`. Límite que no se puede saltar: con la pantalla
  bloqueada una PWA en iOS no envía posición.
- **App nativa dentro del repo web**: había que compartir `src/lib/dominio/*` sin que Next/tsc/eslint/vitest
  analizasen `movil/`. Solución: `movil/` excluido en la raíz; en la app, Metro vigila `../src` y los alias
  `@dominio/*` y `@/*` (este último para las importaciones internas de dominio) salen de `movil/tsconfig.json`.
  `eas init` no puede escribir en `app.config.ts` dinámico: el `projectId` se añadió a mano.
- **Km del vehículo sin carreras al registrar mantenimientos**: leer y escribir `km_actuales` desde la app podía
  pisar un valor mayor. Solución: función SQL `registrar_mantenimiento` (solo service role) que inserta y hace
  `greatest(km_actuales, p_km)` en la misma transacción. En informes no hay ruta guardada: los km se estiman con la
  distancia recta × 1,3, y el consumo mensual usa el último ticket anterior al mes como km de partida.
- **Reajuste de recogida por vuelo sin sorpresas**: el operador ve la propuesta y confirma; el servidor recalcula la hora
  con la llegada guardada y rechaza si no coincide con la que vio, y el `update` excluye servicios ya recogidos o
  cerrados. `/reservar` pasa de estática a ISR (5 min) para respetar el módulo activado sin perder la caché de la CDN.

- **Jornada sin estados imposibles ni dobles toques**: índices únicos parciales (una jornada abierta por conductor y
  una pausa abierta por jornada) y transiciones validadas en el dominio; repetir una acción ya aplicada responde ok.
  La jornada es independiente del interruptor GPS «En servicio»: al finalizar solo se sugiere ponerse fuera de servicio.
  El checklist se hace idempotente con `unique (conductor_id, vehiculo_id, fecha)` y «quitar» un ítem lo desactiva
  para no romper revisiones antiguas.

- **Un rol que es dos roles**: en vez de un tercer rol (que obligaba a tocar el enum, la RLS y cada `if`), un booleano
  `conduce` en el operador. La RLS ya filtraba por `conductor_id = auth.uid()` y no por rol, así que no hubo que
  cambiarla; la regla de seguridad sigue siendo «el servicio está asignado a quien actúa».
- **Push a la central sin cron externo ni duplicados**: vigilante dentro del proceso Next (un solo proceso en Hostinger)
  con protección contra solapes y un cursor en BD que avanza antes de enviar (ante un fallo se pierde un aviso, nunca se
  repite). No arranca en build, en tests ni sin service role; con `VIGILANTE_PUSH=off` se desactiva.
- **Modo central sin tocar lo nativo**: la app se actualiza por EAS Update (huella `fingerprint`), así que el modo
  central usa solo dependencias ya instaladas y se comprueba que la huella no cambia. Para no duplicar pantallas, la
  pestaña «Mis servicios» reexporta la pantalla «Hoy» del conductor, y las rutas de la central viven en `app/central/`
  (no en un grupo) para no chocar con `/` del conductor; si entra un operador en las pestañas del conductor, se le
  redirige a `/central`.

- **Incidente del 11/10: conexión muerta**. La app nativa dejó de funcionar en producción por tres fallos que se
  realimentaban: (1) la CDN de Hostinger respondía un 403 en HTML («Checking your browser») que la app trataba como
  error transitorio y reintentaba sin espera; (2) `movil/lib/push.ts` escuchaba `addPushTokenListener` para volver a
  registrar el token, pero `getExpoPushTokenAsync` dispara ese mismo evento: bucle infinito de ~40 peticiones/s a
  `/api/conductor/push-token`, cada una con `auth.getUser` + `select perfiles` en Supabase, que calentaba el móvil y
  saturaba el único proceso Node; (3) `fetch` sin tiempo máximo dejaba botones «enviando» para siempre. Además de
  corregir los tres, se blindó el sistema para que un cliente defectuoso no lo tumbe y la app se recupere sola:
  - *Cliente*: todo `fetch` con tope (15 s API, 20 s Supabase, 45 s fotos); la cola de acciones (compartida web/app)
    guarda `proximoIntento` y reintenta con backoff exponencial con jitter (2 s, 4 s, 8 s… hasta 5 min) y respetando
    `Retry-After`; solo un gesto del usuario o la vuelta de la red/servidor fuerza el envío. Un estado de conexión
    por destino (API / Supabase) detecta red caída, 5xx, 429 y HTML donde se esperaba JSON, comprueba con sondas
    baratas con backoff (tope 60 s, solo en primer plano) y, al volver, vacía la cola y recarga las pantallas. Las
    recargas nunca se solapan (se agrupan en una), las posiciones en vivo de la flota recargan el resumen de la central
    como mucho cada 15 s (antes, una vez por posición de cada conductor), el aviso «llegando» reintenta con backoff y
    deja de insistir ante un rechazo 4xx, y el interruptor GPS lee el disco cada 5 s en vez de cada segundo.
  - *Servidor*: antes de tocar Supabase, límite por IP (300/min; 1200 si no llega IP) y por token (120/min) con 429 +
    `Retry-After`; caché en memoria de la verificación del JWT por su hash SHA-256 (60 s, nunca más allá de `exp`,
    tokens rechazados 30 s, máx. 1000 entradas) con una sola verificación en vuelo por token; un JWT caducado se
    rechaza sin consultar; si Supabase no responde, 503 + `Retry-After` (sin cachear) en vez de un 401 que forzaba
    refrescos de sesión. `GET /api/salud` sin auth (la BD se comprueba como mucho cada 30 s para todo el proceso,
    con tope de 3 s). El cliente admin de Supabase lleva tiempo máximo (20 s) para que ninguna consulta colgada
    bloquee el proceso, y el vigilante de push encadena `setTimeout` (nunca se solapa) con backoff si falla.
  - *Web*: los hooks de Realtime comparten un freno de `router.refresh` (1 cada 10 s) para que un socket que
    «parpadea» no provoque refrescos en cascada; las alertas de módulos agrupan ráfagas (1 recarga cada 3 s).
  Riesgos que quedan: el 403 de la CDN sigue dependiendo de la configuración de Hostinger (la app ya no lo
  amplifica); los límites son en memoria de un proceso (suficiente con un solo proceso Node); y la caché de 60 s
  hace que un cambio de rol o una baja tarde hasta 1 min en aplicarse a la app.
- **Sonidos sin ficheros ni dependencias nuevas (11/10/2026)**: los navegadores no dejan sonar audio sin un gesto
  previo y, si se pide sonido con el AudioContext suspendido, los pitidos se acumulan y suenan todos de golpe al
  primer clic. Solución: desbloqueo en el primer clic/tecla (y en los siguientes si el sistema lo vuelve a suspender)
  y, si el audio no arranca al momento, el sonido se descarta. En la app no se podía añadir `expo-av`/`expo-audio` ni
  sonidos propios (cambiaría la huella nativa y obligaría a un build nuevo), así que el «sonido» es una notificación
  local con el sonido del sistema; el push del servidor de lo mismo llega hasta 20 s después (vigilante), y el
  manejador de notificaciones lo deja solo en la lista si la app ya lo anunció. Límite conocido: en iOS el
  interruptor de silencio apaga el sonido de las notificaciones (las «alertas críticas» requieren un permiso
  especial de Apple); queda la vibración.
- **«Zona con nombre» sin geocodificación inversa (11/10/2026)**: Nominatim/Google para cada movimiento serían
  llamadas externas (límites de uso, latencia, coste o datos enviados fuera). Solución: lista local de ~60 localidades
  y puntos frecuentes con su centro y la más cercana por distancia (Haversine), con artículo para aeropuertos y
  estaciones («cerca del Aeropuerto de Reus»). Es aproximado pero suficiente para que la central sepa dónde está el
  problema; si no hay coordenadas en la incidencia se usa la última posición del conductor.
- **Un mismo feed en la web y en la app sin duplicar lógica (11/10/2026)**: la web construye la actividad en el
  navegador con los datos de Realtime (cero peticiones extra por movimiento) y la app la recibe ya construida en el
  resumen (el servidor llama a la misma función pura). Las fechas llegan con formatos distintos desde la API REST y
  desde Realtime, así que se ordena por instante (`Date.parse`) y no por texto. Para no crear bucles de red en la
  app, los cambios de eventos, incidencias, checklists y jornadas se agrupan en la misma recarga diferida (800 ms)
  que ya tenían los servicios; la alarma insistente se para en cuanto la grave deja de estar pendiente.
- **Avisar del retraso sin cobertura y sin duplicados (11/10/2026)**: el aviso del móvil depende de su red y de que
  tenga la pantalla abierta, así que el aviso «definitivo» lo genera el servidor. Para que el vigilante (cada 20 s) y
  pg_cron (cada minuto) no lo dupliquen, la base de datos lo garantiza con un índice único parcial
  (`eventos_servicio (servicio_id) where tipo = 'retraso_recogida'`) y `insert … on conflict do nothing`. La ventana de
  6 h evita que los servicios antiguos que se quedaron «aceptado» inunden la actividad el día que se activó. En el
  móvil, el envío se marca en memoria antes del `await` (nunca dos a la vez), se persiste solo con respuesta OK y los
  fallos esperan 60 s; la ETA se redondea a 15 s para no re-renderizar la pantalla con cada fix del GPS.
- **Deshacer sin abrir una puerta trasera (11/10/2026)**: «volver atrás» no puede servir para reescribir el historial ni
  pisar decisiones de la central (el evento «deshecho» queda registrado). Por eso el servidor (no el móvil) decide con los eventos del servicio: solo el último
  evento de acción, solo si es el paso del propio conductor y de hace ≤ 10 min. La comprobación se hace antes de
  consumir el `idAccion` (un rechazo no deja la acción «procesada») y el cambio va por la RPC atómica con el estado
  esperado, así que si la central actúa a la vez solo gana uno. Con cobertura intermitente, el toque de deshacer entra
  en la misma cola ordenada que el paso (DESCARGA y luego deshacer llegan en orden); la cuenta atrás del botón usa la
  hora local del toque, algo más prudente que la del servidor. El origen «central» lo pone solo el servidor en las
  rutas de la central, nunca el cuerpo de la petición.
- **Guardar la ruta sin depender de que el móvil «cierre» el viaje (11/10/2026)**: las posiciones pueden llegar tarde
  (cola offline), un viaje puede deshacerse y volver a completarse, y PostgREST devuelve como mucho 1000 filas. Por
  eso el recorrido lo calcula el servidor a partir de los eventos (siempre el último «completado»), con paginación de
  posiciones, refresco durante 15 min tras completar y `upsert` por servicio (repetirlo no duplica nada). Los
  servicios sin GPS también se guardan (vacíos, «Sin GPS»), para no reintentarlos en bucle. Con el filtro de
  200 km/h, las ráfagas de ruido del GPS con horas casi iguales se toleran (< 50 m) y un primer punto erróneo no
  arrastra al resto. En la app nativa no había `react-native-svg` (añadirlo exige compilar de nuevo): la miniatura se
  dibuja con Views giradas, con la línea ya simplificada a nivel de píxel para no crear cientos de vistas.
- **Cerrar la jornada y guardar la hoja sin estados a medias (12/10/2026)**: si la hoja se guardaba y la jornada se
  finalizaba en dos llamadas, un corte de red entre ambas dejaba la jornada abierta con su hoja ya enviada (o al revés).
  Por eso todo va en una función SQL (`cerrar_jornada`) con la jornada bloqueada `for update`: cierre + km + fin de
  pausas y jornada, o nada. La idempotencia cubre los reintentos del móvil sin cobertura (`idAccion` único y un cierre
  por jornada); si la respuesta se perdió y el reintento llega sin jornada abierta, se reconoce el cierre reciente y se
  responde OK. Para que la app instalada (sin la hoja) no se salte el control, el servidor rechaza «finalizar» suelto
  cuando la hoja es obligatoria, con un mensaje que pide actualizar la app. En la PWA, una regla global (botones ≥ 44 px
  en móvil, fuera de las capas de Tailwind) estiraba las zonas del diagrama y lo deformaba: se anula con estilo en línea
  y los rótulos IZQUIERDA/DERECHA pasan arriba en pantallas estrechas para que las zonas lleguen a ~40 px. Las hojas de
  las pruebas automáticas («PRUEBA AUTOMÁTICA…») no envían push a la central.
- **Un solo GPS para dos botones (12/10/2026)**: con «Iniciar jornada» encendiendo el GPS y el interruptor «En
  servicio» de la cabecera también, había riesgo de dos estados distintos (la jornada creyendo que el GPS iba y la
  cabecera mostrando «Fuera de servicio», o permisos pedidos dos veces con textos diferentes). Solución: el
  encendido/apagado se sacó del componente a funciones compartidas (`encenderServicio` / `apagarServicio`) que usan el
  mismo flag persistido de la tarea en segundo plano, y quien cambia el GPS emite un evento en memoria; el interruptor
  se resincroniza leyendo ese flag (no se pasan estados entre pantallas). La pantalla explicativa de «Ubicación
  Siempre» devuelve una promesa, así el mismo flujo vale para los dos sitios. En la PWA, igual con eventos del
  navegador sobre `InterruptorServicio`. Para que una incidencia de prueba no despierte al responsable, el vigilante
  ignora también las incidencias «PRUEBA AUTOMÁTICA…».
- **Buscar empresas por nombre sin Google (12/10/2026)**: la empresa de ejemplo del responsable no está en
  OpenStreetMap, y Nominatim exige casi el nombre exacto. Photon (sobre OSM) tolera mejor los nombres y encuentra
  hoteles y comercios, pero no admite `lang=es` (devuelve 400: solo default/de/en/fr), así que se usa `lang=default`
  (nombres locales). Para lo que no está en OSM, los clientes habituales se guardan una vez como «Lugares de la
  empresa» y salen los primeros. Como son datos privados de clientes, no pasan por la ruta pública de búsqueda: se
  cargan con la página de la central (servidor, `clienteAdmin`) y se filtran en el navegador. Google Places queda
  preparado detrás de una variable de entorno, sin clave, para no generar costes.
- **Direcciones de calle que no salían (13/10/2026)**: Photon y Nominatim buscan por palabras; «Dr.», «3-1»,
  «Tarragona» (provincia) o «hotel» delante del nombre bastaban para quedarse sin resultados, y sin limitar la zona
  «Carrer Barcelona 10 Salou» casaba con una calle «de Salou» en Barcelona. Solución: limpiar la consulta con reglas
  puras y probadas, detectar la localidad (descartando la que forma parte del nombre de la calle) y buscar solo en
  una caja a su alrededor. Dos detalles salieron en las pruebas: un piso ordinal sin portal («Las Mimosas 3o 1a») se
  tomaba por el número, y la calle «aproximada» llegaba a tapar la dirección exacta al deduplicar; los dos quedaron
  cubiertos por tests. Para no saltarse el límite de 1 petición/s de los servicios gratuitos con dos consultas
  seguidas (la limpia y el respaldo), el límite pasó de «si está ocupado, se salta» a una cola corta (hasta 2 s).
  Ya desplegado, «hotel piramide salou» seguía vacío aunque Photon sí devuelve hoteles: medido con una sola petición,
  Photon tarda 7,2 s con «hotel» en la consulta (más que el timeout de 5 s), y responde al momento sin él. Por eso las
  palabras genéricas («hotel», «hostal», «apartamentos», «camping»…) se quitan ya de la consulta principal cuando queda
  algo más que la localidad («hotel piramide salou» → «piramide Salou»).
- **Avisar al cliente sin pagar una API (13/10/2026)**: la API oficial de WhatsApp Business cobra por mensaje y exige
  plantillas aprobadas por Meta; para la demo se usa el enlace `wa.me` con el texto ya escrito (el conductor solo pulsa
  «enviar») y SMS como alternativa. Como el enlace de seguimiento es público, el token es aleatorio de 32 bytes, la
  tabla no tiene políticas RLS (solo la lee el servidor), la ruta pública construye la respuesta campo a campo (estado,
  posición, ETA, nombre de pila y vehículo; nunca datos del cliente) y caduca a los 30 min del final. Al devolver un
  servicio el conductor deja de ser el asignado y ya no puede leerlo: la app guarda una copia local para ofrecer el
  aviso del cambio, y el servidor le permite redactarlo si fue él quien lo devolvió en las últimas 6 h. Un detalle
  salido de los tests: el aviso al cliente era el «último evento» del servicio y tapaba la tarjeta «Llegando» de la
  central; ahora `llegandoReciente` lo ignora.

- **Asignar automáticamente sin que nadie llegue tarde (13/10/2026)**: un reparto «óptimo» (programación lineal
  entera) sería opaco, lento de validar y no determinista entre versiones; se optó por una heurística explicable
  (inserción voraz por hora + mejora local) con una regla dura que se comprueba siempre igual: la llegada desde el fin
  del servicio anterior debe dejar el margen mínimo, y el siguiente compromiso también. Para que el servidor no se fíe
  del navegador, la confirmación recalcula todo con los datos del momento y salta lo que haya cambiado; y para los
  reintentos sin cobertura el `idAccion` se deriva del lote, así un doble clic no asigna dos veces. Los tests incluyen
  escenarios generados con semilla fija (30 servicios, 6 conductores, un vehículo en taller, compromisos y posiciones)
  con una auditoría independiente de solapes, márgenes y capacidad para las tres estrategias. El tope de
  «equilibrado» tuvo que ser blando: con vehículos de distinta capacidad, a veces solo un conductor puede llevar un grupo.
- **Semáforo sin llamar a OSRM en cada carga**: calcular la ruta real de cada servicio en cada refresco del panel
  dispararía el límite del servidor público (1 petición/s). El semáforo usa el modelo de traslado (instantáneo, también
  en el navegador con los datos en tiempo real) y solo la duración del servicio aprovecha una ruta OSRM si ya estaba en
  caché. El orden importa: si el conductor lleva pasajeros, su ETA a la siguiente recogida pasa por el destino actual.
- **Que el cierre de jornada no deje servicios desatendidos sin romper apps antiguas (13/10/2026)**: bloquear el cierre
  en el servidor dejaría colgadas las apps que aún no preguntan (iPhone pendiente de compilar). Por eso la pregunta
  vive en el cliente y el servidor solo vigila: el vigilante revisa cada jornada cerrada una vez, con 2 minutos de
  gracia para que lleguen las devoluciones que la cola offline envió justo antes de cerrar (si no, avisaría de
  servicios que ya estaban devueltos). La revisión se «reclama» con un `update … where pendientes_revisada_en is null`,
  así dos instancias del servidor no avisan dos veces. Para la anomalía de CARGA, la posición del conductor no viaja con
  la acción (la cola offline no la lleva y cambiarlo exigiría tocar apps instaladas): se busca la posición más cercana en
  ±2 min en la tabla de posiciones; un índice único parcial garantiza una alerta por servicio y tipo aunque el
  conductor deshaga y vuelva a marcar. En las ausencias, la media jornada se decide por la hora de recogida en Madrid
  (mañana < 14:00), con la misma función en la central, el servidor y los tests.

- **Horarios sin romper la asignación existente (13/10/2026)**: el horario es opcional (sin filas = disponible todo el
  día) y se carga junto a las ausencias en `cargarDisponibilidad`; si las tablas fallan, devuelve vacío y nunca bloquea
  asignar. Las horas se guardan como hora de pared de Madrid («08:00») y se convierten a instantes con `madridAUtc` el día
  concreto: así un turno de 00:00 a 06:00 del 25/10/2026 dura 7 h y el de 08:00 sigue empezando a las 08:00 tras el
  cambio de hora. «Primero/último del tramo» se decide con la agenda del conductor dentro de ese tramo: solo el primero
  sale de la base y solo el último tiene que volver a ella. Las alertas del vigilante no dependen de su cursor: se
  insertan con `ON CONFLICT DO NOTHING` sobre (tipo, conductor, clave) y solo se avisa si la fila es nueva, así dos
  instancias o dos pasadas nunca duplican.

- **Vaciar el panel sin perder nada (16/10/2026)**: borrar de verdad los servicios arrastra en cascada el historial
  (eventos, recorridos, incidencias, alertas) y no tiene vuelta atrás. En lugar de añadir una columna «archivado» y
  filtrarla en las decenas de consultas de la app, las filas se mueven tal cual a una tabla de archivo (JSONB) dentro
  de una función SQL y se devuelven con `jsonb_populate_record`. Se probó en producción dentro de una transacción
  deshecha: 143 servicios, 489 eventos, 47 recorridos… quedaron en 0 y, al restaurar, con sumas de control idénticas.
  La carga de demo también se ensayó con inserciones en una transacción que acaba en excepción (no queda nada), y así
  apareció un fallo antes de publicar: las posiciones de los coches aparcados llevaban un campo de más (el nombre del
  lugar) y la inserción habría fallado. Ahora un test comprueba que solo llevan columnas de la tabla.

- **Una demo que se renueva sola sin pisar a nadie (16/10/2026)**: con el servidor posiblemente en varias instancias,
  dos podrían renovar a la vez y duplicar la demo. La renovación se «reclama» con el propio `update … set es_prueba =
  true where … es_prueba = false returning id`: Postgres bloquea las filas y la segunda instancia, al reevaluar el
  filtro, no obtiene ninguna y no carga nada. Para no cambiarle los servicios a un juez que está probando, solo se
  renueva si no hay acciones de personas (eventos con actor) en la última media hora; los avisos automáticos no
  cuentan, y si esa consulta falla no se renueva. Los datos de demo tampoco mandan avisos al móvil de la central ni
  generan «anomalías» de carga/descarga (sus coches son simulados). Las consultas se comprobaron contra la base real en
  modo lectura y «Archivar solo demo» en una transacción deshecha: retiró los 15 de demo, dejó los 143 servicios y 489
  eventos restantes intactos y «Deshacer» los devolvió con la misma suma de control.

- **Conductores «colapsados» que no podían atender un servicio nuevo (16/10/2026)**: la central asignó un servicio
  urgente a Marc y luego a Laia y ninguno lo podía atender. Mirando la base: Laia tenía tres asignaciones del día 13 sin
  responder, y la pantalla «Servicio nuevo» (web y app) enseñaba primero la asignada hace más tiempo; la de ahora
  quedaba detrás, y «Ver más tarde» solo las apartaba mientras la app seguía abierta, así que al volver reaparecían
  (el «bucle»). Arreglo: `siguienteNuevo` (en `plazo.ts`, compartido por la web y la app, con test) enseña primero la de
  recogida más próxima y deja de ofrecer las que tienen la recogida pasada hace más de 6 h (la central las ve en
  «Atrasados»). La asignación ya comprobaba el horario y los demás servicios del conductor (avisa, no impide).

- **«Application error» al reservar (16/10/2026)**: no se reproducía ni en local ni en producción con una página recién
  abierta. La causa más probable: el formulario llevaba abierto desde antes de un despliegue y la página vieja llamó a
  una acción de servidor que ya no existía con ese identificador, cosa que Next.js trata como un fallo de la página.
  Ahora el envío captura ese error y ofrece «Recargar la página». Además, los formularios se envían a mano (no con
  `action=`): React 19 vaciaba todos los campos tras cada envío, así que un simple error obligaba a rellenarlo todo otra vez.

- **Un coche de demo en el mar (17/10/2026)**: el coche de Oscar aparecía frente a Cambrils, en el agua. Estaba
  aparcado donde dejó a su último cliente, «Miami Platja · centro», y esa coordenada de la demo estaba mal (3 km mar
  adentro). Se comprobaron todos los lugares de la demo contra el mapa de carreteras (OSRM «nearest»): Miami Platja era
  el único fuera de tierra; se corrigió (Carrer de Mallorca) y se recalcularon las rutas. Además, como pidió el
  responsable, un coche de demo cuyo último destino no es un lugar conocido (coordenadas dudosas, p. ej. servicios ya
  cargados con la coordenada vieja) va a la base de la empresa (Flota y ajustes) o a su aparcamiento.

- **Vulnerabilidades de postcss (17/10/2026)**: el escáner de Hostinger avisó de 4 CVE (2 altas, 2 moderadas) en
  `postcss@8.4.31`. No era una dependencia directa: `next@15.5.27` la fija a esa versión exacta (también la última
  15.5.28). Se forzó la versión corregida solo para Next con `overrides` de npm (`postcss ^8.5.30`, la misma rama 8.5 que
  ya usaba Tailwind); `npm audit` queda en 0 vulnerabilidades y la web compila igual.

- **Sin datos personales reales en la app (17/10/2026)**: al repasar las bases antes de entregar apareció que las
  pruebas reales con los móviles habían dejado datos personales del responsable en la base: 13 servicios con su nombre,
  4 teléfonos y 2 correos reales, direcciones con número, 2.781 posiciones GPS reales (y los trazados calculados con
  ellas) y 4 fotos de tickets reales. Con su permiso se anonimizó: nombres, teléfonos (600 000 9xx) y correos
  (`@ejemplo.test`) inventados, direcciones particulares sustituidas por lugares públicos con sus coordenadas, borradas
  las posiciones GPS reales, sus trazados y las coordenadas de las incidencias reales, y las fotos de tickets cambiadas
  por las de ejemplo (también ficticias). Un barrido de todos los campos de texto confirmó que no queda nada.

- **¿Qué IP es la del cliente detrás de Hostinger? (17/10/2026)**: con una `X-Real-IP` inventada en cada petición se
  saltaban todos los límites. La primera corrección (usar la última entrada de `X-Forwarded-For`) se comprobó mal
  (la prueba de control seguía usando la cabecera vieja). Solución: una ruta de diagnóstico temporal protegida con el
  secreto de los cron que devolvía las cabeceras con hash (sin exponer la IP), que demostró que el proxy añade la IP real
  al final de `X-Forwarded-For` y deja pasar `X-Real-IP` tal cual; tras desplegar, 120 peticiones pasan y el resto da
  429 aunque se falsifique la IP. La ruta se borró a continuación.

- **El anonimizador no puede contener lo que tapa (17/10/2026)**: la primera versión del filtro del historial de prompts
  llevaba en el código los nombres, la dirección y la marca reales, es decir, los publicaba en el repositorio. Solución:
  esos patrones se leen de un fichero local ignorado por git; en el código solo quedan los genéricos (correos y
  teléfonos). Además, el formulario público perdía lo rellenado al abrir la política de privacidad: ahora se abre en
  una ventana encima y no se navega.

- **Grabar sin QuickTime (18/10/2026)**: con tres pantallas, el iPhone solo por Wi-Fi y una superposición de otra app,
  QuickTime no daba una fuente usable. Solución: el simulador de Xcode, que graba la pantalla del dispositivo sin
  depender del escritorio. Dos tropiezos: el teclado del simulador con distribución española escribía `"` en lugar de
  `@` (se fijó la distribución física del simulador a US, sin tocar el Mac) y el texto tecleado justo al enfocar un
  campo llegaba tarde (se espera a que aparezca el teclado). Además, la primera hora probada no ofrecía horas
  alternativas: el conductor de tarde tenía un viaje a Barcelona y la búsqueda solo mira ±3 h; se grabó a otra hora.

## 7. Capturas
Tomadas el 17/10/2026 de la aplicación en producción con los datos de demostración (marca ficticia, sin datos reales),
con Playwright: la central a 1440×900 y la portada y el conductor a tamaño de móvil (393×852). En
`docs/capturas/`:

| Captura | Qué enseña |
|---|---|
| `01-central-panel-en-vivo.jpg` | Panel en vivo: guía para el jurado, botones de demo/archivar, turnos de hoy y contadores |
| `02-central-mapa-y-actividad.jpg` | Mapa con los coches de demo circulando y avisos (fuera de horario, retrasos) |
| `03-central-servicios.jpg` | Agenda de servicios del día con filtros y estados |
| `04-central-hoja-de-ruta.jpg` | Hoja de ruta de mañana por conductor |
| `05-central-asignar-automaticamente.jpg` | Propuesta de asignación automática (turnos, márgenes, km en vacío) antes de confirmar |
| `06-central-horarios.jpg` | Horarios por semana: turnos partidos, nocturnos y planificación |
| `07-central-combustible.jpg` | Tickets de combustible leídos por OCR, gasto por mes y consumo por vehículo |
| `08-central-informes.jpg` | Informes del mes |
| `09-central-flota-y-ajustes.jpg` | Vehículos y conductores, con la ✕ para eliminar o dar de baja |
| `10-central-historial-de-viajes.jpg` | Historial de viajes con el recorrido GPS |
| `11-portada-reservas.jpg` | Portada pública de reservas (castellano, catalán, inglés) |
| `12-portada-formulario-reserva.jpg` | Reserva rápida: ubicación por GPS, dictado por voz, contadores grandes |
| `13-aviso-legal-plantilla.jpg` | Aviso legal como plantilla con titular ficticio |
| `14-acceso.jpg` | Acceso con las cuentas de demostración |
| `15-conductor-hoy.jpg` | App del conductor (versión web): servicios de hoy con la ✕ para devolverlos |
| `16-conductor-servicio.jpg` | Ficha del servicio en curso con navegación por carretera |
| `17-seguimiento-cliente.jpg` | Página de seguimiento que recibe el cliente por WhatsApp/SMS |

### App nativa N2 — Backend para la app (10/10/2026)
- Endpoints `POST /api/conductor/{accion,llegando,fuera-de-servicio,push-token}` con `Authorization: Bearer` (validado con `auth.getUser`), zod y límite por usuario; `/api/ruta` acepta también Bearer.
- Tabla `dispositivos_push` (migración 0008, RLS) y `src/lib/push.ts`: aviso «Servicio nuevo» vía Expo tras asignar/reasignar (con `after()`, nunca rompe la asignación; borra tokens `DeviceNotRegistered`).
- Challenge: compartir la lógica de «llegando»/«fuera de servicio» entre server actions y API → extraída a `src/lib/servicios/llegando.ts`.

### App nativa N3 — Pantallas del conductor (10/10/2026)
- Pestañas Hoy (+ Próximos 7 días), Historial y Ticket («Próximamente»), cabecera con nombre y «Salir»; datos con
  Supabase (RLS) y recarga en vivo (Realtime con `setAuth` antes de suscribirse y al renovar el token; reconexión y
  vuelta a primer plano → recarga).
- «Servicio nuevo» a pantalla completa (cuenta atrás, ACEPTAR / Rechazar con motivos, «Ver más tarde», vibración,
  reconciliación cada 20 s) y pantalla del servicio (botón de paso, Google Maps / Waze / Llamar, «¡Servicio terminado!»).
- Cola offline: se reutiliza `ColaAcciones` de la web con un almacén en memoria respaldado por AsyncStorage; el envío
  va a `/api/conductor/accion` con Bearer (`src/lib/offline/accionApi.ts`, 401 → refresco y un reintento; 429/5xx/red
  se conservan; 4xx de negocio se descartan y se muestran). Drenaje al arrancar, al volver a primer plano, al
  recuperar la red (NetInfo) y cada 20 s.
- Challenge: `madridAUtc` reparseaba la salida de `toLocaleString`, que Hermes no admite («Date value out of
  bounds» en el simulador). Se movió a `src/lib/dominio/dias.ts` calculando el desfase con `formatToParts`.

### App nativa N4 — GPS en segundo plano (10/10/2026)
- `expo-location` + `expo-task-manager`: tarea `tvl-gps-servicio` definida a nivel de módulo (`movil/lib/gpsTarea.ts`,
  importada desde el layout raíz para que exista también si el SO relanza la app sin interfaz). Toma la última
  ubicación del lote, envía como mucho cada 12 s, comprueba la sesión (refresco si caduca en < 60 s; sin sesión →
  para la tarea), inserta en `posiciones` con timeout de 10 s y, si falla, guarda en una cola persistente (máx. 200)
  que se vacía en el siguiente envío correcto con `registrado_en` = hora real del fix.
- Interruptor «En servicio / Fuera de servicio» en la cabecera con «📍 última posición enviada hace Xs» (rojo > 60 s),
  explicación antes del permiso «Siempre» y aviso amarillo + «Abrir Ajustes» si solo hay «Mientras se usa».
  Apagar o «Salir» paran la tarea y llaman a `/api/conductor/fuera-de-servicio`. Estado persistido por conductor y
  reanudado al abrir la app.
- Decisiones puras en `src/lib/dominio/gpsNativo.ts` (tests en `tests/unit/gpsNativo.test.ts`).
- Challenge: la cola podía pisar la posición actual con fixes viejos → se envían con su hora real y el trigger de
  `posicion_actual` ya ignora filas más antiguas. El GPS en segundo plano no funciona en Expo Go: requiere development build (N7).
- Revisión N4: un fallo de red al refrescar el token ya no para la tarea (solo un refresh token rechazado, AuthApiError
  400/401, da la sesión por perdida → para y limpia; sin token no se puede avisar «fuera de servicio»). El flag «en servicio»
  guarda una generación por conductor que se relee antes de cada insert/escritura (OFF en vuelo → se descarta), y al
  apagar se espera al lote en curso antes del POST (con un reintento). Cola y último envío por conductor, filas con dueño,
  envío en trozos de 50 y limpieza al iniciar sesión.

### App nativa N5 — Mapa y avisos (10/10/2026)
- Mapa nativo con `@maplibre/maplibre-react-native` y teselas raster de OpenStreetMap (sin claves): posición en vivo
  (watch propio de la pantalla, independiente de la tarea en segundo plano), objetivo verde/rojo, ruta de `/api/ruta`
  (Bearer) con conectores discontinuos, banner «Hacia la recogida · 4,2 km · 7 min», seguimiento automático y «Centrar».
- Avisos 500/100 m con la misma histéresis que la web: vibración, notificación local, banner y botón del paso resaltado;
  una vez por servicio+objetivo (AsyncStorage). «Llegando» a la central solo se marca con respuesta ok (reintento ≥ 15 s).
- Push: permiso con explicación previa, token Expo (solo dispositivo físico) a `/api/conductor/push-token`; al salir,
  nuevo `DELETE /api/conductor/push-token` (solo borra el token del conductor que llama). Tocar «Servicio nuevo» abre Hoy.
- Lógica pura nueva en `src/lib/dominio/navegacion.ts` (`debePedirRuta`, `tiempoRestanteS`, textos), con tests.
- Challenge: MapLibre es código nativo → no funciona en Expo Go; requiere development build (N7).

### Auditoría del 11/10 (analista senior + propietario)
Auditoría de código web, app nativa y pruebas de carga de solo lectura en producción (0 errores, techo ~60 req/s).
Informe completo: `docs/INFORME_AUDITORIA.md`. Aplicado: cabeceras de seguridad HTTP y migración `0009`
(validación de posiciones en servidor —coordenadas imposibles descartadas, hora futura corregida— y purga diaria
con pg_cron de posiciones y acciones de más de 30 días: el plan gratuito de 500 MB ya no se llena).
- **12/10/2026 · Aceptación tardía**: al vencer el plazo de respuesta el servicio ya no vuelve a «pendiente»; sigue
  asignado, la central recibe la alerta «Sin respuesta» y el conductor aún puede aceptarlo mientras no se reasigne
  (migración `0016`, `plazo_vencido_en` + trigger que reinicia el plazo al reasignar). Petición del responsable: «igual
  han pasado 10 minutos y aún se puede hacer».
