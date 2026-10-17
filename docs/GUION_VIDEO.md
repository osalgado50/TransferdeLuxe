# Guion del vídeo demo (≤ 5 min)

> Entregable 5. Grabar en 1920×1080: la central en el ordenador y la app **TDL Conductor** en el móvil (o la versión web
> del conductor en una ventana de incógnito). Solo datos de demostración y marca ficticia (TransferdeLuxe).

| Tiempo | Pantalla | Qué se enseña | Texto (voz en off) |
|---|---|---|---|
| 0:00–0:20 | Portada (`/`) | El problema | «Una empresa de traslados de la Costa Dorada —ficticia, TransferdeLuxe— recibe reservas por teléfono y formularios y coordina a sus conductores a mano. He construido su web de reservas, su centro de control y la app de sus conductores, 100 % con vibe coding en Claude Code.» |
| 0:20–0:55 | Portada → formulario (móvil) | Reserva del cliente | «El cliente reserva en castellano, catalán o inglés. Toca la flecha y rellena la recogida con su ubicación, o dicta el destino con el micrófono. Pasajeros y maletas con botones grandes: la web elige el vehículo. No deja reservar en el pasado y, antes de aceptar, comprueba si hay algún conductor libre; si no lo hay, ofrece WhatsApp o llamar a la central.» |
| 0:55–1:30 | `/central` | Panel en vivo | «La reserva entra al instante en la central. Los coches circulan en el mapa por carretera; a la derecha, la actividad y las alertas: retrasos, rechazos, servicios fuera de horario. Para que el jurado lo vea funcionando, la demo trabaja sola: sus conductores aceptan, salen, recogen y terminan.» |
| 1:30–2:10 | Hoja de ruta de mañana → ⚡ Asignar automáticamente | Asignación automática | «Con un botón, la central propone conductor para cada servicio teniendo en cuenta turnos, pausas, plazas, maletas, distancias y el tiempo entre servicios. Se puede cambiar cada línea antes de confirmar; lo que nadie puede hacer queda sin asignar y explica por qué.» |
| 2:10–2:50 | Móvil: servicio nuevo → aceptar → navegación | App del conductor | «Al conductor le llega el aviso y acepta con una cuenta atrás. Avanza con un solo botón: en camino, carga, descarga. El mapa va en el sentido de la marcha, se acerca solo en los cruces y se abre a pantalla completa. Si se le acumulan servicios, los devuelve a la central con la ✕.» |
| 2:50–3:20 | Móvil: «Avisar al cliente» → página de seguimiento | Cliente informado | «Con un toque, el conductor avisa al cliente por WhatsApp; el cliente sigue el coche en directo y ve la hora estimada de llegada.» |
| 3:20–3:50 | Móvil: Ticket → Combustible | Tickets por OCR | «El ticket de gasolina se fotografía y los datos se rellenan solos: litros, precio, importe, CIF y número de factura. Se comprueba el precio con el del Ministerio y los kilómetros con los últimos del coche.» |
| 3:50–4:25 | Horarios · Informes · Flota y ajustes | Gestión | «Horarios por turnos, también nocturnos, planificados por semanas y meses; informes de servicios, kilómetros y consumo; registro de jornada; mantenimiento con avisos; y la flota y los conductores, que se pueden dar de baja conservando su historial.» |
| 4:25–5:00 | Repositorio · documentación | Vibe coding | «Todo se ha hecho conversando con Claude Code: 329 commits, 40 migraciones de base de datos, 840 tests automáticos, auditorías y pruebas de estrés, y una app nativa publicada por actualizaciones en el aire. El historial de prompts acompaña la entrega. Gracias.» |

## Comprobaciones antes de grabar
- [ ] En el panel en vivo hay datos de demo de hoy (si no, «✨ Cargar datos de demo»).
- [ ] Sesión de `central@transferdeluxe.test` en el ordenador y de un conductor de demo en el móvil (o en incógnito).
- [ ] Si el móvil manda GPS real como conductor, la simulación deja quieto ese coche: para que se muevan solos, graba con
      otro conductor o sin la app abierta. Al terminar, cierra la sesión del conductor en el móvil (no debe quedar tu
      ubicación real a la vista del jurado).
- [ ] Ninguna notificación personal visible y nada de datos reales en pantalla (nombres, teléfonos, direcciones).
- [ ] Ajustes de iPhone → Desarrollador → HUD de gráficos desactivado (si no, sale el recuadro de FPS sobre el mapa).
- [ ] Duración final ≤ 5:00.
