"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clienteNavegador } from "./navegador";

export function useTiempoReal<T extends object>(
  tabla: "servicios" | "posicion_actual" | "eventos_servicio", iniciales: T[], clave: keyof T,
  onEstado?: (conectado: boolean) => void,
): T[] {
  const router = useRouter();
  const [filas, setFilas] = useState(iniciales);
  const cb = useRef(onEstado);
  useEffect(() => { cb.current = onEstado; });
  useEffect(() => setFilas(iniciales), [iniciales]);
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
          return i === -1 ? [...act, nueva] : act.map((f, j) => (j === i ? nueva : f));
        });
      }).subscribe((estado) => {
        if (!activo) return;
        if (estado === "SUBSCRIBED") {
          cb.current?.(true);
          if (conectadoAntes && caido) router.refresh(); // recupera lo perdido durante la caída
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
