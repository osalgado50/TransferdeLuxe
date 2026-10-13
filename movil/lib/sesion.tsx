import type { Session } from "@supabase/supabase-js";
import type { Perfil } from "@dominio/tipos";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { marcarFueraDeServicio, pararGps } from "./gps";
import { limpiarDatosGps } from "./gpsTarea";
import { darDeBajaPush } from "./push";
import { supabase } from "./supabase";

interface EstadoSesion {
  cargando: boolean;
  sesion: Session | null;
  perfil: Perfil | null;
  /** No se pudo leer el perfil por red: se mantiene la sesión y se reintenta al volver a primer plano. */
  sinConexion: boolean;
  entrar: (email: string, clave: string) => Promise<string | null>;
  salir: () => Promise<void>;
  reintentar: () => Promise<void>;
}

const Contexto = createContext<EstadoSesion | null>(null);

export const ERROR_CREDENCIALES = "Email o contraseña incorrectos";
export const ERROR_ROL = "Esta cuenta no tiene acceso a la app.";
export const ERROR_RED = "Sin conexión. Comprueba la cobertura e inténtalo de nuevo.";

type Lectura = { tipo: "ok"; perfil: Perfil } | { tipo: "no_conductor" } | { tipo: "red" };

// Distingue «sin acceso» (fila inexistente o rol que no es conductor ni operador → cerrar sesión) de un fallo de red (mantener sesión).
async function leerPerfil(id: string): Promise<Lectura> {
  try {
    const { data, error } = await supabase.from("perfiles").select("*").eq("id", id).maybeSingle();
    if (error) return { tipo: "red" };
    const p = data as Perfil | null;
    return p?.rol === "conductor" || p?.rol === "operador" ? { tipo: "ok", perfil: p } : { tipo: "no_conductor" };
  } catch {
    return { tipo: "red" };
  }
}

function esErrorDeRed(mensaje: string | undefined, estado?: number): boolean {
  return !estado || /network|fetch|timed? ?out/i.test(mensaje ?? "");
}

// Guardia de rol: conductores (app del conductor) y operadores (modo central) mantienen la sesión abierta.
export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const vivo = useRef(true);

  const aplicar = useCallback(async (s: Session | null) => {
    if (!s) { if (vivo.current) { setSesion(null); setPerfil(null); setSinConexion(false); } return; }
    const r = await leerPerfil(s.user.id);
    if (!vivo.current) return;
    if (r.tipo === "no_conductor") {
      await supabase.auth.signOut({ scope: "local" });
      if (vivo.current) { setSesion(null); setPerfil(null); setSinConexion(false); }
      return;
    }
    setSesion(s);
    if (r.tipo === "ok") { setPerfil(r.perfil); setSinConexion(false); } else setSinConexion(true);
  }, []);

  const reintentar = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await aplicar(data.session);
  }, [aplicar]);

  useEffect(() => {
    vivo.current = true;
    supabase.auth.getSession().then(async ({ data }) => { await aplicar(data.session); if (vivo.current) setCargando(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (!vivo.current) return;
      if (evento === "SIGNED_OUT") { setSesion(null); setPerfil(null); setSinConexion(false); }
      else if (evento === "TOKEN_REFRESHED" && s) setSesion(s);
      // Se difiere para no llamar a Supabase dentro del callback (evita bloqueos del cliente).
      else if (evento === "SIGNED_IN" && s) setTimeout(() => { void aplicar(s); }, 0);
    });
    return () => { vivo.current = false; sub.subscription.unsubscribe(); };
  }, [aplicar]);

  // Sin conexión: reintenta al volver la app a primer plano.
  useEffect(() => {
    if (!sinConexion) return;
    const s = AppState.addEventListener("change", (e) => { if (e === "active") void reintentar(); });
    return () => s.remove();
  }, [sinConexion, reintentar]);

  const entrar = useCallback(async (email: string, clave: string) => {
    let res;
    try {
      res = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: clave.trim() });
    } catch {
      return ERROR_RED;
    }
    const { data, error } = res;
    if (error) return esErrorDeRed(error.message, error.status) ? ERROR_RED : ERROR_CREDENCIALES;
    if (!data.session) return ERROR_CREDENCIALES;
    const r = await leerPerfil(data.session.user.id);
    if (r.tipo === "red") { await supabase.auth.signOut({ scope: "local" }); return ERROR_RED; }
    if (r.tipo === "no_conductor") { await supabase.auth.signOut({ scope: "local" }); return ERROR_ROL; }
    await limpiarDatosGps().catch(() => undefined); // cola/último envío de sesiones anteriores
    if (vivo.current) { setPerfil(r.perfil); setSesion(data.session); setSinConexion(false); }
    return null;
  }, []);

  const salir = useCallback(async () => {
    // Primero se para la tarea de ubicación (y se avisa a la central con el token aún válido).
    const id = (await supabase.auth.getSession()).data.session?.user.id;
    if (id) { await pararGps(id).catch(() => undefined); await marcarFueraDeServicio(); }
    await darDeBajaPush(); // este dispositivo deja de recibir avisos de servicios
    await supabase.auth.signOut({ scope: "local" });
    if (vivo.current) { setSesion(null); setPerfil(null); setSinConexion(false); }
  }, []);

  return (
    <Contexto.Provider value={{ cargando, sesion, perfil, sinConexion, entrar, salir, reintentar }}>
      {children}
    </Contexto.Provider>
  );
}

export function useSesion(): EstadoSesion {
  const c = useContext(Contexto);
  if (!c) throw new Error("useSesion fuera de ProveedorSesion");
  return c;
}
