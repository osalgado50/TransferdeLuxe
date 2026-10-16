import Link from "next/link";
import type { ReactNode } from "react";
import type { Idioma } from "@/lib/i18n/portada";
import { Ext, FichaTitular, Seccion } from "./PaginaLegal";

/** Aviso legal en castellano (versión que prevalece), catalán e inglés. */
export const TITULO_AVISO: Record<Idioma, string> = { es: "Aviso legal", ca: "Avís legal", en: "Legal notice" };

const enlace = "text-marca-claro underline hover:text-white";

export function contenidoAviso(idioma: Idioma): ReactNode {
  if (idioma === "ca") return <AvisoCa />;
  if (idioma === "en") return <AvisoEn />;
  return <AvisoEs />;
}

function AvisoEs() {
  return (
    <>
      <Seccion titulo="1. Titular">
        <p>En cumplimiento del art. 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa de los datos identificativos del titular de esta aplicación:</p>
        <FichaTitular idioma="es" />
      </Seccion>
      <Seccion titulo="2. Objeto">
        <p>La aplicación «TransferdeLuxe Central» y la app «TDL Conductor» son herramientas internas de gestión de traslados (planificación, asignación a conductores, seguimiento y gastos). Además, ofrecen una página pública para solicitar reservas de traslados.</p>
      </Seccion>
      <Seccion titulo="3. Condiciones de uso">
        <p>El acceso a las zonas de gestión está restringido a personal autorizado con credenciales propias, que es responsable de custodiarlas. El usuario se compromete a usar la aplicación conforme a la ley y a este aviso, a facilitar datos veraces en las reservas y a no realizar acciones que dañen o sobrecarguen el servicio.</p>
      </Seccion>
      <Seccion titulo="4. Propiedad intelectual e industrial">
        <p>El diseño, código, logotipos y contenidos de la aplicación pertenecen a su titular o se usan con licencia. Queda prohibida su reproducción o transformación sin autorización.</p>
        <p>Mapas: © colaboradores de <Ext href="https://www.openstreetmap.org/copyright">OpenStreetMap</Ext>, datos con licencia ODbL.</p>
      </Seccion>
      <Seccion titulo="5. Responsabilidad">
        <p>El titular procura que la aplicación funcione de forma continua y que la información sea correcta, pero no garantiza la ausencia de interrupciones o errores. Las rutas, tiempos estimados y direcciones son orientativos. No se responsabiliza del uso indebido ni de los contenidos de sitios enlazados de terceros.</p>
      </Seccion>
      <Seccion titulo="6. Protección de datos">
        <p>Consulta la <Link href="/privacidad?lang=es" className={enlace}>política de privacidad</Link>.</p>
      </Seccion>
      <Seccion titulo="7. Ley aplicable y jurisdicción">
        <p>Este aviso se rige por la legislación española. Para cualquier controversia, las partes se someten a los juzgados y tribunales que correspondan conforme a la normativa aplicable, incluida la de consumidores y usuarios.</p>
      </Seccion>
    </>
  );
}

function AvisoCa() {
  return (
    <>
      <Seccion titulo="1. Titular">
        <p>En compliment de l’art. 10 de la Llei 34/2002, de serveis de la societat de la informació i de comerç electrònic (LSSI-CE), s’informa de les dades identificatives del titular d’aquesta aplicació:</p>
        <FichaTitular idioma="ca" />
      </Seccion>
      <Seccion titulo="2. Objecte">
        <p>L’aplicació «TransferdeLuxe Central» i l’app «TDL Conductor» són eines internes de gestió de trasllats (planificació, assignació a conductors, seguiment i despeses). A més, ofereixen una pàgina pública per sol·licitar reserves de trasllats.</p>
      </Seccion>
      <Seccion titulo="3. Condicions d’ús">
        <p>L’accés a les zones de gestió està restringit a personal autoritzat amb credencials pròpies, que és responsable de custodiar-les. L’usuari es compromet a fer servir l’aplicació d’acord amb la llei i amb aquest avís, a facilitar dades veraces a les reserves i a no fer accions que malmetin o sobrecarreguin el servei.</p>
      </Seccion>
      <Seccion titulo="4. Propietat intel·lectual i industrial">
        <p>El disseny, el codi, els logotips i els continguts de l’aplicació pertanyen al seu titular o s’utilitzen amb llicència. Queda prohibida la seva reproducció o transformació sense autorització.</p>
        <p>Mapes: © col·laboradors d’<Ext href="https://www.openstreetmap.org/copyright">OpenStreetMap</Ext>, dades amb llicència ODbL.</p>
      </Seccion>
      <Seccion titulo="5. Responsabilitat">
        <p>El titular procura que l’aplicació funcioni de manera contínua i que la informació sigui correcta, però no garanteix l’absència d’interrupcions o errors. Les rutes, els temps estimats i les adreces són orientatius. No es responsabilitza de l’ús indegut ni dels continguts de llocs enllaçats de tercers.</p>
      </Seccion>
      <Seccion titulo="6. Protecció de dades">
        <p>Consulta la <Link href="/privacidad?lang=ca" className={enlace}>política de privacitat</Link>.</p>
      </Seccion>
      <Seccion titulo="7. Llei aplicable i jurisdicció">
        <p>Aquest avís es regeix per la legislació espanyola. Per a qualsevol controvèrsia, les parts se sotmeten als jutjats i tribunals que corresponguin d’acord amb la normativa aplicable, inclosa la de consumidors i usuaris.</p>
      </Seccion>
    </>
  );
}

function AvisoEn() {
  return (
    <>
      <Seccion titulo="1. Owner">
        <p>In accordance with Art. 10 of Spanish Law 34/2002 on Information Society Services and Electronic Commerce (LSSI-CE), the identification details of the owner of this application are as follows:</p>
        <FichaTitular idioma="en" />
      </Seccion>
      <Seccion titulo="2. Purpose">
        <p>The “TransferdeLuxe Central” application and the “TDL Conductor” app are internal tools for managing transfers (planning, assignment to drivers, tracking and expenses). They also provide a public page to request transfer bookings.</p>
      </Seccion>
      <Seccion titulo="3. Terms of use">
        <p>Access to the management areas is restricted to authorised staff with their own credentials, who are responsible for keeping them safe. Users undertake to use the application in accordance with the law and this notice, to provide truthful information when booking and not to take any action that could damage or overload the service.</p>
      </Seccion>
      <Seccion titulo="4. Intellectual and industrial property">
        <p>The design, code, logos and content of the application belong to its owner or are used under licence. Their reproduction or transformation without authorisation is prohibited.</p>
        <p>Maps: © <Ext href="https://www.openstreetmap.org/copyright">OpenStreetMap</Ext> contributors, data licensed under the ODbL.</p>
      </Seccion>
      <Seccion titulo="5. Liability">
        <p>The owner endeavours to keep the application running continuously and the information accurate, but does not guarantee that there will be no interruptions or errors. Routes, estimated times and addresses are for guidance only. The owner is not liable for misuse or for the content of linked third-party sites.</p>
      </Seccion>
      <Seccion titulo="6. Data protection">
        <p>See the <Link href="/privacidad?lang=en" className={enlace}>privacy policy</Link>.</p>
      </Seccion>
      <Seccion titulo="7. Governing law and jurisdiction">
        <p>This notice is governed by Spanish law. Any dispute shall be submitted to the competent courts under the applicable regulations, including consumer protection law.</p>
      </Seccion>
    </>
  );
}
