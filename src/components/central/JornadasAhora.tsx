"use client";
import { useEffect, useState, useTransition } from "react";
import { jornadaPorCentral } from "@/app/central/jornadas/actions";
import type { EstadoJornada } from "@/lib/dominio/jornada";

export interface FilaJornadaAhora { id: string; nombre: string; estado: EstadoJornada; desde: string | null }

const hm = (iso: string) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
/** «AAAA-MM-DDTHH:mm» de ahora en Madrid (valor por defecto del campo). */
const ahoraMadrid = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
  .format(new Date()).replace(" ", "T");

const CLAVE_MSG = "tdl-jornada-central";

const ETIQUETA: Record<EstadoJornada, { t: string; c: string }> = {
  fuera: { t: "Fuera de jornada", c: "bg-slate-700 text-slate-200" },
  trabajando: { t: "Trabajando", c: "bg-green-600/80 text-white" },
  en_pausa: { t: "En pausa", c: "bg-amber-500 text-slate-950" },
};

/**
 * Estado de la jornada de cada conductor ahora mismo, con «Empezar jornada» / «Terminar jornada» para la central (p. ej.
 * si se olvidó de abrirla o de cerrarla). La hora se puede corregir (por defecto, ahora) y queda registrado que fue la central.
 */
export default function JornadasAhora({ filas }: { filas: FilaJornadaAhora[] }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [momento, setMomento] = useState("");
  const [msg, setMsg] = useState<{ id: string; ok: boolean; t: string } | null>(null);
  const [pend, ini] = useTransition();
  // Lo guardado aquí se ve al momento (la lista que llega del servidor lo confirma al refrescar; entonces se descarta).
  const [hecho, setHecho] = useState<Record<string, Pick<FilaJornadaAhora, "estado" | "desde">>>({});
  useEffect(() => setHecho({}), [filas]);
  useEffect(() => {
    try {
      const m = sessionStorage.getItem(CLAVE_MSG);
      if (m) { sessionStorage.removeItem(CLAVE_MSG); setMsg(JSON.parse(m)); }
    } catch { /* sin almacenamiento: no pasa nada */ }
  }, []);

  const abrir = (id: string) => { setAbierta(id); setMomento(ahoraMadrid()); setMsg(null); };
  const guardar = (f: FilaJornadaAhora) => {
    const accion = f.estado === "fuera" ? "iniciar" : "finalizar";
    ini(async () => {
      const r = await jornadaPorCentral({ conductorId: f.id, accion, momento });
      setMsg({ id: f.id, ok: r.ok, t: r.mensaje });
      if (r.ok && r.estado) {
        setAbierta(null);
        setHecho((h) => ({ ...h, [f.id]: { estado: r.estado!, desde: r.desde ?? null } }));
        // El registro de abajo se pone al día recargando la página (en esta página ni router.refresh() ni volver a navegar
        // aplicaban la lista nueva: comprobado en el build de producción). El mensaje se conserva tras recargar.
        try { sessionStorage.setItem(CLAVE_MSG, JSON.stringify({ id: f.id, ok: true, t: r.mensaje })); } catch { /* sin almacenamiento */ }
        setTimeout(() => window.location.reload(), 900);
      }
    });
  };

  if (filas.length === 0) return null;
  return (
    <section aria-labelledby="jornadas-ahora" className="rounded-xl border border-slate-800 bg-slate-900/60">
      <h2 id="jornadas-ahora" className="border-b border-slate-800 px-4 py-2 text-base font-semibold text-marca-claro">Ahora</h2>
      <ul className="divide-y divide-slate-800">
        {filas.map((fila) => {
          const f = { ...fila, ...hecho[fila.id] };
          const empezar = f.estado === "fuera";
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-jornada-conductor={f.id}>
              <span className="min-w-36 font-medium text-white">{f.nombre}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ETIQUETA[f.estado].c}`}>{ETIQUETA[f.estado].t}</span>
              {f.desde && <span className="text-sm text-slate-400">desde {hm(f.desde)}</span>}
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {abierta === f.id ? (
                  <>
                    <label className="text-sm text-slate-300">{empezar ? "Empezó" : "Terminó"} el
                      <input type="datetime-local" value={momento} max={ahoraMadrid()} onChange={(e) => setMomento(e.target.value)}
                        className="ml-2 min-h-10 rounded-lg border border-slate-600 bg-slate-950 px-2 text-sm text-white" />
                    </label>
                    <button type="button" disabled={pend || !momento} onClick={() => guardar(f)}
                      className={`min-h-10 rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-50 ${empezar ? "bg-green-700 hover:bg-green-600" : "bg-red-700 hover:bg-red-600"}`}>
                      {pend ? "Guardando…" : empezar ? "Confirmar inicio" : "Confirmar cierre"}
                    </button>
                    <button type="button" onClick={() => setAbierta(null)} className="min-h-10 rounded-lg border border-slate-600 px-3 text-sm text-slate-300">Cancelar</button>
                  </>
                ) : (
                  <button type="button" onClick={() => abrir(f.id)} data-accion={empezar ? "empezar-jornada" : "terminar-jornada"}
                    className={`min-h-10 rounded-lg border px-3 text-sm font-semibold ${empezar ? "border-green-600 text-green-300" : "border-red-500 text-red-300"}`}>
                    {empezar ? "▶ Empezar jornada" : "■ Terminar jornada"}
                  </button>
                )}
              </span>
              {msg?.id === f.id && <p role={msg.ok ? "status" : "alert"} className={`w-full text-sm ${msg.ok ? "text-green-300" : "text-red-400"}`}>{msg.t}</p>}
            </li>
          );
        })}
      </ul>
      <p className="px-4 pb-3 text-xs text-slate-400">
        Para cuando un conductor se olvida de abrir o cerrar su jornada. Queda en el registro horario como hecho por la central
        y el conductor recibe un aviso. Terminarla desde aquí no pide la hoja de cierre del vehículo.
      </p>
    </section>
  );
}
