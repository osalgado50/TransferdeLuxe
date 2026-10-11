import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "./supabase";

/** Avisa de cualquier cambio en `servicios` (RLS: solo llegan los míos). Reconexión → `alReconectar`. */
export function useCambiosServicios(alCambio: (fila: Record<string, unknown> | null) => void, alReconectar: () => void) {
  useCambiosTabla("servicios", alCambio, alReconectar);
}

/** Igual que `useCambiosServicios` para cualquier tabla publicada en Realtime (p. ej. `posicion_actual` para la central). */
export function useCambiosTabla(tabla: string, alCambio: (fila: Record<string, unknown> | null) => void, alReconectar: () => void) {
  const cb = useRef({ alCambio, alReconectar });
  useEffect(() => { cb.current = { alCambio, alReconectar }; });
  useEffect(() => {
    let cancelado = false, activo = true, conectadoAntes = false, caido = false;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    // Las políticas RLS exigen «authenticated»: el socket debe llevar el JWT antes de suscribirse.
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelado) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      canal = supabase.channel(`rt-${tabla}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: tabla }, (p) => {
          cb.current.alCambio(p.eventType === "DELETE" ? null : (p.new as Record<string, unknown>));
        })
        .subscribe((estado) => {
          if (!activo) return;
          if (estado === "SUBSCRIBED") {
            if (conectadoAntes && caido) cb.current.alReconectar(); // recupera lo perdido durante la caída
            conectadoAntes = true; caido = false;
          } else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") caido = true;
        });
    });
    const { data: sus } = supabase.auth.onAuthStateChange((ev, s) => {
      if (s && (ev === "TOKEN_REFRESHED" || ev === "SIGNED_IN")) supabase.realtime.setAuth(s.access_token);
    });
    return () => { cancelado = true; activo = false; sus.subscription.unsubscribe(); if (canal) void supabase.removeChannel(canal); };
  }, [tabla]);
}

type Estado<T> = { datos: T | null; error: string | null; cargando: boolean };

/** Carga con Supabase y recarga ante cambios en vivo, reconexión y vuelta a primer plano. */
export function useConsulta<T>(cargar: () => Promise<T>, deps: unknown[]) {
  const [e, setE] = useState<Estado<T>>({ datos: null, error: null, cargando: true });
  const f = useRef(cargar);
  useEffect(() => { f.current = cargar; });
  const recargar = useCallback(async () => {
    try {
      const datos = await f.current();
      setE({ datos, error: null, cargando: false });
    } catch (err) {
      setE((a) => ({ ...a, error: err instanceof Error ? err.message : "Error al cargar", cargando: false }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void recargar(); }, [recargar]);
  // Agrupa ráfagas de cambios en una sola recarga.
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programar = useCallback(() => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => void recargar(), 300);
  }, [recargar]);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  useCambiosServicios(programar, programar);
  useEffect(() => {
    const s = AppState.addEventListener("change", (x) => { if (x === "active") void recargar(); });
    return () => s.remove();
  }, [recargar]);
  return { ...e, recargar };
}
