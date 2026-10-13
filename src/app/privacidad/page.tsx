import PaginaLegal, { AVISO_WEB, Ext, PRIVACIDAD_WEB, Seccion } from "@/components/legal/PaginaLegal";

export const metadata = { title: "Política de privacidad · TransferdeLuxe" };

export default function Privacidad() {
  return (
    <PaginaLegal titulo="Política de privacidad">
      <p className="text-sm text-slate-300">
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
        </ul>
      </Seccion>

      <Seccion titulo="5. Derechos">
        <p>Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad dirigiéndote al responsable por los medios indicados en su <Ext href={AVISO_WEB}>aviso legal</Ext>.</p>
        <p>Si consideras que el tratamiento no es adecuado, puedes reclamar ante la Agencia Española de Protección de Datos (<Ext href="https://www.aepd.es">aepd.es</Ext>).</p>
      </Seccion>

      <Seccion titulo="6. Cookies">
        <p>La aplicación no usa cookies de terceros ni de analítica o publicidad. Solo utiliza <strong>cookies técnicas de sesión</strong>, imprescindibles para mantener el acceso de usuarios autenticados, exentas de consentimiento (art. 22.2 LSSI-CE).</p>
      </Seccion>
    </PaginaLegal>
  );
}
