# Guion del vídeo demo (≤ 5 min)

> Entregable 5. Grabar en 1920×1080: la central en el ordenador y la app **TDL Conductor** en el iPhone (o la versión web
> del conductor en una ventana de incógnito). Solo datos de demostración y marca ficticia (TransferdeLuxe).
> Voz en off ya grabada, bloque a bloque, en [`docs/video/voz/`](video/voz/) (voz «Mónica», castellano de España, de
> macOS) y seguida en [`docs/video/Voz_en_off_completa.m4a`](video/Voz_en_off_completa.m4a). La voz suma 2:27: el resto
> de cada bloque es imagen sin voz para que se vea la acción (no hace falta llegar a 5:00; mejor 3:30–4:30 y con ritmo).
> Regenerarla tras cambiar los textos: `python3 -I scripts/voz_en_off.py docs/video/voz`.

## Bloques

| # | Tiempo | Pantalla | Qué se enseña | Voz en off (audio · duración) |
|---|---|---|---|---|
| 1 | 0:00–0:20 | Portada (`/`) en el ordenador | El problema | `01_portada.m4a` · 15 s |
| 2 | 0:20–0:55 | Portada → reserva en el móvil | Reserva del cliente | `02_reserva.m4a` · 20 s |
| 3 | 0:55–1:25 | `/central` | Panel en vivo | `03_panel.m4a` · 15 s |
| 4 | 1:25–1:55 | Hoja de ruta de mañana → ⚡ Asignar automáticamente | Asignación automática | `04_asignacion.m4a` · 16 s |
| 5 | 1:55–2:40 | **Pantalla dividida**: central + móvil del conductor | App del conductor en tiempo real | `05_conductor.m4a` · 19 s |
| 6 | 2:40–3:10 | Ficha de un servicio en camino | La central lo controla todo | `06_central_manda.m4a` · 14 s |
| 7 | 3:10–3:30 | Móvil: «Avisar al cliente» → página de seguimiento | Cliente informado | `07_cliente.m4a` · 7 s |
| 8 | 3:30–3:55 | Móvil: Ticket → central: Combustible | Tickets por OCR | `08_ticket.m4a` · 12 s |
| 8b | — | **Pantalla dividida**: app del conductor + central | Checklist al fichar y hoja de cierre con daños | `08b_jornada.m4a` |
| 9 | 3:55–4:25 | Horarios · Informes · Flota y ajustes | Gestión | `09_gestion.m4a` · 14 s |
| 10 | 4:25–4:55 | Repositorio · documentación | Vibe coding | `10_cierre.m4a` · 16 s |

### Texto de la voz en off

1. «Transfer de Luxe es una empresa de traslados de la Costa Dorada, inventada para este concurso. Recibía las reservas
   por teléfono y coordinaba a sus conductores a mano. He construido su web de reservas, su centro de control y la
   aplicación de sus conductores, todo con Claude Code.»
2. «El cliente reserva desde el móvil, en castellano, catalán o inglés. Toca la flecha y la recogida se rellena con su
   ubicación; el destino lo puede dictar. Pasajeros y maletas, con botones grandes, y la web elige el vehículo. Antes de
   aceptar, comprueba que haya algún conductor libre; si no lo hay, le propone otras horas con coche libre.»
3. «La reserva entra al instante en el centro de control. En el mapa, los coches circulan por carretera; a la derecha,
   la actividad y las alertas. Para que el jurado lo vea funcionando, la demo trabaja sola: sus conductores aceptan,
   salen, recogen y terminan.»
4. «Con un solo botón, la central propone un conductor para cada servicio de mañana, teniendo en cuenta turnos, pausas,
   plazas, maletas, distancias y el tiempo entre servicios. Cada línea se puede cambiar antes de confirmar, y lo que
   nadie puede hacer queda sin asignar, explicando por qué.»
5. «Al conductor le llega el aviso y lo acepta antes de que acabe la cuenta atrás. A la izquierda, la central lo ve
   cambiar en el mismo segundo. Avanza con un único botón: en camino, carga y descarga. El mapa gira con el coche, se
   acerca solo en los cruces y se abre a pantalla completa. Si no puede hacer un servicio, lo devuelve con un toque.»
6. «Y si un conductor no responde, la central manda: le quita el servicio aunque ya esté en camino, se lo pasa a otro,
   lo cancela o lo cierra. También cambia la hora, las direcciones o los pasajeros; el conductor recibe un aviso y todo
   queda en el historial.»
7. «Con un toque, el conductor avisa al cliente por WhatsApp. El cliente abre el enlace, sigue el coche en directo y ve
   a qué hora llegará.»
8. «El ticket de gasolina se fotografía y los datos se rellenan solos: litros, precio, importe, CIF y número de factura.
   La aplicación compara el precio con el del Ministerio y los kilómetros con los últimos del coche.»
9. «Al empezar el turno, el conductor revisa el coche con un checklist y la central lo ve. Al terminar, rellena la
   hoja de cierre: si ha habido un golpe o una rascada, lo marca en el dibujo del vehículo y a la central le salta una
   alerta roja al momento.»
10. «Horarios por turnos, también de noche, planificados por semanas y meses; informes de servicios, kilómetros y
   consumo; registro de jornada; mantenimiento con avisos; y la flota y los conductores, que se pueden dar de baja sin
   perder su historial.»
11. «Todo se ha hecho conversando con Claude Code: más de trescientos treinta commits, cuarenta migraciones de base de
    datos, más de ochocientas cuarenta pruebas automáticas y una aplicación nativa que se actualiza sin pasar por las
    tiendas. El historial de prompts acompaña la entrega. Gracias.»

## Plan de tomas

Grabar cada bloque por separado (si algo sale mal, se repite solo ese) y montarlos al final sobre su audio.

**Herramientas (gratuitas)**: QuickTime en el Mac. Ordenador: Archivo → Nueva grabación de pantalla (pantalla completa).
iPhone por cable: Archivo → Nueva grabación de película → en la flecha junto al botón rojo, elegir el iPhone como cámara
(graba la pantalla del móvil limpia). Montaje en iMovie: «Pantalla dividida» para el bloque 5.

| Toma | Dónde | Qué hacer, en orden |
|---|---|---|
| 1 | Ordenador · incógnito | Abrir la portada, bajar despacio hasta el formulario y volver arriba. |
| 2 | iPhone · Safari | Portada en castellano → cambiar a catalán y volver → «Usar mi ubicación» en la recogida → dictar «Aeropuerto de Reus» en el destino → 2 pasajeros, 2 maletas → nombre de prueba, teléfono 600 000 123, correo `prueba@ejemplo.test` → «Reservar ahora». Datos inventados. Si a esa hora no hay coche libre, mejor aún: se ve «Tenemos coche libre a estas horas» → pulsar «Reservar a las…». |
| 3 | Ordenador · `/central` | Panel en vivo con los coches moviéndose; pasar el ratón por un coche y por la columna de actividad. Debe verse la reserva de la toma 2 recién entrada. |
| 4 | Ordenador | Hoja de ruta de mañana → ⚡ Asignar automáticamente → enseñar la propuesta → cambiar un conductor en una línea → Confirmar. |
| 5 | **Las dos a la vez** | En el iPhone, la app con **Marc** (`conductor1@transferdeluxe.test`, turno 13:30–22:00): si no tiene la jornada abierta, Jornada → Iniciar. Iniciar las dos grabaciones y dar una palmada delante del Mac (para sincronizar al montar). En la central, asignar a Marc un servicio pendiente de hoy; en el iPhone, aceptarlo; luego EN CAMINO → abrir el mapa a pantalla completa → CARGA → DESCARGA. Que se vea el panel cambiando en cada paso. (Con tu móvil mandando GPS, la simulación deja de mover a Marc: lo llevas tú). |
| 6 | Ordenador | Ficha de un servicio en camino de la demo → ✏️ Editar servicio → cambiar la hora → Guardar (se ve en el historial) → «Reasignar» y elegir otro conductor. |
| 7 | iPhone | En un servicio en camino, «Avisar al cliente» → se abre WhatsApp con el mensaje (no enviarlo) → abrir el enlace de seguimiento en Safari. |
| 8 | iPhone + ordenador | Pestaña Ticket → «Probar con un ticket de ejemplo» (o foto a un ticket) → campos rellenos → Guardar. En la central, Combustible con el ticket nuevo. |
| 9 | Ordenador | Jornadas (panel «Ahora»: quién está trabajando, en pausa o fuera; registro con las pausas) → Horarios (vista de mes, turnos de mañana, tarde y noche) → Informes → Flota y ajustes, unos segundos en cada uno. |
| 10 | Ordenador | El repositorio en GitHub (lista de commits) → `docs/prompts/` → la documentación. |

**Montaje**: cada toma sobre su audio (`01…10`), recortando las esperas. Si una toma es más corta que su audio, congelar
el último fotograma o ralentizar un poco. Exportar en 1080p y comprobar que dura menos de 5:00.

## Cuándo grabar
Entre las **14:00 y las 21:30**: Marc está de turno (para la toma 5) y hay movimiento en el mapa. La empresa de demo
funciona sola (reservas que entran, central automática, conductores que fichan y se desfichan): no hace falta cargar
nada. Al terminar, si la reserva de la toma 2 sigue pendiente, asígnala o cancélala desde la central.

## Comprobaciones antes de grabar
- [ ] En el panel en vivo hay servicios de hoy (la demo funciona sola; si alguien archivó, «✨ Cargar datos de demo»).
- [ ] Sesión de `central@transferdeluxe.test` en el ordenador y de un conductor de demo en el móvil (o en incógnito).
- [ ] Si el móvil manda GPS real como conductor, la simulación deja quieto ese coche: para que se muevan solos, graba con
      otro conductor o sin la app abierta. Al terminar, cierra la sesión del conductor en el móvil (no debe quedar tu
      ubicación real a la vista del jurado).
- [ ] Modo «No molestar» en el Mac y en el iPhone: ninguna notificación personal visible y nada de datos reales en
      pantalla (nombres, teléfonos, direcciones, la barra de favoritos del navegador).
- [ ] Ajustes de iPhone → Desarrollador → HUD de gráficos desactivado (si no, sale el recuadro de FPS sobre el mapa).
- [ ] App «TDL Conductor» actualizada (ciérrala y ábrela una vez antes de grabar para que coja la última versión).
- [ ] Duración final ≤ 5:00.
