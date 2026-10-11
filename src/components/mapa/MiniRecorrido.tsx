import { miniaturaRecorrido, type PuntoLngLat } from "@/lib/dominio/recorrido";

/** Miniatura SVG del recorrido (sin teselas ni JavaScript): azul hacia la recogida, rojo con pasajeros. */
export default function MiniRecorrido({ puntos, corte, ancho = 120, alto = 80, className = "" }: {
  puntos: PuntoLngLat[] | null | undefined; corte: number | null | undefined; ancho?: number; alto?: number; className?: string;
}) {
  const m = miniaturaRecorrido(puntos ?? [], corte ?? null, ancho, alto);
  const caja = `shrink-0 rounded-md border border-slate-700 bg-slate-800 ${className}`;
  if (!m) return <div style={{ width: ancho, height: alto }} className={`${caja} flex items-center justify-center text-center text-xs text-slate-500`}>Sin GPS</div>;
  const txt = (a: [number, number][]) => a.map(([x, y]) => `${x},${y}`).join(" ");
  const linea = { fill: "none", strokeWidth: 2.5, strokeLinejoin: "round", strokeLinecap: "round" } as const;
  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} className={caja} role="img" aria-label="Dibujo del recorrido">
      {m.hacia.length > 1 && <polyline points={txt(m.hacia)} stroke="#60a5fa" {...linea} />}
      {m.con.length > 1 && <polyline points={txt(m.con)} stroke="#f87171" {...linea} />}
      <circle cx={m.inicio[0]} cy={m.inicio[1]} r={3.5} fill="#e2e8f0" />
      {m.recogida && <circle cx={m.recogida[0]} cy={m.recogida[1]} r={3.5} fill="#22c55e" />}
      <circle cx={m.fin[0]} cy={m.fin[1]} r={3.5} fill="#ef4444" stroke="#fff" strokeWidth={1} />
    </svg>
  );
}
