# Revisión final de funcionamiento, rendimiento y límites (17/10/2026)

Versión revisada: `df64add` (64 commits después de la auditoría de estrés del 15/10). Sin escribir en la base de datos
compartida salvo un servicio de prueba propio (`es_prueba`, oculto) usado el mismo día para probar la edición.

1. **Carga y memoria**: build de producción en local (vigilante apagado) con `ab` a 1/10/25/50 conexiones, 2 000 renders
   seguidos de la central; sonda suave a producción (≈ 600 GET); memoria de producción vigilada 10 min con el vigilante y
   la demo en marcha.
2. **Base de datos**: `pg_stat_statements`, tamaños, pg_cron y advisors de Supabase.
3. **Dos revisiones de código en paralelo**: web/servidor y app nativa (solo lectura). `tsc` sin errores y 846 tests en
   verde en los dos casos.

## Rendimiento medido

| Prueba | Resultado |
|---|---|
| `/central` local, 1 usuario | p50 228 ms · p95 348 ms |
| `/central` local, 10 / 25 / 50 conexiones | p50 0,6 / 1,3 / 2,8 s · techo ≈ 19 páginas/s por proceso · 0 errores |
| `/conductor` local, 1 / 10 / 25 conexiones | p50 394 / 398 / 684 ms · 32 páginas/s · 0 errores |
| Portada / `/reservar` / login (50 conexiones) | 156 / 1 228 / 298 peticiones/s · 0 errores |
| Memoria tras 2 000 renders de la central | heap 82–84 MB tras cada tanda (sin fuga) |
| Producción, sonda suave | login p50 207 ms · portada 281 ms · central 462 ms · conductor 453 ms · 0 errores |
| Producción, memoria 10 min con vigilante + demo | heap estable 68–74 MB (sin fuga) |
| Portada en móvil (producción) | primer byte 146 ms · carga completa 305 ms |
| Base de datos | 21 MB de 500 MB; posiciones ≈ 5 000/día (1,3 MB) con purga a 30 días; consultas de la app < 7 ms de media |
| Coste de la sesión | `getUser` (red a Supabase Auth) 80–155 ms en **cada** página y acción |

## Fallos encontrados

| # | Gravedad | Problema | Arreglo propuesto |
|---|---|---|---|
| 1 | **Alta** · confirmado en producción | **Los límites de peticiones se saltan inventando la IP**: `ipCliente` confía primero en `X-Real-IP`, que Hostinger deja pasar tal cual. 130 peticiones con IP falsa → 0 × 429; sin ella → 429 a las 118. Afecta a reservas (5/h), buscador de direcciones, seguimiento y salud. | Usar la última entrada de `X-Forwarded-For` (la añade el proxy; comprobado que es fiable). |
| 2 | **Alta** | Tras abrir hoy las acciones de la central a servicios en curso, **asignar desde el diálogo, arrastrar en la hoja de ruta, «Subcontratar» de las alertas y reasignar desde la app no envían el estado que veía el operador**: si el conductor (o la demo, cada ~40 s) sale o carga mientras tanto, se le quita el servicio en marcha sin querer. | Enviar `estadoEsperado` desde todos y, de respaldo, exigirlo en el servidor para servicios en curso. |
| 3 | **Alta** | **El conductor no se entera de que la central le ha quitado un servicio en curso** (reasignar, quitar, subcontratar): la seguridad de la base de datos ya no le manda el cambio y la app solo escucha esos avisos en modo central. Sigue navegando hasta que pulsa CARGA. Igual en la web del conductor. | App: al recibir «servicio retirado/modificado», recargar y salir de la ficha. Web: refresco periódico de la ficha en curso. |
| 4 | **Alta** | **Reasignar o quitar con el cliente a bordo reinicia el viaje**: vuelve a «asignado», salta «llega tarde a la recogida» y el seguimiento del cliente vuelve a «de camino». | Con el cliente a bordo: cancelar, subcontratar o cerrar; reasignar y quitar, solo hasta «en camino». |
| 5 | **Alta** | **iPhone: al cerrar el mapa a pantalla completa, el mapa pequeño deja de seguir al coche** (rumbo, zoom y «Centrar»): los dos mapas comparten la cámara y el de la ventana se desmonta después. | Montar el mapa de la ventana solo cuando está abierta (OTA). |
| 6 | **Alta** | **Servicios devueltos que desaparecen de «Hoy» hasta reiniciar la app**, también si la central se lo vuelve a asignar o si el servidor rechaza la devolución (también en la web). | Ocultar solo lo que de verdad se ha encolado y volver a mostrarlo al recargar o si se rechaza. |
| 7 | Media | **Deshacer tras «Cerrar como completado»** deja el servicio «con pasajeros» aunque estuviera asignado. | Guardar el estado anterior en el evento y volver a él. |
| 8 | Media | **Editar las notas de un servicio de demo lo saca de la demo** (deja de moverse y de renovarse, y vuelve a mandar push). | Conservar la marca de demo al editar. |
| 9 | Media | **Recorrido de un servicio cerrado por la central** sin «en camino»: toma el GPS desde «aceptado» (km inflados). | Sin «en camino», recorrido vacío. |
| 10 | Media | **«Usar mi ubicación» puede saltarse el 1 petición/s de Nominatim** (peticiones simultáneas) → riesgo de bloqueo del buscador de direcciones. | Cola común con el buscador y límite propio. |
| 11 | Media · posible | **iPhone: el aviso «Servicio nuevo» puede no salir** si el conductor tiene abierto el mapa a pantalla completa (iOS no presenta una ventana sobre otra). | Cerrar el mapa ampliado cuando llega un servicio nuevo. |
| 12 | Media | **«Deshacer archivado» imposible** si se elimina un conductor cuyo único historial estaba archivado. | Contar el historial archivado al eliminar. |
| 13 | Baja | Los avisos de horario de servicios **de demo** llegan al móvil de la central. | Filtrar la demo en esa pasada del vigilante. |
| 14 | Baja | App: temporizadores de 1 s y recargas cada 15 s también en segundo plano (batería). | Solo con la app en primer plano. |

## Optimizaciones

| Mejora | Ganancia estimada |
|---|---|
| Sesión con `getClaims` (verificación local del JWT ES256) en vez de `getUser` | −80 a −150 ms en **todas** las páginas y acciones |
| Consultas en paralelo en `/conductor` y en la ficha del servicio del conductor | −200 a −300 ms (394 → ~200 ms) |
| Pasada de recorridos del vigilante cada 60 s y sin servicios de demo | −6 consultas/min |
| Comprobación de hueco de la reserva: cargar conductores y disponibilidad una sola vez para ida y vuelta | −8 consultas por reserva |
| Cámara del mapa: rumbo en el mismo fotograma del GPS | sin un fix de retraso en los giros |

## Lo que está bien
Sin errores bajo carga, sin fugas de memoria (local y producción), límites de 429 correctos cuando la IP es la real,
cachés en memoria acotadas, base de datos muy holgada, zona horaria y cambio de hora del 25/10 correctos, antelación de
30 min comprobada en el servidor, campo trampa en los dos formularios públicos, texto legal cargado solo al abrirlo.

## Resultado (17/10/2026, misma noche)

Aplicado todo lo anterior salvo el ajuste fino de la cámara del mapa (rumbo un fotograma antes), que se deja como está
porque el modo «rumbo arriba» se afinó probándolo en el coche y cambiarlo sin volver a probar es más arriesgado que útil.
Decisión del responsable para el n.º 4: con el cliente a bordo, **reasignar es un relevo** (el nuevo conductor lo recibe
«con pasajeros», sin volver a la recogida ni alertas de retraso, con un aviso propio «Relevo: cliente a bordo»); «Quitar
conductor» solo hasta «en camino». Además: límites de longitud en el servidor para la reserva, la edición aplica solo
los campos cambiados (no pisa la recogida reajustada por el vuelo ni mueve la hora ambigua del 25/10), no permite dejar
la ida después de la vuelta, y el borrado de conductores informa si algún servicio no se pudo devolver.

Verificado: 853 tests en verde (17 nuevos), `tsc` de la web y de la app sin errores, build de producción. En local con
servicios de prueba ocultos: relevo (sigue «con pasajeros» con el nuevo conductor, el actual no se ofrece), «Reabrir el
servicio» en uno cerrado por la central, y el conductor que pierde un servicio ve «Este servicio ya no está asignado a
ti» (un servicio ajeno sigue dando 404). Sesión: sin cookie, con JWT manipulado o con rol equivocado → login.
Medido tras los cambios: `/conductor` 394 → 221 ms (1 usuario) y 22 → 34 páginas/s (10 conexiones); `/central` con 10
conexiones p50 593 → 489 ms.
