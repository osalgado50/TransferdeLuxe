"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { useTiempoReal } from "@/lib/supabase/useTiempoReal";
import { accionConductor } from "@/app/conductor/actions";
import { segundosRestantes, claveAsignacion, formatoCuenta as cuenta } from "@/lib/dominio/plazo";
import { MOTIVOS_RECHAZO } from "@/lib/dominio/estados";
import type { EstadoServicio } from "@/lib/dominio/tipos";

export type ServicioNuevo = {
  id: string; estado: EstadoServicio; conductor_id: string | null; asignado_en: string | null; plazo_respuesta_min: number;
  fecha_hora_recogida: string; origen_texto: string; destino_texto: string; pasajeros: number; maletas: number;
  numero_vuelo: string | null; notas: string | null;
};
const fechaHora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const clave = claveAsignacion;

let audio: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    if (!audio) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (C) audio = new C();
    }
    return audio;
  } catch { return null; }
}
function pitar() {
  try {
    const c = ctx();
    if (!c || c.state !== "running") return;
    [0, 0.35, 0.7].forEach((t) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.25, c.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.25);
      o.connect(g); g.connect(c.destination); o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.3);
    });
  } catch { /* sin sonido */ }
}

export default function TarjetaServicioNuevo({ iniciales, yo }: { iniciales: ServicioNuevo[]; yo: string }) {
  const todos = useTiempoReal("servicios", iniciales, "id");
  const router = useRouter();
  const [ahora, setAhora] = useState<Date | null>(null);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [otro, setOtro] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const idAccion = useRef<string | null>(null);
  const mostrado = useRef<string | null>(null);

  const s = todos
    .filter((x) => x.conductor_id === yo && x.estado === "asignado" && x.asignado_en && !ocultos.has(clave(x)))
    .sort((a, b) => (a.asignado_en! < b.asignado_en! ? -1 : 1))[0];
  const restante = s && ahora ? segundosRestantes(s.asignado_en!, s.plazo_respuesta_min, ahora) : 0;
  const venceYa = !!s && !!ahora && restante === 0;

  useEffect(() => {
    setAhora(new Date());
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  // Reconciliar con la BD (RLS): si el servicio ya no es mío y asignado, cerrar la tarjeta.
  const actual = useRef<ServicioNuevo | undefined>(undefined);
  useEffect(() => { actual.current = s; });
  const reconciliar = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    reconciliar.current = async () => {
      const cur = actual.current;
      if (!cur) return;
      try {
        const { data, error: e } = await clienteNavegador().from("servicios").select("id,asignado_en").eq("conductor_id", yo).eq("estado", "asignado");
        if (e || !data) return;
        const vivos = new Set(data.map(clave));
        if (!vivos.has(clave(cur))) {
          setOcultos((o) => new Set(o).add(clave(cur)));
          setAviso("El servicio ha vuelto a la central");
        }
      } catch { /* sin red: se reintenta */ }
    };
  });
  const abierta = !!s;
  useEffect(() => {
    if (!abierta) return;
    const t = setInterval(() => void reconciliar.current(), 20_000);
    const v = () => { if (document.visibilityState === "visible") void reconciliar.current(); };
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [abierta]);
  // El audio solo se puede reanudar tras un gesto del usuario.
  useEffect(() => {
    const f = () => { try { void ctx()?.resume(); } catch { /* nada */ } };
    window.addEventListener("pointerdown", f); window.addEventListener("keydown", f);
    return () => { window.removeEventListener("pointerdown", f); window.removeEventListener("keydown", f); };
  }, []);
  // Plazo agotado: cerrar con aviso.
  useEffect(() => {
    if (s && venceYa) { setOcultos((o) => new Set(o).add(clave(s))); setAviso("El servicio ha vuelto a la central"); }
  }, [s, venceYa]);
  // Aparece uno nuevo: vibrar y sonar; si desaparece sin que yo actúe (reasignado/expirado): aviso.
  useEffect(() => {
    const id = s ? clave(s) : null;
    if (id === mostrado.current) return;
    if (id) {
      setRechazando(false); setOtro(false); setTexto(""); setError(null); setAviso(null); idAccion.current = null;
      try { navigator.vibrate?.([300, 150, 300]); } catch { /* sin vibración */ }
      pitar();
    } else if (mostrado.current && !ocultos.has(mostrado.current)) {
      setAviso("El servicio ha vuelto a la central");
    }
    mostrado.current = id;
  }, [s, ocultos]);

  async function enviar(accion: "aceptar" | "rechazar", motivo?: string) {
    if (!s || enviando) return;
    setEnviando(true); setError(null);
    idAccion.current ??= crypto.randomUUID();
    try {
      const r = await accionConductor({ idAccion: idAccion.current, servicioId: s.id, accion, motivo });
      if (r.ok) { setOcultos((o) => new Set(o).add(clave(s))); idAccion.current = null; router.refresh(); }
      else { setError(r.error); idAccion.current = null; void reconciliar.current(); }
    } catch { setError("No se pudo enviar. Revisa la conexión y reinténtalo."); void reconciliar.current(); }
    finally { setEnviando(false); }
  }

  if (!s) {
    return aviso ? (
      <div role="alert" className="fixed inset-x-0 top-0 z-[2000] flex items-center justify-between gap-3 bg-marca px-4 py-3 font-semibold text-white">
        <span>{aviso}</span>
        <button onClick={() => setAviso(null)} className="min-h-10 rounded-lg bg-slate-950 px-4 text-marca-claro">Entendido</button>
      </div>
    ) : null;
  }
  return (
    <div role="dialog" aria-label="Servicio nuevo" className="fixed inset-0 z-[2000] flex flex-col overflow-y-auto bg-slate-950 p-5 text-slate-100">
      <p className="text-sm font-semibold uppercase tracking-wide text-marca-claro">Servicio nuevo</p>
      <p className="mt-1 text-5xl font-bold tabular-nums text-marca-claro" aria-live="off">{ahora ? cuenta(restante) : "\u00a0"}</p>
      {ahora && restante <= 86400 && <p className="text-xs text-slate-400">para responder</p>}
      <p className="mt-5 text-3xl font-bold">{fechaHora.format(new Date(s.fecha_hora_recogida))}</p>
      <p className="mt-2 text-xl">{s.origen_texto} → {s.destino_texto}</p>
      <p className="mt-2 text-base text-slate-300">{s.pasajeros} pax · {s.maletas} maletas{s.numero_vuelo ? ` · Vuelo ${s.numero_vuelo}` : ""}</p>
      {s.notas && <p className="mt-2 rounded-lg bg-slate-900 p-3 text-sm text-slate-300">{s.notas}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-950 p-3 text-red-300">{error}</p>}
      <div className="mt-auto space-y-3 pt-6">
        {!rechazando ? (
          <>
            <button disabled={enviando} onClick={() => void enviar("aceptar")} className="min-h-20 w-full rounded-2xl bg-green-500 text-2xl font-bold text-slate-950 disabled:opacity-60">ACEPTAR</button>
            <button disabled={enviando} onClick={() => setRechazando(true)} className="min-h-14 w-full rounded-xl border border-red-500 text-lg font-semibold text-red-400">Rechazar</button>
            <button onClick={() => setOcultos((o) => new Set(o).add(clave(s)))} className="min-h-12 w-full text-slate-400 underline">Ver más tarde</button>
          </>
        ) : (
          <div className="space-y-2">
            <p className="font-semibold">Motivo del rechazo</p>
            {MOTIVOS_RECHAZO.map((m) => (
              <button key={m} disabled={enviando} onClick={() => (m === "Otro" ? setOtro(true) : void enviar("rechazar", m))}
                className={`min-h-14 w-full rounded-xl border text-lg ${m === "Otro" && otro ? "border-marca-claro text-marca-claro" : "border-slate-600"} disabled:opacity-60`}>{m}</button>
            ))}
            {otro && (
              <>
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Explica el motivo" aria-label="Motivo"
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 p-3 text-base" />
                <button disabled={enviando || texto.trim() === ""} onClick={() => void enviar("rechazar", texto.trim())}
                  className="min-h-14 w-full rounded-xl bg-red-500 text-lg font-semibold text-white disabled:opacity-50">Enviar rechazo</button>
              </>
            )}
            <button disabled={enviando} onClick={() => { setRechazando(false); setOtro(false); }} className="min-h-12 w-full text-slate-400">Volver</button>
          </div>
        )}
      </div>
    </div>
  );
}
