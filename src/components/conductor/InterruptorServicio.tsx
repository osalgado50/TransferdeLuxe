"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { fueraDeServicio } from "@/app/conductor/actions";
import { suscribirGps } from "@/lib/gps/gestor";
import { debeEnviar, ENVIO_TIMEOUT_MS, estadoEnvio } from "@/lib/dominio/gps";

export const EVENTO_APAGAR = "tdl-apagar";

export default function InterruptorServicio({ conductorId }: { conductorId: string }) {
  const clave = `tdl-en-servicio:${conductorId}`;
  const [activo, setActivo] = useState(false);
  const [listo, setListo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState(false);
  const [ultimo, setUltimo] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const quitar = useRef<(() => void) | null>(null);
  const ultimoEnvio = useRef(0);
  const gen = useRef(0);
  const pendiente = useRef<Promise<unknown> | null>(null);
  const pendienteDesde = useRef<number | null>(null);

  const detener = useCallback(() => {
    gen.current++;
    quitar.current?.(); quitar.current = null;
  }, []);

  const enviar = useCallback((pos: GeolocationPosition, g: number) => {
    const ahora = Date.now();
    if (!debeEnviar(ahora, ultimoEnvio.current, pendienteDesde.current)) return;
    if (g !== gen.current) return; // se apagó el servicio: no enviar
    const sb = clienteNavegador();
    pendienteDesde.current = ahora;
    const p = Promise.resolve(sb.from("posiciones").insert({
      conductor_id: conductorId, lat: pos.coords.latitude, lng: pos.coords.longitude,
      velocidad: pos.coords.speed, precision_m: pos.coords.accuracy,
    }).abortSignal(AbortSignal.timeout(ENVIO_TIMEOUT_MS))).then(({ error }) => {
      if (error) {
        console.warn("[gps] error al enviar posición", error.code, error.message);
        setErrorEnvio(true);
        if (/jwt|token|401|PGRST30/i.test(`${error.code} ${error.message}`)) void sb.auth.refreshSession();
        return; // sin throttle: reintenta en el próximo fix
      }
      ultimoEnvio.current = ahora; setUltimo(ahora); setErrorEnvio(false);
    }, (e) => { console.warn("[gps] envío fallido", e); setErrorEnvio(true); })
      .finally(() => { if (pendiente.current === p) { pendiente.current = null; pendienteDesde.current = null; } });
    pendiente.current = p;
  }, [conductorId]);

  const iniciar = useCallback(() => {
    if (quitar.current) return;
    setAviso(null);
    const g = ++gen.current;
    quitar.current = suscribirGps({
      fix: (pos) => { setAviso(null); enviar(pos, g); },
      error: (err) => setAviso(err.code === err.PERMISSION_DENIED ? "Activa la ubicación para que la central te vea"
        : "No se puede obtener tu ubicación; comprueba la señal GPS"),
    });
  }, [enviar]);

  // Apagar: parar el GPS, esperar el envío en vuelo y solo entonces marcar fuera de servicio.
  const apagar = useCallback(async () => {
    detener();
    try { await pendiente.current; } catch { /* ignorar */ }
    await fueraDeServicio();
  }, [detener]);

  useEffect(() => {
    let guardado = false;
    try { guardado = localStorage.getItem(clave) === "1"; } catch { /* sin almacenamiento */ }
    setActivo(guardado); setListo(true);
  }, [clave]);
  useEffect(() => {
    if (!listo) return;
    if (activo) iniciar(); else detener();
    return detener;
  }, [activo, listo, iniciar, detener]);
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [activo]);
  useEffect(() => {
    const h = (e: Event) => { (e as CustomEvent<{ tareas: Promise<unknown>[] }>).detail.tareas.push(apagar()); };
    window.addEventListener(EVENTO_APAGAR, h);
    return () => window.removeEventListener(EVENTO_APAGAR, h);
  }, [apagar]);

  function alternar() {
    const nuevo = !activo;
    setActivo(nuevo);
    try { localStorage.setItem(clave, nuevo ? "1" : "0"); } catch { /* ignorar */ }
    if (!nuevo) { setUltimo(null); setAviso(null); setErrorEnvio(false); ultimoEnvio.current = 0; void apagar(); }
  }

  const est = estadoEnvio(Date.now(), ultimo);
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={alternar} aria-pressed={activo} disabled={!listo}
        className={`min-h-14 rounded-xl px-5 text-base font-semibold ${activo ? "bg-green-500 text-slate-950" : "border border-slate-500 text-slate-200"}`}>
        {activo ? "En servicio" : "Fuera de servicio"}
      </button>
      {activo && !aviso && (
        <span role="status" className={`text-xs ${errorEnvio || est.alerta ? "rounded bg-red-600 px-2 py-0.5 font-semibold text-white" : "text-slate-400"}`}>
          {est.texto}{errorEnvio ? " · error al enviar, reintentando" : ""}
        </span>
      )}
      {activo && aviso && <p role="alert" className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white">{aviso}</p>}
    </div>
  );
}
