# Guion del vídeo demo (≤ 5 min)

> Entregable 5. Grabar en 1920×1080, con la central en el ordenador y la app del conductor en el móvil
> (o en una segunda ventana con tamaño de móvil). Solo datos de demo. Antes de grabar: «↺ Restablecer demo».

| Tiempo | Pantalla | Qué se enseña | Texto (voz en off) |
|---|---|---|---|
| 0:00–0:25 | Portada | El problema | «Una empresa de traslados de Salou con 3 vehículos y 3 conductores gestiona sus pedidos por formulario web y teléfono. TransferdeLuxe es su centro de control: recibe los pedidos, los asigna, sigue la flota en directo y controla el gasto en combustible.» |
| 0:25–0:55 | `/reservar` | Reserva pública con ida y vuelta | «El cliente reserva igual que en la web actual. Las direcciones se autocompletan con lugares frecuentes de la Costa Dorada. Al enviar…» |
| 0:55–1:30 | `/central` | Panel en vivo | «…la reserva aparece al instante como alerta en la central. El mapa muestra los coches en tiempo real; pulso “Simular ruta” para verlos moverse. Arriba, los contadores del día.» |
| 1:30–2:05 | Ficha → Asignar | Asignación con sugerencia | «Al asignar, la app ordena a los conductores: quién está libre a esa hora, si su vehículo tiene plazas y quién está más cerca. Recomienda uno y lo asigno.» |
| 2:05–2:40 | Móvil: tarjeta | Aceptar / rechazar | «Al conductor le salta una tarjeta con sonido, vibración y cuenta atrás. Si rechaza indica el motivo, y en la central aparece la alerta roja para reasignar. Esta vez acepta.» |
| 2:40–3:15 | Móvil: servicio | En camino · CARGA · DESCARGA | «Un solo botón grande va avanzando: salgo, carga de pasajeros, descarga. Si no hay cobertura, la pulsación se guarda y se envía al volver la señal. La central lo ve al momento.» |
| 3:15–3:50 | Móvil: ticket | Ticket con OCR | «Para el combustible, el conductor fotografía el ticket. El OCR se ejecuta en el propio móvil, gratis y sin enviar la foto a terceros, y rellena litros, precio e importe. Revisa, añade los km y guarda.» |
| 3:50–4:20 | `/central/combustible` | Gasto y consumo | «La central ve el gasto total, los litros, el consumo medio por vehículo y la evolución mensual, con la foto de cada ticket.» |
| 4:20–4:45 | Hoja de ruta + Flota | Planificación | «La hoja de ruta permite arrastrar servicios entre conductores, y en Flota se ponen vehículos en taller: ese conductor deja de sugerirse.» |
| 4:45–5:00 | Portada | Cierre | «Hecho 100 % con vibe coding en Claude Code: diseño, plan, 22 tareas revisadas por agentes y tests de punta a punta. Gracias.» |

## Comprobaciones antes de grabar
- [ ] «Restablecer demo» pulsado y sesión iniciada como `central@transferdeluxe.test`.
- [ ] Móvil con la PWA instalada y sesión de `conductor1@transferdeluxe.test`; ubicación permitida.
- [ ] Ninguna notificación personal visible en pantalla; sin datos reales.
- [ ] Duración final ≤ 5:00.
