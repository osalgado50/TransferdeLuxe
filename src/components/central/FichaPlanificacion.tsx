import { clienteServidor } from "@/lib/supabase/servidor";
import { indicadoresHoy } from "@/lib/central/puntualidad";
import { duracionEfectiva, duracionServicio, textoDuracion } from "@/lib/dominio/duracion";
import { rutaEnCache } from "@/lib/navegacion/ruta";
import { ESTADOS_PUNTUALIDAD } from "@/lib/dominio/puntualidad";
import type { Servicio } from "@/lib/dominio/tipos";
import ChipPuntualidad from "./ChipPuntualidad";

const punto = (lat: number | null, lng: number | null) => (lat != null && lng != null ? { lat, lng } : null);

/** Ficha del servicio: duración estimada (trayecto + carga/descarga) y semáforo de llegada a la recogida. */
export default async function FichaPlanificacion({ s }: { s: Servicio }) {
  const origen = punto(s.origen_lat, s.origen_lng), destino = punto(s.destino_lat, s.destino_lng);
  const ruta = origen && destino ? rutaEnCache(origen, destino) : null;
  const datos = { origen, destino, origenTexto: s.origen_texto, destinoTexto: s.destino_texto, guardadaMin: s.duracion_estimada_min, rutaMin: ruta ? ruta.duracionS / 60 : null };
  const texto = textoDuracion(duracionServicio(datos), duracionEfectiva(datos));
  const vigila = !!s.conductor_id && (ESTADOS_PUNTUALIDAD as readonly string[]).includes(s.estado);
  const ind = vigila ? (await indicadoresHoy(await clienteServidor(), new Date(), s.conductor_id!))[s.id] : undefined;
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm" aria-label="Planificación">
      <p><span className="text-slate-400">Duración estimada:</span> <span data-testid="duracion-estimada">{texto}</span></p>
      {ind && <p className="flex items-center gap-2"><span className="text-slate-400">Llegada a la recogida:</span><ChipPuntualidad ind={ind} /></p>}
    </section>
  );
}
