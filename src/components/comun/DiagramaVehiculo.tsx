"use client";
import { ALTO_DIAGRAMA, ANCHO_DIAGRAMA, ZONAS_VEHICULO } from "@/lib/dominio/cierre";

/**
 * Coche visto desde arriba (DELANTERA arriba) con las zonas de la hoja de cierre. Con `alAlternar` es tocable
 * (botones con aria-pressed); sin él, es un mini-diagrama de solo lectura (central). Marcada = rojo con texto blanco.
 */
export default function DiagramaVehiculo({ zonas, alAlternar, mini = false }: { zonas: readonly string[]; alAlternar?: (id: string) => void; mini?: boolean }) {
  const marcadas = new Set(zonas);
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const rotulo = mini ? "text-[7px] leading-tight" : "text-[11px] sm:text-xs";
  return (
    <div className={`bg-slate-200 text-slate-600 ${mini ? "rounded-md p-1" : "rounded-xl p-1.5 sm:p-3"}`}>
      {mini ? <p aria-hidden="true" className={`text-center font-bold tracking-widest ${rotulo}`}>DEL.</p> : (
        // En el móvil los rótulos laterales van arriba (las zonas ganan ancho: ≥ 40 px); desde sm, a los lados.
        <p aria-hidden="true" className={`flex justify-between font-bold tracking-widest sm:justify-center ${rotulo}`}>
          <span className="sm:hidden">◀ IZQUIERDA</span><span>DELANTERA</span><span className="sm:hidden">DERECHA ▶</span>
        </p>
      )}
      <div className={`relative ${mini ? "" : "sm:px-5"}`}>
        {!mini && <span aria-hidden="true" className={`absolute left-0 top-1/2 hidden -translate-y-1/2 rotate-180 font-bold tracking-widest [writing-mode:vertical-rl] sm:block ${rotulo}`}>IZQUIERDA</span>}
        <div role={alAlternar ? "group" : "img"} aria-label={alAlternar ? "Diagrama del vehículo: toca las zonas dañadas hoy" : `Zonas dañadas: ${zonas.length ? ZONAS_VEHICULO.filter((z) => marcadas.has(z.id)).map((z) => z.etiqueta).join(", ") : "ninguna"}`}
          className="relative mx-auto block w-full" style={{ aspectRatio: `${ANCHO_DIAGRAMA} / ${ALTO_DIAGRAMA}`, maxWidth: mini ? 150 : 420 }}>
          {ZONAS_VEHICULO.map((z) => {
            const on = marcadas.has(z.id);
            // minHeight 0: la regla global de 44 px para botones en móvil deformaría el diagrama (las zonas ya miden ≥ 40 px).
            const estilo = { left: pct(z.x, ANCHO_DIAGRAMA), top: pct(z.y, ALTO_DIAGRAMA), width: pct(z.w, ANCHO_DIAGRAMA), height: pct(z.h, ALTO_DIAGRAMA), minHeight: 0 };
            const forma = z.tipo === "rueda" ? "rounded-[40%] " : z.tipo === "luz" ? "rounded-full " : "rounded-lg ";
            const color = on ? "border-red-700 bg-red-600 text-white" : z.tipo === "rueda" ? "border-slate-500 bg-slate-500 text-white" : z.tipo === "cristal" ? "border-sky-300 bg-sky-100 text-slate-700" : "border-slate-300 bg-white text-slate-700";
            const clase = `absolute flex items-center justify-center overflow-hidden border text-center leading-tight ${forma}${color} ${mini ? "text-[0px]" : "p-0.5 text-[10px] font-semibold sm:text-xs"}`;
            return alAlternar
              ? <button key={z.id} type="button" aria-pressed={on} aria-label={`${z.etiqueta}${on ? ", dañada" : ""}`} onClick={() => alAlternar(z.id)} style={estilo} className={`${clase} active:scale-95`}>{z.corta ?? z.etiqueta}</button>
              : <span key={z.id} style={estilo} className={clase} title={z.etiqueta}>{mini ? null : (z.corta ?? z.etiqueta)}</span>;
          })}
        </div>
        {!mini && <span aria-hidden="true" className={`absolute right-0 top-1/2 hidden -translate-y-1/2 font-bold tracking-widest [writing-mode:vertical-rl] sm:block ${rotulo}`}>DERECHA</span>}
      </div>
      <p aria-hidden="true" className={`text-center font-bold tracking-widest ${rotulo}`}>{mini ? "TRAS." : "TRASERA"}</p>
    </div>
  );
}
