# Historial de prompts — TransferdeLuxe

Plataforma: **Claude Code**. Registro automático (hook `UserPromptSubmit`).

## 2026-10-09 14:58 · Claude Code · sesión `b3c0e64f`

Ok, iniciamos el proyecto, léete los ficheros que tienes, a ver si lo tienes todo claro. Es importante que tengas claro las bases del concurso y todos los documentos que piden de log y y de presentación del proyecto para que tú lo vayas gestionando y, al final, lo puedas enviar sin problemas. ¿Ok? ¿Tienes alguna duda?

---

## 2026-10-09 15:51 · Claude Code · sesión `b3c0e64f`

<pasted_content id="e72c">
Hola, Oscar,


¡Gracias por inscribirte en el Hackathon de Vibe Coding para alumnos de Big School!


Hemos recibido correctamente tu inscripción. Estamos emocionados de contar con tu participación. Recuerda que tu aplicación debe construirse 100% mediante Vibe Coding con una o varias de las plataformas permitidas: Lovable, Claude Code, Codex, Replit y Antigravity. Cualquier otra plataforma de desarrollo con IA queda excluida.


Fechas clave (hora peninsular española):

• Cierre de inscripciones: hasta las 23:59h del 13 de octubre de 2026

• Fase de desarrollo: del 9 al 19 de octubre de 2026

• Envío de proyectos: hasta las 23:59h del 19 de octubre de 2026

• Anuncio oficial de ganadores: 28 de octubre de 2026


Entregables (todos en una carpeta de Google Drive con el permiso «Cualquier persona con el enlace puede ver»):

Documentación técnica (un solo Google Doc)
Aplicación desplegada y utilizable (URL y credenciales de prueba, si aplica)
Repositorio de código en GitHub (público, o privado compartido con automatizaciones@thebigschool.com)
Historial de prompts (Google Doc aparte)
Vídeo demostración (máximo 5 minutos)

Cuando tengas listo tu proyecto podrás enviarlo en este enlace: Enviar proyecto


Si tienes alguna pregunta o necesitas aclaraciones adicionales, escríbenos en el canal de Discord 🏆┃hackathon-vibecoding-e7 o directamente a BIG Helper @bighelper.ai


¡Te deseamos mucho éxito en el desarrollo de tu proyecto!


Atentamente,

El equipo de Big School

Máster de Inteligencia Artificial VII Edición

Sent via Automations on	Airtable
Unsubscribe
©2026 Airtable
</pasted_content id="e72c">

---

## 2026-10-09 18:36 · Claude Code · sesión `b3c0e64f`

¿Qué vamos a crear? La página web que te, que te he pasado es de una compañía real, de aquí de Salou, que puedes consultar toda la información, que tiene una flota de tres vehículos, ¿vale? Tiene dos vehículos de ocho plazas y un vehículo de siete plazas. Luego puede contratar autobuses de hasta 16 plazas. Lo que vamos a crear es un, una aplicación de control de los pedidos que se puedan hacer por la web, de los trayectos a, a seleccionar. Hay un formulario en la web, lo puedes investigar La aplicación será como un centro de control de los vehículos que circulan. El CRM que vamos a diseñar pues, tendrá el acceso para controlar los servicios, saber el estado en que se encuentran, eh, asignar trabajos o portes a los choferes, a cada chofer se le instalará una aplicación en el móvil que tendrá geolocalización para saber dónde está, y en la, eh, aplicación esta le podremos enviar servicios y el taxista aceptarlos, como si fuera un, un Uber, ¿vale? Pero serán de nuestra flota de conductores, que serán tres. ¿Vale? El conductor tendrá la posibilidad de rechazar el servicio por por X y ese porte volverá a la central con un aviso de que ese porte todavía no se ha asignado ningún conductor y habría que buscar una solución. El conductor, cuando cuando acepte el porte, tendrá un botón que cuando llegue al sitio con los pasajeros le dará un botón de carga con, con lo que quiere decir que tienen los clientes y otro botón de descarga. Con lo que quedará libre para el siguiente porte. Diariamente estas aplicaciones se les cargará una hoja de rutas con los portes y los eh, trabajos que haya que hacer. Que esto lo definirá el centro de control. A todo esto le pondremos también un control de combustible. ¿Vale? De los tickets que, que nos aporten los conductores. Los registraremos y los meteremos en una base de datos para saber todo lo que se ha gastado en, en consumibles. También puedes establecer un control de, cambios de aceite, neumáticos, todo esto ya lo, ya lo ampliaremos, ¿vale? Pero lo principal ahora es crear la, el, la aplicación del centro de control para que tenga acceso con estos choferes a los que habrá que diseñar una aplicación. También con geolocalización, como ya hemos dicho. ¿Vale? Si tienes alguna duda o pregunta, me dices y avanzamos.

---

## 2026-10-09 18:40 · Claude Code · sesión `b3c0e64f`

https://transfersvipluxe.com/

---

## 2026-10-09 18:50 · Claude Code · sesión `b3c0e64f`

A + C, página de reserva y alta manual

---

## 2026-10-09 18:52 · Claude Code · sesión `b3c0e64f`

Sí, de momento va a ser PWA, pero en un futuro lo haremos nativa para Android y iPhone. Pero lo dejaremos pendiente.

---

## 2026-10-09 18:53 · Claude Code · sesión `b3c0e64f`

A, manual con sugerencia

---

## 2026-10-09 18:54 · Claude Code · sesión `b3c0e64f`

A, foto del ticket con IA

---

## 2026-10-09 18:55 · Claude Code · sesión `b3c0e64f`

Tengo una duda sobre la lectura de los tickets. ¿Eso implica utilizar alguna conexión API con Claude? En caso afirmativo, ¿existen proveedores de OCR Creo que hay uno que se llama OCR Space o algo así, que, usamos, en algún programa de la empresa. Que se llama Stock, para reconocer las fotos de las matrículas. Buscaríamos un sistema de este estilo. Que tenga muchos reconocimientos OCR gratuitos y que tenga posibilidad de escalar en caso de que se necesite. Investígame este tema.

---

## 2026-10-09 19:38 · Claude Code · sesión `b3c0e64f`

vale, vamos con Haiku y lo que planteas

---

## 2026-10-09 19:39 · Claude Code · sesión `b3c0e64f`

Sí, con plazo de respuesta y paso en camino

---

## 2026-10-09 19:40 · Claude Code · sesión `b3c0e64f`

Sí, me cuadra; de momento sin facturación

---

## 2026-10-09 20:18 · Claude Code · sesión `b3c0e64f`

Si adelante

---

## 2026-10-09 20:21 · Claude Code · sesión `b3c0e64f`

Adelante

---

## 2026-10-09 23:17 · Claude Code · sesión `b3c0e64f`

cambia en el despliege, tengo Hostinger con el domnio y espacio web.

* ¿Quito el Gmail personal del checklist?
* ¿Tienes el PDF de las bases?


me recuerdas que necesitas?

---

## 2026-10-09 23:22 · Claude Code · sesión `b3c0e64f`

Sí, quita el Gmail y adelante con el plan.
pdf en docs

---

