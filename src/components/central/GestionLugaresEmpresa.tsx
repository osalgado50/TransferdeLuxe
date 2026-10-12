"use client";
import { useState, useTransition } from "react";
import CampoDireccion from "@/components/comun/CampoDireccion";
import { borrarLugarEmpresa, guardarLugarEmpresa } from "@/app/central/lugares/actions";
import { filtrarLugaresEmpresa, type LugarEmpresa } from "@/lib/dominio/lugaresEmpresa";

const campo = "mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:border-marca-claro focus:outline-none";
const boton = "rounded bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-oscuro disabled:opacity-50";
const secundario = "rounded border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800";

type Dir = { texto: string; lat: string; lng: string };

function Editor({ lugar, alTerminar }: { lugar: LugarEmpresa | null; alTerminar: (msg: string) => void }) {
  const [nombre, setNombre] = useState(lugar?.nombre ?? "");
  const [telefono, setTelefono] = useState(lugar?.telefono ?? "");
  const [notas, setNotas] = useState(lugar?.notas ?? "");
  const [dir, setDir] = useState<Dir>({ texto: lugar?.direccion ?? "", lat: "", lng: "" });
  const [relleno] = useState(() => (lugar ? { n: 1, texto: lugar.direccion, lat: lugar.lat, lng: lugar.lng } : undefined));
  const [error, setError] = useState<string>();
  const [pendiente, empezar] = useTransition();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    empezar(async () => {
      const r = await guardarLugarEmpresa(lugar?.id ?? null, { nombre, direccion: dir.texto, lat: dir.lat, lng: dir.lng, telefono, notas });
      if (r.ok) alTerminar(lugar ? "Lugar actualizado" : "Lugar añadido");
      else setError(r.error);
    });
  }

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <h2 className="font-semibold text-marca-claro">{lugar ? `Editar «${lugar.nombre}»` : "Nuevo lugar"}</h2>
      <label className="block text-sm font-medium text-slate-200">Nombre
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={80} placeholder="Logística Ejemplo SL" className={campo} />
      </label>
      <CampoDireccion name="direccion" etiqueta="Dirección (elígela de la lista para fijar las coordenadas)" requerido
        valorInicial={lugar?.direccion} rellenar={relleno} onCambio={setDir} />
      {dir.texto.trim() !== "" && dir.lat === "" && (
        <p className="text-xs text-amber-300">Sin coordenadas: elige una sugerencia de la lista para que el mapa y la ruta sepan dónde es.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-200">Teléfono <span className="text-slate-400">(opcional)</span>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={30} inputMode="tel" className={campo} />
        </label>
        <label className="block text-sm font-medium text-slate-200">Notas <span className="text-slate-400">(opcional)</span>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} placeholder="Entrada por el muelle 3" className={campo} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button disabled={pendiente} className={boton}>{pendiente ? "Guardando…" : "Guardar"}</button>
        <button type="button" onClick={() => alTerminar("")} className={secundario}>Cancelar</button>
      </div>
    </form>
  );
}

export default function GestionLugaresEmpresa({ lugares }: { lugares: LugarEmpresa[] }) {
  const [editando, setEditando] = useState<LugarEmpresa | "nuevo" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string }>();
  const [filtro, setFiltro] = useState("");
  const [pendiente, empezar] = useTransition();
  const visibles = filtro.trim().length >= 2 ? filtrarLugaresEmpresa(lugares, filtro, lugares.length) : lugares;

  function borrar(l: LugarEmpresa) {
    if (!window.confirm(`¿Borrar el lugar «${l.nombre}»?`)) return;
    empezar(async () => {
      const r = await borrarLugarEmpresa(l.id);
      setMsg({ ok: r.ok, texto: r.ok ? "Lugar borrado" : r.error });
    });
  }

  return (
    <div className="space-y-4">
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-400"}`}>{msg.texto}</p>}
      {editando ? (
        <Editor key={editando === "nuevo" ? "nuevo" : editando.id} lugar={editando === "nuevo" ? null : editando}
          alTerminar={(t) => { setEditando(null); if (t) setMsg({ ok: true, texto: t }); }} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setMsg(undefined); setEditando("nuevo"); }} className={boton}>🏢 Añadir lugar</button>
          {lugares.length > 5 && (
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar…" aria-label="Buscar lugar"
              className="rounded border border-slate-600 bg-slate-900 px-2 py-2 text-sm" />
          )}
        </div>
      )}
      {!lugares.length ? (
        <p className="text-sm text-slate-400">Aún no hay lugares. Añade los clientes habituales para no tener que escribir su dirección.</p>
      ) : (
        <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
          {visibles.map((l) => (
            <li key={l.id} className="flex flex-wrap items-start gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">🏢 {l.nombre}</p>
                <p className="text-sm text-slate-400">{l.direccion}{l.lat == null && <span className="ml-1 text-amber-300">· sin coordenadas</span>}</p>
                {(l.telefono || l.notas) && <p className="text-xs text-slate-500">{[l.telefono, l.notas].filter(Boolean).join(" · ")}</p>}
              </div>
              <button type="button" disabled={pendiente} onClick={() => { setMsg(undefined); setEditando(l); }} className={secundario}>Editar</button>
              <button type="button" disabled={pendiente} onClick={() => borrar(l)}
                className="rounded border border-red-500 px-3 py-2 text-sm text-red-300 hover:bg-red-950">Borrar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
