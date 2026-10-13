import { fueraDeTurno, segmentosDia, textoTramos, type Tramo } from "@/lib/dominio/horarios";
import { COLOR_TIPO_AUSENCIA, HORA_TARDE, NOMBRE_TIPO_AUSENCIA, type FranjaAusencia, type TipoAusencia } from "@/lib/dominio/ausencias";

const TARDE = (HORA_TARDE / 24) * 100;

/**
 * Un día de 24 h: verde en turno, gris rayado fuera de turno (pausa de comida, antes y después) y, encima, la ausencia
 * del día si la hay (vacaciones, fiesta…; media jornada solo en su mitad). `tramos` null = sin horario (todo disponible).
 */
export default function BarraTurno({ tramos, pintar, ausencia = null, texto = true }: {
  tramos: Tramo[] | null; ausencia?: { tipo: TipoAusencia; franja: FranjaAusencia } | null; texto?: boolean;
  /** Lo que se pinta si no es `tramos` (p. ej. con la cola 00:00–06:00 del turno de noche de la víspera). */
  pintar?: Tramo[] | null;
}) {
  const sinHorario = tramos == null;
  const barra = pintar ?? tramos;
  const fuera = barra ? fueraDeTurno(barra) : [];
  const etiqueta = sinHorario ? "Sin horario (disponible)" : tramos.length ? `Turno ${textoTramos(tramos)}` : "Libre";
  const aus = ausencia ? { left: ausencia.franja === "tarde" ? TARDE : 0, width: ausencia.franja === "dia" ? 100 : ausencia.franja === "manana" ? TARDE : 100 - TARDE } : null;
  return (
    <div className="space-y-0.5" data-turno-dia={sinHorario ? "sin-horario" : textoTramos(tramos)} data-ausencia={ausencia?.tipo}>
      <div className={`relative h-2.5 overflow-hidden rounded ${sinHorario ? "bg-green-900/40" : "bg-[repeating-linear-gradient(135deg,#1e293b_0_4px,#0f172a_4px_8px)]"}`} aria-hidden>
        {(barra ? segmentosDia(barra) : []).map((x) => <span key={`${x.tramo.inicio}-${x.tramo.fin}`} className="absolute inset-y-0 bg-green-600/70" style={{ left: `${x.desde}%`, width: `${x.hasta - x.desde}%` }} />)}
        {aus && <span className="absolute inset-y-0 opacity-90" style={{ left: `${aus.left}%`, width: `${aus.width}%`, background: COLOR_TIPO_AUSENCIA[ausencia!.tipo] }} />}
      </div>
      {texto && (
        <p className="text-[11px] leading-tight text-slate-400">
          {etiqueta}
          {ausencia && <span className="text-amber-200"> · {NOMBRE_TIPO_AUSENCIA[ausencia.tipo]}{ausencia.franja === "dia" ? "" : ` (${ausencia.franja === "manana" ? "mañana" : "tarde"})`}</span>}
          {fuera.length > 0 && barra!.length > 0 && <span className="sr-only"> · fuera de turno: {fuera.map((t) => `${t.inicio}–${t.fin}`).join(", ")}</span>}
        </p>
      )}
    </div>
  );
}
