# Informe de pruebas de estrés y auditoría del centro de control (15/10/2026)

Versión auditada: commit `d863f44` (build de producción). Tres revisiones en paralelo, **sin escribir nada** en la base de
datos compartida:

1. **Rendimiento y carga** — servidor local con el build de producción (10/25/50 conexiones), memoria con el inspector de
   Node, base de datos (`pg_stat_statements`, advisors de Supabase) y una sonda suave a producción (~430 GET).
2. **QA en navegador** — las 16 pantallas de la central a 1440, 1000 y 375 px: consola, red, maquetación, textos, URLs
   con valores raros, panel en vivo durante 2,5 min.
3. **Auditoría de código** — máquina de estados, zonas horarias, seguridad, consultas sin límite, vigilante, OCR.

Comprobaciones: `tsc` sin errores, 764 tests en verde. El fallo de cambio de hora (n.º 2) lo he reproducido aparte.

## Resumen

- **Lo que va bien:** sin errores de hidratación ni de consola; XSS bien escapado; panel en vivo estable (memoria del
  navegador plana, sin peticiones duplicadas); producción respondió 0 errores, 0 × 429, 0 × 503 (p50 ~270 ms en la API
  del panel); base de datos muy holgada (todas las consultas de la app < 10 ms de media).
- **Lo grave:** una **fuga de memoria en el servidor** (cada página de la central deja ~140–460 KB sin liberar; se
  reprodujo la caída por falta de memoria) y un **error de una hora en la noche del cambio de hora del 25/10**, que cae
  dentro de la semana de evaluación (20–27/10).

## Lista priorizada de cambios

| # | Gravedad | Problema | Evidencia | Arreglo propuesto |
|---|---|---|---|---|
| 1 | **Alta** | **Fuga de memoria del servidor** en cada render de `/central/*` | Heap tras GC 64 → 379 MB en ~840 peticiones; con 512 MB el proceso muere (OOM) a las ~1 200; igual en Node 22 y 26; el rendimiento cae de 20,5 a 14,9 rps. Retenidos: `Response`/`ReadableStream` duplicados por la deduplicación de `fetch` de Next | Cliente Supabase de cookie (`src/lib/supabase/servidor.ts`) con `fetch` propio / `cache: "no-store"`; repetir la medición de heap; vigilar memoria en `/api/salud` |
| 2 | **Alta** | **Cambio de hora:** una hora local de 01:00–01:59 el 25/10 (y el 28/03) se convierte mal a UTC | `madridAUtc("2026-10-25","01:30")` → 02:30 en Madrid. Afecta a reservas, llegada real de vuelos y fin de tramos de horario | Corregir `madridAUtc` (`src/lib/dominio/dias.ts`) con dos pasadas del desfase + tests de 00:30/01:30/02:30/03:30 |
| 3 | **Alta** | **Carrera reasignar ↔ aceptar/rechazar**: si la central reasigna de A a B mientras A pulsa «Aceptar», queda **aceptado a nombre de B**; si A pulsa «Rechazar», **se le quita a B** | El RPC `transicion_servicio` solo compara el estado, no el conductor (`0019_transicion_atomica.sql`) | Comparar también `conductor_id` esperado en el RPC (migración aditiva) |
| 4 | Media-alta | **Un ticket mal leído o atrasado sube los km del coche** y bloquea los tickets buenos | Los 2 tickets de prueba del 25/04/2024 subieron 0001-TDL a 125.800 km (el real es ~120.150); `kmMinimo` rechazará ahora tickets correctos. Se aceptan tickets de 2024 y duplicados | Solo actualizar `km_actuales` con tickets recientes; límite inferior de fecha; aviso de duplicado; corregir los km de 0001-TDL (te lo pregunto) |
| 5 | Media-alta | **Alertas de horario que siguen contando** cuando la situación ya terminó («sigue en servicio 7 h 33 min después de su turno» con la jornada cerrada) | `textoAlDia` suma minutos sin mirar el estado; el feed dice otra cosa | Retirar/cerrar la alerta cuando el conductor queda libre, cierra jornada o acaba el turno; dejar de contar al cerrarse |
| 6 | Media-alta | **Calendario semanal de Servicios descuadrado** (columnas de 13 px y otra de 450 px) | Un servicio con dirección larga fija el ancho (`CalendarioServicios.tsx`) | `min-w-0` en las columnas |
| 7 | Media | **Datos de pruebas automáticas** en Informes, Incidencias, Mantenimiento y en el panel en vivo | 35 de 37 incidencias y 18 de 24 rechazos son de prueba | Filtrar `es_prueba` en esas consultas y en el Realtime del panel |
| 8 | Media | **Alertas «Sin respuesta» que no se limpian** al aceptar, cancelar o subcontratar | 1 servicio aceptado sigue con la alerta | Marcar `incidencia_vista` en esas acciones |
| 9 | Media | **Error 500 / error crudo de Postgres** con fechas inválidas en la URL (`/central/ruta?dia=2026-13-45`, `/central/jornadas?hasta=…`) y **sin pantalla de error** (cualquier fallo de Supabase tumba todo el panel) | Solo se valida con regex | Validar con `diaValido`; añadir `error.tsx` con «Reintentar»; try/catch en las acciones |
| 10 | Media | **Acciones de la central sobre un estado que ya cambió** («Deshacer la salida» deshace la CARGA si el conductor acaba de cargar) | El servidor usa el estado actual, no el que vio el operador | Enviar `estadoEsperado` y rechazar si no coincide |
| 11 | Media | **El desplegable de direcciones no se cierra** y tapa el campo de destino (ni con clic fuera ni con Escape) | `CampoDireccion.tsx` | Cerrar al perder el foco y con Escape; flechas para elegir |
| 12 | Media | **Consumo L/100 km absurdo** (1,5 y 0,2 L/100 km) | Sin descartar atípicos; en informes el ticket previo se elige por km, no por fecha | Usar el ticket anterior por fecha y descartar tramos imposibles |
| 13 | Media | **Tope de 1000 filas de Supabase**: «copiar mes» con un año planificado puede **pisar cambios puntuales**; Combustible/Informes leen todos los tickets; 1 URL firmada por ticket | `horariosDe` sin paginar; `combustible/page.tsx` | Paginar; filtrar por mes en SQL; `createSignedUrls` en lote |
| 14 | Media | **Leer un ticket bloquea el servidor** 1,6–2,7 s (todo el mundo espera) | OCR en el hilo principal | Cola de 1 con respuesta inmediata «ocupado», menos pasadas o hilo dedicado |
| 15 | Media | **Asignación automática con muchos servicios bloquea el servidor** (100 servicios/20 conductores: 1,2 s; 300/100: 35 s) | Mejora por intercambios O(n²)·O(n) | Cortar por tiempo (~300 ms) o mover a un hilo |
| 16 | Media | **Tres consultas de sesión por cada página** (~250 ms de base en todas) | `getUser` en middleware + layout + página | `cache()` en `perfilActual`; verificación local del JWT en el middleware |
| 17 | Media | **Jornadas abiertas 2–3 días** sin aviso; la salida sin fecha («19:39 → 10:35») | Jornadas de 54–56 h en la lista | Aviso de jornada > 14 h; «(+1 día)» en la salida |
| 18 | Media | **Reasignar/subcontratar/cancelar no avisa al conductor** que pierde el servicio (puede salir hacia la recogida) | Solo «desasignar» manda push | Push «Servicio retirado» al conductor anterior |
| 19 | Media-baja | **«Recogida movida» aunque no se haya movido** (el conductor ya recogió) y el **aviso de retraso solo salta una vez** en la vida del servicio | `vuelos-actions.ts`; índice único de `retraso_recogida` | Comprobar filas afectadas; rearmar el aviso al reasignar o mover |
| 20 | Media-baja | **Vigilante**: un fallo al guardar el cursor puede reenviar avisos; cada aviso a la central son 3 llamadas en serie | `vigilante.ts`, `push.ts` | Comprobar el error; tokens una vez por pasada y envío en lote |
| 21 | Baja-media | **Contadores del panel** («Pendientes 0») no cuentan servicios de días anteriores sin asignar | `Contadores.tsx` | Incluir atrasados o un contador «Atrasados» |
| 22 | Baja-media | Se pueden **crear servicios en el pasado** y **vueltas anteriores a la ida** | `esquemaReserva` | Validarlo (con margen para la central) |
| 23 | Baja | **CSV de Informes** con punto decimal (el de Jornadas usa coma) y sin neutralizar fórmulas (`=`, `+`…) | `informes.ts`, `jornada.ts` | Coma decimal y prefijo `'` |
| 24 | Baja | **Abrir la ficha marca la incidencia como vista** para todos | `AccionesFicha.tsx` | Marcar solo con el botón «Visto» |
| 25 | Baja | Textos y presentación: «Fuera de horario (Fuera de horario…)», «aún puede aceptarlo o reasígnalo», «1 ya asignados», estados en crudo («en_camino»), «Mantenimiento: próximamente» en Flota, capas del modal bajo el zoom del mapa, foco de los modales, sin indicador de carga al cambiar de vista | Varios | Repaso de textos y `loading.tsx` |
| 26 | Baja | Base de datos: 23 políticas RLS con `auth.uid()` sin `(select …)`, `es_operador()` ejecutable por anon, `lugares_frecuentes` legible por anon, protección de contraseñas filtradas desactivada, índices preventivos; Realtime = 84 % del tiempo de BD (8 canales sin filtro, re-render del panel por cada GPS) | Advisors y `pg_stat_statements` | Migración aditiva de políticas e índices; canal de GPS aparte |
| 27 | Baja | Fotos de tickets huérfanas (8 de 12) y el **simulador de la demo inserta posiciones GPS falsas** de conductores reales | Storage; `demo-actions.ts` | Limpieza de huérfanas; simulador solo para cuentas sin GPS real |
| 28 | Baja | La fecha por defecto del ticket web se calcula en UTC (entre 00:00 y 02:00 propone ayer) | `CapturaTicket.tsx` | Usar la fecha de Madrid |

## Rendimiento medido (local, build de producción)

| Ruta | 1 usuario p50 / p95 | 10 conexiones p50 / p95 |
|---|---|---|
| /central | 307 / 417 ms | 543 / 865 ms (25 conex.: 1,2 / 1,5 s; 50: 2,6 / 3,7 s) |
| /central/servicios | 223 / 263 ms | 436 / 1 327 ms |
| /central/ruta | 207 / 255 ms | 294 / 356 ms |
| /central/horarios (mes) | 275 / 339 ms | 420 / 486 ms |
| /central/combustible | 280 / 399 ms | 366 / 953 ms |
| /central/informes | 266 / 318 ms | 336 / 488 ms |
| API del panel (`/api/central/resumen`) | 196 / 355 ms | límite 120/min por sesión (correcto) |

Techo de un solo proceso: ~18–20 páginas/s de `/central` (CPU). Producción (sonda suave): `/login` p50 90 ms; API del
panel p50 269 ms con 5 conexiones; 0 errores.
