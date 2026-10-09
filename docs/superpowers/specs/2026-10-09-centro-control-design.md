# TransferdeLuxe — Centro de control de traslados · Diseño

Fecha: 09/10/2026 · Estado: pendiente de revisión · Plataforma: Claude Code

## 1. Objetivo y contexto

Empresa de traslados VTC de Salou (Costa Dorada) con **3 vehículos propios** (2 × 8 plazas, 1 × 7 plazas)
y **3 conductores**. Para grupos mayores subcontrata autobuses de hasta 16 plazas. Hoy los pedidos llegan por
un formulario web y por teléfono.

Construimos **TransferdeLuxe**: una web app con tres piezas:

1. **Reserva pública** (`/reservar`): formulario equivalente al de la web de la empresa.
2. **Centro de control** (`/central`): recibir pedidos, asignarlos con sugerencia, seguir la flota en un mapa en
   tiempo real, gestionar rechazos y registrar el gasto en combustible.
3. **App del conductor** (`/conductor`, PWA): hoja de ruta diaria, aceptar/rechazar servicios, botones de
   en camino / carga / descarga, envío de GPS y lectura de tickets de combustible con IA.

**Criterio de éxito (hackathon):** al menos 3 funcionalidades principales funcionando en producción
(gestión y asignación de servicios · app del conductor con geolocalización · control de combustible con IA),
datos persistentes, interfaz usable, desplegada y probable por el jurado del 20 al 27/10/2026.

**Restricciones:** todo el código generado por IA; sin datos personales ni credenciales reales (solo datos de demo
inventados, sin nombre, marca ni contacto de la empresa real); secretos en `.env`; entrega 19/10/2026 23:59.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Entrada de pedidos | Página de reserva pública **y** alta manual desde la central |
| App del conductor | PWA (la app nativa Android/iOS queda como evolución futura) |
| Asignación | Manual con sugerencia (libre, plazas, cercanía); el conductor acepta o rechaza |
| Tickets de combustible | Foto → **Claude Haiku 5.5** extrae los datos → el conductor revisa. Lector intercambiable |
| Stack | Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, Realtime, Storage, pg_cron) |
| Hosting | **Hostinger Cloud Startup** (Node.js Web App desplegada desde GitHub) con el dominio propio |
| Mapas | Leaflet + OpenStreetMap; geocodificación con Nominatim + lugares frecuentes predefinidos |
| Plazo de respuesta | Sí, configurable (por defecto 15 min) |
| Paso «en camino» | Sí |
| Facturación / precios | Fuera de alcance |

## 3. Arquitectura

```
Navegador (operador)   Móvil (conductor, PWA)   Navegador (cliente)
        │                       │                        │
        └────── Next.js en Hostinger (Node.js) ──────────┘
          /central         /conductor            /reservar
          Server Actions / Route Handlers (validación de transiciones,
          sugerencia de conductor, lector de tickets, reserva pública)
                    │                          │
             Supabase (Postgres + RLS,     API de Anthropic
             Auth, Realtime, Storage,      (Claude Haiku 5.5,
             pg_cron)                       solo desde el servidor)
```

- **Un solo proyecto Next.js** y un solo despliegue. Las tres zonas se separan por rutas y por rol.
- **Realtime de Supabase** para posiciones, cambios de estado, asignaciones y alertas (sin recargar).
- **Lógica de dominio en módulos puros** (`lib/dominio/*`), sin dependencias de Supabase ni de React, para
  poder probarla con tests unitarios:
  - `estados.ts`: máquina de estados del servicio (transiciones permitidas y quién puede hacerlas).
  - `sugerencia.ts`: ranking de conductores para un servicio.
  - `combustible.ts`: cálculos de consumo y gasto.
- **Lector de tickets** detrás de una interfaz `LectorTicket` (`leer(imagen) → DatosTicket`), con la
  implementación `ClaudeHaikuLector`. Cambiar a OCR.space o Mindee = otra implementación, sin tocar el resto.

## 4. Modelo de datos

- **perfiles**: `id` (= auth.users), `rol` (`operador` | `conductor`), `nombre`, `telefono`, `vehiculo_habitual_id`.
- **vehiculos**: `id`, `matricula`, `modelo`, `plazas` (7 u 8), `estado` (`activo` | `taller`), `km_actuales`.
- **servicios**:
  - Cliente: `cliente_nombre`, `cliente_apellidos`, `cliente_email`, `cliente_telefono`.
  - Trayecto: `origen_texto`, `origen_lat`, `origen_lng`, `destino_texto`, `destino_lat`, `destino_lng`,
    `fecha_hora_recogida`, `pasajeros` (1–19), `maletas`, `tipo_vehiculo_pedido`
    (`sedan` | `minivan` | `minivan_premium` | `microbus` | `minibus`), `numero_vuelo`, `notas`.
  - Gestión: `origen_pedido` (`web` | `manual`), `servicio_vuelta_id` (enlaza ida y vuelta),
    `conductor_id`, `vehiculo_id`, `estado`, `asignado_en`, `plazo_respuesta_min`,
    `duracion_estimada_min`, `subcontratar` (bool), `creado_en`.
- **eventos_servicio**: `servicio_id`, `tipo` (creado, asignado, aceptado, rechazado, expirado, en_camino,
  recogido, completado, cancelado, reasignado, subcontratado), `actor_id`, `motivo`, `creado_en`.
- **posiciones**: `conductor_id`, `lat`, `lng`, `velocidad`, `precision`, `registrado_en`.
  Vista/tabla `posicion_actual` con la última por conductor; histórico del día para el recorrido.
- **tickets_combustible**: `conductor_id`, `vehiculo_id`, `fecha`, `gasolinera`, `litros`, `precio_litro`,
  `importe`, `tipo_combustible`, `km`, `foto_path`, `datos_ia` (jsonb, lo leído), `corregido` (bool), `creado_en`.
- **lugares_frecuentes**: `nombre`, `tipo` (aeropuerto, estación, parque, zona), `lat`, `lng`.
- **ajustes**: `plazo_respuesta_min` (15), `umbral_sin_senal_min` (5), `modo_demo` (bool).

Una reserva con vuelta crea **dos servicios** enlazados por `servicio_vuelta_id`.

## 5. Estados del servicio

```
pendiente ─► asignado ─► aceptado ─► en_camino ─► recogido ─► completado
   ▲            │                                (CARGA)      (DESCARGA)
   │            ├─► rechazado (motivo) ──┐
   │            └─► expirado (sin respuesta en el plazo) ──┤
   └──────────────────────────────────────────────────────┘  vuelve a «pendiente» + alerta
pendiente | asignado | aceptado ─► cancelado (solo central)
pendiente ─► subcontratado (más de 8 pasajeros o decisión de la central)
```

- `rechazado` y `expirado` se registran como **eventos**; el servicio vuelve a `pendiente`, sin conductor, con
  la marca del último rechazo/expiración para que la central lo vea en rojo.
- Motivos de rechazo: avería, no llego a tiempo, fuera de servicio, otro (texto libre obligatorio).
- **Plazo de respuesta**: una función programada con pg_cron cada minuto devuelve a `pendiente` los servicios
  `asignado` con `asignado_en + plazo` vencido y registra el evento `expirado`.
- Al crear un servicio con `pasajeros > 8` se marca `subcontratar = true` y aparece como alerta.
- Solo el conductor asignado puede pasar `aceptado → en_camino → recogido → completado`; solo la central asigna,
  reasigna, cancela o subcontrata. Las transiciones se validan en el servidor con `estados.ts` y con RLS.

## 6. Reserva pública (`/reservar`)

Campos del formulario de la web de referencia: recogida, destino, fecha, hora, pasajeros (1–19), maletas (0–19),
tipo de vehículo, número de vuelo, vuelta opcional (recogida, destino, fecha, hora, vuelo), nombre, apellidos,
email, teléfono, información adicional, aceptación de la política de privacidad.

- Autocompletado de direcciones: lugares frecuentes primero y después Nominatim (limitado a Cataluña).
- Al enviar: crea el/los servicio(s) en `pendiente` con `origen_pedido = web` y genera alerta en la central.
- Protección: validación en servidor, límite de envíos por IP y campo trampa anti-spam.
- La página pública solo puede insertar reservas, nunca leerlas.

## 7. Centro de control (`/central`)

Solo para el rol `operador`.

1. **Panel en vivo**: mapa con los 3 vehículos en tiempo real coloreados por estado (libre, en camino, con
   pasajeros, sin señal > 5 min); al pulsar uno se ve conductor, servicio actual y siguiente. Columna de alertas
   (reserva nueva, rechazo, plazo vencido, subcontratar) con acción directa. Contadores del día.
2. **Servicios**: tabla filtrable (fecha, estado, conductor, origen). «Nuevo servicio» para alta manual con el
   mismo formulario que la reserva pública. Ficha: datos, mapa del trayecto, historial de eventos, acciones.
3. **Asignar con sugerencia**: ranking de conductores con motivos visibles:
   - libre a esa hora (sin solape con otros servicios, contando `duracion_estimada_min`, calculada por distancia
     en línea recta × factor de carretera a una velocidad media; sin API de rutas);
   - vehículo con plazas suficientes y en estado `activo`;
   - cercanía: posición GPS si el servicio es en < 60 min y el conductor está en servicio; si no, el destino de su
     servicio anterior de ese día.
   El operador elige; el servicio pasa a `asignado` y llega al móvil del conductor al instante.
4. **Hoja de ruta**: vista por día con una columna por conductor; arrastrar un servicio a otra columna lo reasigna
   (vuelve a pedir aceptación al nuevo conductor).
5. **Combustible**: tickets con foto, filtros por vehículo, conductor y mes; gasto total, litros, consumo medio
   L/100 km (por diferencia de km entre tickets del mismo vehículo) y gráfico mensual.
6. **Flota y conductores**: alta y edición de vehículos (incluido `taller`) y conductores; ajustes (plazo de
   respuesta). Punto de enganche futuro para mantenimiento.
7. **Modo demo** (si `modo_demo`): botón «Simular ruta» (mueve a los conductores por recorridos predefinidos de la
   Costa Dorada escribiendo posiciones) y botón «Restablecer demo» (vuelve a cargar los datos de demo).

## 8. App del conductor (`/conductor`, PWA)

Solo para el rol `conductor`. Manifest + service worker, instalable, diseño de una mano y botones grandes.

1. **Hoy**: hoja de ruta del día ordenada por hora. Interruptor «En servicio / Fuera de servicio»; en servicio,
   `watchPosition` envía la posición cada ~15 s (solo con la app abierta). Si se deniega el permiso, aviso claro.
2. **Servicio nuevo**: tarjeta a pantalla completa con sonido y vibración, datos del servicio y cuenta atrás del
   plazo. Aceptar / Rechazar (motivo). Si el plazo vence, desaparece.
3. **Servicio en curso**: un botón principal que avanza: «Salgo hacia la recogida» → «CARGA – pasajeros a bordo»
   → «DESCARGA – servicio terminado». Enlaces «Abrir en Google Maps / Waze» y «Llamar al cliente».
   Tras la descarga muestra el siguiente servicio.
4. **Ticket de combustible**: foto (cámara) → «Leyendo ticket…» → formulario rellenado por la IA → el conductor
   revisa, añade km y guarda. Si la lectura falla, formulario manual con la foto adjunta.
5. **Historial**: servicios y tickets de los últimos días.

- **Sin cobertura**: las acciones de estado se encolan en el dispositivo y se reintentan al recuperar la
  conexión; el conductor ve «pendiente de enviar». El servidor ignora duplicados (idempotencia por id de acción).
- Avisos solo con la app abierta (Realtime). Push con la app cerrada: futuro.

## 9. Lector de tickets (IA)

- Route handler en servidor: recibe la foto (redimensionada en el móvil a ≤ 1600 px, JPEG), la sube a Supabase
  Storage (bucket privado) y llama a **Claude Haiku 5.5** con visión, pidiendo JSON estricto:
  `fecha, gasolinera, litros, precio_litro, importe, tipo_combustible, confianza`.
- Validación del JSON (esquema con zod) y coherencia (`litros × precio_litro ≈ importe`); si no cuadra, se avisa
  al conductor para que revise.
- La clave `ANTHROPIC_API_KEY` solo en servidor. Coste estimado: ~0,0003 $ por ticket.
- Interfaz `LectorTicket` para sustituirlo por OCR.space o Mindee sin tocar el resto.

## 10. Seguridad

- **RLS** en todas las tablas: conductor → solo sus servicios, posiciones y tickets; operador → todo;
  anónimo → solo insertar reservas mediante una función de servidor.
- Transiciones de estado validadas en servidor; `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY` nunca en el cliente.
- Fotos de tickets en bucket privado con URLs firmadas.
- En el repo solo `.env.example`.

## 11. Datos de demo

- Cuentas `central@transferdeluxe.test` y `conductor1@…`, `conductor2@…`, `conductor3@transferdeluxe.test`;
  contraseñas de prueba documentadas en el README y en el Doc «Enlaces y acceso».
- 3 vehículos ficticios (2 × 8 plazas, 1 × 7) con matrículas inventadas; clientes ficticios; servicios repartidos
  en varios días y estados; algunos tickets con imágenes de ejemplo generadas para la demo.
- Lugares frecuentes reales (aeropuertos, estaciones, PortAventura…): son lugares públicos, no datos personales.
- Script de seed reutilizado por «Restablecer demo».

## 12. Despliegue y operación

- **Hostinger Cloud Startup**: la app Next.js como «Node.js Web App» (Node 22), importada desde el repo privado de
  GitHub, en un subdominio del dominio propio (p. ej. `app.<dominio>`) con SSL. Cada push a `main` redespliega.
  Hostinger no ofrece tiempo real ni auth gestionada, así que los datos siguen en **Supabase**.
- Supabase (datos, auth, realtime, storage, pg_cron), plan gratuito.
- Variables de entorno (claves de Supabase y Anthropic) en el panel de Hostinger, nunca en el repo.
- Plan B si el build de Next.js choca con los límites del plan: Vercel con el mismo repo y el dominio apuntado.
- pg_cron cada minuto para los plazos de respuesta; además mantiene actividad para evitar la pausa del plan gratuito.
- Antes de entregar: comprobar que el proyecto de Supabase está activo y que la app responde; repetir durante la
  evaluación si es posible sin hacer commits.

## 13. Pruebas

- **Unitarias (Vitest)**: `estados.ts` (transiciones válidas e inválidas y permisos), `sugerencia.ts` (solapes,
  plazas, taller, cercanía), `combustible.ts` (L/100 km), parseo y validación de la respuesta del lector.
- **E2E (Playwright)**: reserva pública → asignar → aceptar → en camino → carga → descarga; rechazo que vuelve a
  la central con alerta.
- Prueba manual en un móvil real (instalación PWA, GPS, cámara) antes de entregar.

## 14. Fuera de alcance (hoja de ruta futura)

Facturación y precios · app nativa Android/iOS · mantenimiento (aceite, neumáticos, ITV) · notificaciones push
con la app cerrada · GPS en segundo plano · integración con el formulario real de la web · cálculo de rutas con API.
