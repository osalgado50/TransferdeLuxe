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
- Botón de demo en el panel: «Simular ruta» (mueve los coches). Los datos que se crean se conservan.

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
- **Plazo de respuesta**: `pg_cron` cada minuto marca los servicios no aceptados a tiempo y avisa a la central; el conductor aún puede aceptarlos mientras no se reasignen.
- **Sin cobertura**: cola local por conductor; cada pulsación lleva un `idAccion` y el servidor ignora duplicados.
- **Tickets**: OCR gratuito en el navegador (Tesseract.js) + reglas de extracción; la foto va a un bucket privado.
- **Mapas**: Leaflet + OpenStreetMap; geocodificación con Nominatim y lugares frecuentes.
- **Despliegue**: Hostinger Cloud Startup (Node.js Web App importada de GitHub, redespliegue en cada push) y
  GitHub Actions diario que mantiene activo Supabase y limpia tokens push caducados (sin reiniciar datos).
- **App nativa TVL Conductor** (`movil/`, Expo SDK 57): GPS en segundo plano con cola sin pérdidas, notificaciones push,
  mapa MapLibre + OSM con avisos de proximidad, ticket con cámara. Android (APK interno) e iOS (TestFlight) con EAS.
- **Módulos activables** desde la central: jornada laboral, incidencias, checklist del vehículo, mantenimiento,
  informes y seguimiento de vuelos.
- **Seguridad y legal**: RLS en todas las tablas, cabeceras HTTP, validación y purga de posiciones (30 días),
  páginas `/privacidad` y `/aviso-legal`. Auditoría completa en `docs/INFORME_AUDITORIA.md`.
- **Calidad**: más de 240 tests unitarios (Vitest) y 2 tests de punta a punta (Playwright).
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
- **10/10/2026**: **app nativa TVL Conductor (N1, andamiaje)**. Proyecto Expo SDK 57 en `movil/` (Expo Router,
  TypeScript), proyecto EAS `@osalgado/tvl-conductor`, identidad (bundle `com.transfersvipluxe.conductor`, icono
  VIP LUXE generado con sharp, tema oscuro de marca), permisos de ubicación en segundo plano, perfiles `eas.json`,
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
- **Jefe multitarea, modo central en la app nativa (11/10/2026)**: la app «TVL Conductor» deja entrar también a los
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

## 7. Capturas
Ver `docs/capturas/` (login, panel en vivo, servicios, hoja de ruta, ficha y asignación con sugerencia).
Navegación del conductor llegando al destino: `docs/capturas/conductor-navegacion-llegando.jpg`.

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
