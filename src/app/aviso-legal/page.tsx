import Link from "next/link";
import PaginaLegal, { AVISO_WEB, Ext, Seccion } from "@/components/legal/PaginaLegal";

export const metadata = { title: "Aviso legal · TransferdeLuxe" };

export default function AvisoLegal() {
  return (
    <PaginaLegal titulo="Aviso legal">
      <Seccion titulo="1. Titular">
        <p>En cumplimiento del art. 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa de que esta aplicación pertenece al titular de transfersvipluxe.com; datos identificativos y de contacto en su <Ext href={AVISO_WEB}>aviso legal</Ext>.</p>
      </Seccion>
      <Seccion titulo="2. Objeto">
        <p>La aplicación «TVL Control» y la app «TVL Conductor» son herramientas internas de gestión de traslados (planificación, asignación a conductores, seguimiento y gastos). Además, ofrecen una página pública para solicitar reservas de traslados.</p>
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
        <p>Consulta la <Link href="/privacidad" className="text-marca-claro underline hover:text-white">política de privacidad</Link>.</p>
      </Seccion>
      <Seccion titulo="7. Ley aplicable y jurisdicción">
        <p>Este aviso se rige por la legislación española. Para cualquier controversia, las partes se someten a los juzgados y tribunales que correspondan conforme a la normativa aplicable, incluida la de consumidores y usuarios.</p>
      </Seccion>
    </PaginaLegal>
  );
}
