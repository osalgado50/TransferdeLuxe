"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clienteNavegador } from "./navegador";
import { crearFreno } from "@/lib/dominio/reintento";

// Un solo freno para toda la pestaña: varios hooks (servicios, posiciones, eventos) que se reconectan a la vez, o un
// socket que «parpadea», piden como mucho UN router.refresh cada 10 s (cada refresh re-renderiza la página en el servidor).
const frenoRefresh = crearFreno(10_000);

export interface OpcionesTiempoReal<T> {
  /** Filas que se ignoran (p. ej. pruebas automáticas); si una fila ya cargada deja de valer, se quita. */
  acepta?: (fila: T) => boolean;
  /** Acota la lista tras cada cambio (paneles abiertos días): devuelve la misma referencia si no quita nada. */
  acotar?: (filas: T[]) => T[];
}

export function useTiempoReal<T extends object>(
  tabla: "servicios" | "posicion_actual" | "eventos_servicio" | "incidencias" | "checklist_revisiones" | "jornadas" | "cierres_jornada" | "alertas_horario", iniciales: T[], clave: keyof T,
  onEstado?: (conectado: boolean) => void, opciones?: OpcionesTiempoReal<T>,
): T[] {
  const router = useRouter();
  const op = useRef(opciones);
  useEffect(() => { op.current = opciones; });
  const [filas, setFilas] = useState(() => (opciones?.acepta ? iniciales.filter(opciones.acepta) : iniciales));
  const cb = useRef(onEstado);
  useEffect(() => { cb.current = onEstado; });
  useEffect(() => setFilas(op.current?.acepta ? iniciales.filter(op.current.acepta) : iniciales), [iniciales]);
  useEffect(() => {
    const sb = clienteNavegador();
    let conectadoAntes = false;
    let caido = false;
    let cancelado = false;
    let activo = true; // un CLOSED tardío de un canal viejo no debe marcar el nuevo como caído
    let canal: ReturnType<typeof sb.channel> | null = null;
    // Las políticas RLS exigen "authenticated": el socket debe llevar el JWT de la sesión antes de suscribirse.
    void sb.auth.getSession().then(({ data }) => {
      if (cancelado) return;
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      canal = sb.channel(`rt-${tabla}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tabla }, (p) => {
        setFilas((act) => {
          if (p.eventType === "DELETE") return act.filter((f) => f[clave] !== (p.old as T)[clave]);
          const nueva = p.new as T;
          const i = act.findIndex((f) => f[clave] === nueva[clave]);
          if (op.current?.acepta && !op.current.acepta(nueva)) return i === -1 ? act : act.filter((_, j) => j !== i);
          const sig = i === -1 ? [...act, nueva] : act.map((f, j) => (j === i ? nueva : f));
          return op.current?.acotar ? op.current.acotar(sig) : sig;
        });
      }).subscribe((estado) => {
        if (!activo) return;
        if (estado === "SUBSCRIBED") {
          cb.current?.(true);
          if (conectadoAntes && caido) frenoRefresh.pedir(() => router.refresh()); // recupera lo perdido durante la caída
          conectadoAntes = true; caido = false;
        } else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") {
          caido = true; cb.current?.(false);
        }
      });
    });
    // Los conductores dejan la app abierta horas: al renovarse el token el socket debe recibir el nuevo JWT.
    const { data: sus } = sb.auth.onAuthStateChange((ev, session) => {
      if (session && (ev === "TOKEN_REFRESHED" || ev === "SIGNED_IN")) sb.realtime.setAuth(session.access_token);
    });
    return () => { cancelado = true; activo = false; sus.subscription.unsubscribe(); if (canal) void sb.removeChannel(canal); };
  }, [tabla, clave, router]);
  return filas;
}
