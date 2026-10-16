import type { ReactNode } from "react";
import type { Idioma } from "@/lib/i18n/portada";
import { AVISO_WEB, Ext, PRIVACIDAD_WEB, Seccion } from "./PaginaLegal";

/** Política de privacidad en castellano (versión que prevalece), catalán e inglés. */
export const TITULO_PRIVACIDAD: Record<Idioma, string> = { es: "Política de privacidad", ca: "Política de privacitat", en: "Privacy policy" };

export function contenidoPrivacidad(idioma: Idioma): ReactNode {
  if (idioma === "ca") return <PrivacidadCa />;
  if (idioma === "en") return <PrivacidadEn />;
  return <PrivacidadEs />;
}

function PrivacidadEs() {
  return (
    <>
      <p className="text-base text-slate-300">
        Esta política se aplica a la aplicación web de gestión <strong>«TVL Control»</strong> (incluida la página pública de reservas)
        y a la aplicación móvil para conductores <strong>«TVL Conductor»</strong>. Complementa la{" "}
        <Ext href={PRIVACIDAD_WEB}>política de privacidad de transfersvipluxe.com</Ext>.
      </p>
      <Seccion titulo="1. Responsable del tratamiento">
        <p>Responsable: el titular de transfersvipluxe.com; datos identificativos y de contacto en su <Ext href={AVISO_WEB}>aviso legal</Ext>.</p>
      </Seccion>
      <Seccion titulo="2. Finalidades y bases legales">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Reservas de traslados</strong> (nombre, contacto, direcciones, fecha, pasajeros y equipaje): gestionar y prestar el servicio solicitado. Base: ejecución de un contrato o medidas precontractuales (art. 6.1.b RGPD).</li>
          <li><strong>Gestión de conductores y servicios</strong> (asignación, historial, incidencias): base en la relación laboral o de prestación de servicios (art. 6.1.b RGPD) y en el cumplimiento de obligaciones legales (art. 6.1.c RGPD).</li>
          <li><strong>Geolocalización de conductores</strong>: la app «TVL Conductor» envía la posición <strong>solo mientras el conductor tiene activado «En servicio»</strong>, para coordinar recogidas e informar al centro de control. Nunca se recoge fuera de la jornada ni con el interruptor desactivado. Se trata conforme al art. 90 LOPDGDD y al art. 20.3 del Estatuto de los Trabajadores, con información previa, expresa y clara al conductor sobre su existencia y características.</li>
          <li><strong>Fotos de tickets de combustible</strong>: gestión y justificación de gastos del servicio (art. 6.1.b y 6.1.c RGPD).</li>
          <li><strong>Token de notificaciones</strong> del dispositivo: avisar al conductor de servicios asignados o modificados (art. 6.1.b RGPD).</li>
          <li><strong>Avisos al cliente sobre su traslado</strong> (conductor en camino, retraso, llegada o cambio de conductor): el conductor o la central abren WhatsApp o SMS con el mensaje ya escrito y lo envían al teléfono que el cliente indicó al reservar. Son mensajes de servicio, sin publicidad. Base: ejecución del contrato (art. 6.1.b RGPD). En la central queda anotado qué aviso se envió y cuándo, no el contenido de la conversación.</li>
          <li><strong>Página de seguimiento del traslado</strong>: el enlace del aviso abre una página sin registro con un código aleatorio, que solo muestra el estado del servicio, la posición del vehículo mientras va a recogerte o te lleva, la hora estimada de llegada, el nombre de pila del conductor y el modelo y matrícula del vehículo. Nunca muestra tus datos ni los de otros clientes y deja de funcionar 30 minutos después de terminar el traslado. Base: ejecución del contrato (art. 6.1.b RGPD); para el conductor, el mismo fundamento que la geolocalización.</li>
          <li><strong>Registro de jornada</strong>: obligación legal del art. 34.9 ET (art. 6.1.c RGPD).</li>
        </ul>
      </Seccion>
      <Seccion titulo="3. Plazos de conservación">
        <ul className="list-disc space-y-2 pl-5">
          <li>Posiciones GPS: <strong>30 días</strong>; se eliminan con una purga automática diaria.</li>
          <li>Registro de jornada: <strong>4 años</strong> (art. 34.9 ET).</li>
          <li>Reservas, servicios y tickets de gasto: el tiempo necesario para prestar el servicio y, después, durante los plazos legales (obligaciones fiscales, contables y de transporte).</li>
          <li>Token de notificaciones: mientras la sesión del conductor esté activa en el dispositivo.</li>
          <li>Enlace de seguimiento del traslado: activo hasta 30 minutos después de terminar o cancelar el servicio.</li>
        </ul>
      </Seccion>
      <Seccion titulo="4. Encargados del tratamiento y destinatarios">
        <p>No se ceden datos a terceros salvo obligación legal. Participan como encargados:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Supabase</strong>: base de datos, autenticación y almacenamiento, alojados en la UE (París).</li>
          <li><strong>Hostinger</strong>: alojamiento de la aplicación web.</li>
          <li><strong>Expo</strong>: envío de notificaciones push a la app de conductores.</li>
          <li><strong>WhatsApp (Meta) o tu operador de telefonía</strong>: solo cuando te enviamos un aviso del traslado; el mensaje se envía desde el teléfono del conductor o de la central y lo trata el servicio de mensajería elegido.</li>
          <li><strong>OpenStreetMap / Nominatim / OSRM</strong>: búsqueda de direcciones y cálculo de rutas. Solo reciben la dirección o coordenadas consultadas, sin otros datos personales del cliente.</li>
          <li><strong>Dictado por voz (opcional)</strong>: si pulsas el micrófono para dictar una dirección, el reconocimiento de voz lo hace tu navegador con el servicio de su fabricante (p. ej. Google o Apple). Nosotros no recibimos el audio, solo el texto de la dirección.</li>
        </ul>
      </Seccion>
      <Seccion titulo="5. Derechos">
        <p>Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad dirigiéndote al responsable por los medios indicados en su <Ext href={AVISO_WEB}>aviso legal</Ext>.</p>
        <p>Si consideras que el tratamiento no es adecuado, puedes reclamar ante la Agencia Española de Protección de Datos (<Ext href="https://www.aepd.es">aepd.es</Ext>).</p>
      </Seccion>
      <Seccion titulo="6. Cookies">
        <p>La aplicación no usa cookies de terceros ni de analítica o publicidad. Solo utiliza <strong>cookies técnicas de sesión</strong>, imprescindibles para mantener el acceso de usuarios autenticados, exentas de consentimiento (art. 22.2 LSSI-CE).</p>
      </Seccion>
    </>
  );
}

function PrivacidadCa() {
  return (
    <>
      <p className="text-base text-slate-300">
        Aquesta política s’aplica a l’aplicació web de gestió <strong>«TVL Control»</strong> (inclosa la pàgina pública de reserves)
        i a l’aplicació mòbil per a conductors <strong>«TVL Conductor»</strong>. Complementa la{" "}
        <Ext href={PRIVACIDAD_WEB}>política de privacitat de transfersvipluxe.com</Ext>.
      </p>
      <Seccion titulo="1. Responsable del tractament">
        <p>Responsable: el titular de transfersvipluxe.com; dades identificatives i de contacte al seu <Ext href={AVISO_WEB}>avís legal</Ext>.</p>
      </Seccion>
      <Seccion titulo="2. Finalitats i bases legals">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Reserves de trasllats</strong> (nom, contacte, adreces, data, passatgers i equipatge): gestionar i prestar el servei sol·licitat. Base: execució d’un contracte o mesures precontractuals (art. 6.1.b RGPD).</li>
          <li><strong>Gestió de conductors i serveis</strong> (assignació, historial, incidències): base en la relació laboral o de prestació de serveis (art. 6.1.b RGPD) i en el compliment d’obligacions legals (art. 6.1.c RGPD).</li>
          <li><strong>Geolocalització de conductors</strong>: l’app «TVL Conductor» envia la posició <strong>només mentre el conductor té activat «En servei»</strong>, per coordinar recollides i informar el centre de control. Mai no es recull fora de la jornada ni amb l’interruptor desactivat. Es tracta d’acord amb l’art. 90 LOPDGDD i l’art. 20.3 de l’Estatut dels Treballadors, amb informació prèvia, expressa i clara al conductor sobre la seva existència i característiques.</li>
          <li><strong>Fotos de tiquets de combustible</strong>: gestió i justificació de despeses del servei (art. 6.1.b i 6.1.c RGPD).</li>
          <li><strong>Testimoni de notificacions</strong> del dispositiu: avisar el conductor de serveis assignats o modificats (art. 6.1.b RGPD).</li>
          <li><strong>Avisos al client sobre el seu trasllat</strong> (conductor de camí, retard, arribada o canvi de conductor): el conductor o la central obren WhatsApp o SMS amb el missatge ja escrit i l’envien al telèfon que el client va indicar en reservar. Són missatges de servei, sense publicitat. Base: execució del contracte (art. 6.1.b RGPD). A la central queda anotat quin avís s’ha enviat i quan, no el contingut de la conversa.</li>
          <li><strong>Pàgina de seguiment del trasllat</strong>: l’enllaç de l’avís obre una pàgina sense registre amb un codi aleatori, que només mostra l’estat del servei, la posició del vehicle mentre et va a recollir o et porta, l’hora estimada d’arribada, el nom de pila del conductor i el model i la matrícula del vehicle. Mai no mostra les teves dades ni les d’altres clients i deixa de funcionar 30 minuts després d’acabar el trasllat. Base: execució del contracte (art. 6.1.b RGPD); per al conductor, el mateix fonament que la geolocalització.</li>
          <li><strong>Registre de jornada</strong>: obligació legal de l’art. 34.9 ET (art. 6.1.c RGPD).</li>
        </ul>
      </Seccion>
      <Seccion titulo="3. Terminis de conservació">
        <ul className="list-disc space-y-2 pl-5">
          <li>Posicions GPS: <strong>30 dies</strong>; s’eliminen amb una purga automàtica diària.</li>
          <li>Registre de jornada: <strong>4 anys</strong> (art. 34.9 ET).</li>
          <li>Reserves, serveis i tiquets de despesa: el temps necessari per prestar el servei i, després, durant els terminis legals (obligacions fiscals, comptables i de transport).</li>
          <li>Testimoni de notificacions: mentre la sessió del conductor estigui activa al dispositiu.</li>
          <li>Enllaç de seguiment del trasllat: actiu fins a 30 minuts després d’acabar o cancel·lar el servei.</li>
        </ul>
      </Seccion>
      <Seccion titulo="4. Encarregats del tractament i destinataris">
        <p>No es cedeixen dades a tercers excepte per obligació legal. Hi participen com a encarregats:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Supabase</strong>: base de dades, autenticació i emmagatzematge, allotjats a la UE (París).</li>
          <li><strong>Hostinger</strong>: allotjament de l’aplicació web.</li>
          <li><strong>Expo</strong>: enviament de notificacions push a l’app de conductors.</li>
          <li><strong>WhatsApp (Meta) o el teu operador de telefonia</strong>: només quan t’enviem un avís del trasllat; el missatge s’envia des del telèfon del conductor o de la central i el tracta el servei de missatgeria escollit.</li>
          <li><strong>OpenStreetMap / Nominatim / OSRM</strong>: cerca d’adreces i càlcul de rutes. Només reben l’adreça o les coordenades consultades, sense altres dades personals del client.</li>
          <li><strong>Dictat per veu (opcional)</strong>: si toques el micròfon per dictar una adreça, el reconeixement de veu el fa el teu navegador amb el servei del seu fabricant (p. ex. Google o Apple). Nosaltres no rebem l’àudio, només el text de l’adreça.</li>
        </ul>
      </Seccion>
      <Seccion titulo="5. Drets">
        <p>Pots exercir els drets d’accés, rectificació, supressió, oposició, limitació del tractament i portabilitat adreçant-te al responsable pels mitjans indicats al seu <Ext href={AVISO_WEB}>avís legal</Ext>.</p>
        <p>Si consideres que el tractament no és adequat, pots reclamar davant l’Agència Espanyola de Protecció de Dades (<Ext href="https://www.aepd.es">aepd.es</Ext>).</p>
      </Seccion>
      <Seccion titulo="6. Galetes">
        <p>L’aplicació no fa servir galetes de tercers ni d’analítica o publicitat. Només utilitza <strong>galetes tècniques de sessió</strong>, imprescindibles per mantenir l’accés d’usuaris autenticats, exemptes de consentiment (art. 22.2 LSSI-CE).</p>
      </Seccion>
    </>
  );
}

function PrivacidadEn() {
  return (
    <>
      <p className="text-base text-slate-300">
        This policy applies to the <strong>“TVL Control”</strong> management web app (including the public booking page)
        and to the <strong>“TVL Conductor”</strong> mobile app for drivers. It supplements the{" "}
        <Ext href={PRIVACIDAD_WEB}>transfersvipluxe.com privacy policy</Ext>.
      </p>
      <Seccion titulo="1. Data controller">
        <p>Controller: the owner of transfersvipluxe.com; identification and contact details in its <Ext href={AVISO_WEB}>legal notice</Ext>.</p>
      </Seccion>
      <Seccion titulo="2. Purposes and legal bases">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Transfer bookings</strong> (name, contact details, addresses, date, passengers and luggage): to manage and provide the requested service. Legal basis: performance of a contract or pre-contractual steps (Art. 6(1)(b) GDPR).</li>
          <li><strong>Management of drivers and services</strong> (assignment, history, incidents): based on the employment or service relationship (Art. 6(1)(b) GDPR) and on compliance with legal obligations (Art. 6(1)(c) GDPR).</li>
          <li><strong>Driver geolocation</strong>: the “TVL Conductor” app sends the position <strong>only while the driver has “On duty” switched on</strong>, to coordinate pick-ups and keep the dispatch centre informed. It is never collected outside working hours or with the switch off. It is processed in accordance with Art. 90 of the Spanish Data Protection Act (LOPDGDD) and Art. 20.3 of the Workers’ Statute, with prior, express and clear information to the driver about its existence and features.</li>
          <li><strong>Photos of fuel receipts</strong>: management and justification of service expenses (Art. 6(1)(b) and 6(1)(c) GDPR).</li>
          <li><strong>Device notification token</strong>: to notify the driver of assigned or modified services (Art. 6(1)(b) GDPR).</li>
          <li><strong>Notices to customers about their transfer</strong> (driver on the way, delay, arrival or change of driver): the driver or the dispatch centre opens WhatsApp or SMS with the message already written and sends it to the phone number the customer gave when booking. These are service messages, with no advertising. Legal basis: performance of the contract (Art. 6(1)(b) GDPR). The dispatch centre only records which notice was sent and when, not the content of the conversation.</li>
          <li><strong>Transfer tracking page</strong>: the link in the notice opens a page with no sign-up and a random code, which only shows the status of the service, the vehicle’s position while it is coming to pick you up or driving you, the estimated arrival time, the driver’s first name and the vehicle’s model and number plate. It never shows your data or that of other customers, and it stops working 30 minutes after the transfer ends. Legal basis: performance of the contract (Art. 6(1)(b) GDPR); for the driver, the same basis as geolocation.</li>
          <li><strong>Working-time record</strong>: legal obligation under Art. 34.9 of the Workers’ Statute (Art. 6(1)(c) GDPR).</li>
        </ul>
      </Seccion>
      <Seccion titulo="3. Retention periods">
        <ul className="list-disc space-y-2 pl-5">
          <li>GPS positions: <strong>30 days</strong>; deleted by an automatic daily purge.</li>
          <li>Working-time record: <strong>4 years</strong> (Art. 34.9 of the Workers’ Statute).</li>
          <li>Bookings, services and expense receipts: as long as needed to provide the service and, afterwards, for the statutory periods (tax, accounting and transport obligations).</li>
          <li>Notification token: while the driver’s session is active on the device.</li>
          <li>Transfer tracking link: active until 30 minutes after the service ends or is cancelled.</li>
        </ul>
      </Seccion>
      <Seccion titulo="4. Processors and recipients">
        <p>Data are not disclosed to third parties unless required by law. The following act as processors:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Supabase</strong>: database, authentication and storage, hosted in the EU (Paris).</li>
          <li><strong>Hostinger</strong>: hosting of the web app.</li>
          <li><strong>Expo</strong>: sending push notifications to the drivers’ app.</li>
          <li><strong>WhatsApp (Meta) or your phone operator</strong>: only when we send you a notice about your transfer; the message is sent from the driver’s or the dispatch centre’s phone and is handled by the chosen messaging service.</li>
          <li><strong>OpenStreetMap / Nominatim / OSRM</strong>: address search and route calculation. They only receive the address or coordinates being looked up, with no other personal data of the customer.</li>
          <li><strong>Voice dictation (optional)</strong>: if you tap the microphone to dictate an address, speech recognition is done by your browser using its vendor’s service (e.g. Google or Apple). We never receive the audio, only the text of the address.</li>
        </ul>
      </Seccion>
      <Seccion titulo="5. Your rights">
        <p>You can exercise your rights of access, rectification, erasure, objection, restriction of processing and portability by contacting the controller through the means indicated in its <Ext href={AVISO_WEB}>legal notice</Ext>.</p>
        <p>If you believe the processing is not appropriate, you can lodge a complaint with the Spanish Data Protection Agency (<Ext href="https://www.aepd.es">aepd.es</Ext>).</p>
      </Seccion>
      <Seccion titulo="6. Cookies">
        <p>The app does not use third-party, analytics or advertising cookies. It only uses <strong>technical session cookies</strong>, essential to keep authenticated users signed in, which are exempt from consent (Art. 22.2 of the Spanish Information Society Services Act, LSSI-CE).</p>
      </Seccion>
    </>
  );
}
