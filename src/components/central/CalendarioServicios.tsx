import Link from "next/link";
import type { Servicio } from "@/lib/dominio/tipos";
import type { Vista } from "@/lib/dominio/periodo";
import { sumarDias } from "@/lib/dominio/periodo";
import { celdasMes, posicionarDia } from "@/lib/dominio/calendario";
import { diaMadrid } from "@/lib/dominio/geo";

export type FilaCal = Servicio & { conductor: { nombre: string } | null };

const COLOR: Record<string, string> = {
  pendiente: "border-amber-400 bg-amber-500/25 text-amber-100",
  asignado: "border-sky-400 bg-sky-500/25 text-sky-100",
  aceptado: "border-blue-400 bg-blue-500/25 text-blue-100",
  en_camino: "border-violet-400 bg-violet-500/25 text-violet-100",
  recogido: "border-indigo-400 bg-indigo-500/25 text-indigo-100",
  completado: "border-green-400 bg-green-500/25 text-green-100",
  cancelado: "border-slate-500 bg-slate-500/20 text-slate-300",
  subcontratado: "border-orange-400 bg-orange-500/25 text-orange-100",
};
const PUNTO: Record<string, string> = {
  pendiente: "bg-amber-400", asignado: "bg-sky-400", aceptado: "bg-blue-400", en_camino: "bg-violet-400",
  recogido: "bg-indigo-400", completado: "bg-green-400", cancelado: "bg-slate-500", subcontratado: "bg-orange-400",
};
const PX_MIN = 0.8; // px por minuto (48 px por hora)
const HORA_INI = 6;
const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const corto = (t: string) => t.split(",")[0].trim();
const trayecto = (s: Servicio) => `${corto(s.origen_texto)} → ${corto(s.destino_texto)}`;
const cab = (d: string) => cap(new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(new Date(`${d}T00:00:00Z`))).replace(".", "");

function Bloques({ filas }: { filas: FilaCal[] }) {
  const pos = posicionarDia(filas);
  const mad = pos.filter((b) => b.madrugada);
  return (
    <>
      {mad.length > 0 && (
        <div className="mb-1 space-y-0.5 rounded border border-slate-800 bg-slate-900/60 p-1" aria-label="Madrugada">
          <div className="text-[10px] uppercase text-slate-500">Madrugada</div>
          {mad.map((b) => (
            <Link key={b.servicio.id} href={`/central/servicios/${b.servicio.id}`} className={`block truncate rounded border-l-4 px-1 text-xs ${COLOR[b.servicio.estado]}`}>
              {hora.format(new Date(b.servicio.fecha_hora_recogida))} {trayecto(b.servicio)}
            </Link>
          ))}
        </div>
      )}
      <div className="relative" style={{ height: (24 - HORA_INI) * 60 * PX_MIN }}>
        {pos.filter((b) => !b.madrugada).map((b) => {
          const s = b.servicio;
          return (
            <Link key={s.id} href={`/central/servicios/${s.id}`} title={`${trayecto(s)} · ${s.pasajeros} pax`}
              className={`absolute overflow-hidden rounded border-l-4 px-1 text-[11px] leading-tight hover:z-10 hover:brightness-125 ${COLOR[s.estado]}`}
              style={{ top: b.top * PX_MIN, height: Math.max(30, b.height * PX_MIN - 1), left: `${(b.col / b.cols) * 100}%`, width: `calc(${100 / b.cols}% - 2px)` }}>
              <span className="font-semibold">{hora.format(new Date(s.fecha_hora_recogida))}</span> {trayecto(s)}
              <div className="truncate">{s.pasajeros} pax · {s.conductor?.nombre ?? "sin conductor"}</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function Rejilla({ dias, filas, hoy }: { dias: string[]; filas: FilaCal[]; hoy: string }) {
  const por = new Map<string, FilaCal[]>();
  for (const f of filas) { const d = diaMadrid(f.fecha_hora_recogida); (por.get(d) ?? por.set(d, []).get(d)!).push(f); }
  const horas = Array.from({ length: 24 - HORA_INI }, (_, i) => HORA_INI + i);
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <div style={{ minWidth: dias.length > 1 ? 720 : 0 }}>
        <div className="flex border-b border-slate-800 bg-slate-900 text-sm">
          <div className="w-12 shrink-0" />
          {dias.map((d) => (
            <div key={d} className={`flex-1 px-2 py-1.5 text-center font-medium ${d === hoy ? "bg-marca/30 text-white" : "text-slate-300"}`}>{cab(d)}</div>
          ))}
        </div>
        <div className="flex">
          <div className="w-12 shrink-0 text-right text-[11px] text-slate-500">
            {horas.map((h) => <div key={h} style={{ height: 60 * PX_MIN }} className="pr-1">{String(h).padStart(2, "0")}:00</div>)}
          </div>
          {dias.map((d) => (
            <div key={d} className={`flex-1 border-l border-slate-800 p-0.5 ${d === hoy ? "bg-marca/10" : ""}`}>
              <Bloques filas={por.get(d) ?? []} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CalendarioServicios({ vista, desde, inicio, filas, hoy }: { vista: Vista; desde: string; inicio: string; filas: FilaCal[]; hoy: string }) {
  if (vista === "dia") return <Rejilla dias={[desde]} filas={filas} hoy={hoy} />;
  if (vista === "semana") return <Rejilla dias={Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i))} filas={filas} hoy={hoy} />;

  const por = new Map<string, FilaCal[]>();
  for (const f of [...filas].sort((a, b) => a.fecha_hora_recogida.localeCompare(b.fecha_hora_recogida))) {
    const d = diaMadrid(f.fecha_hora_recogida); (por.get(d) ?? por.set(d, []).get(d)!).push(f);
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <div className="grid grid-cols-7 bg-slate-900 text-center text-xs text-slate-400">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {celdasMes(desde).map((c) => {
          const lista = por.get(c.dia) ?? [];
          return (
            <div key={c.dia} className={`min-h-16 min-w-0 border-l border-t border-slate-800 p-0.5 sm:min-h-24 sm:p-1 ${c.enMes ? "" : "opacity-40"} ${c.dia === hoy ? "bg-marca/15" : ""}`}>
              <Link href={`/central/servicios?vista=dia&desde=${c.dia}&modo=calendario`} className="text-xs font-medium text-marca-claro hover:underline">{Number(c.dia.slice(8))}</Link>
              {/* móvil: punto + contador */}
              {lista.length > 0 && <div className="flex items-center gap-1 text-[10px] sm:hidden"><span className={`inline-block h-2 w-2 rounded-full ${PUNTO[lista[0].estado]}`} />{lista.length}</div>}
              <div className="hidden space-y-0.5 sm:block">
                {lista.slice(0, 3).map((s) => (
                  <Link key={s.id} href={`/central/servicios/${s.id}`} className={`block truncate rounded border-l-2 px-1 text-[11px] ${COLOR[s.estado]}`}>
                    {hora.format(new Date(s.fecha_hora_recogida))} {trayecto(s)}
                  </Link>
                ))}
                {lista.length > 3 && <Link href={`/central/servicios?vista=dia&desde=${c.dia}&modo=calendario`} className="block text-[11px] text-slate-400 hover:underline">+{lista.length - 3} más</Link>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
