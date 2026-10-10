import type { Session } from "@supabase/supabase-js";
import type { Perfil } from "@dominio/tipos";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

interface EstadoSesion {
  cargando: boolean;
  sesion: Session | null;
  perfil: Perfil | null;
  entrar: (email: string, clave: string) => Promise<string | null>;
  salir: () => Promise<void>;
}

const Contexto = createContext<EstadoSesion | null>(null);

export const ERROR_CREDENCIALES = "Email o contraseña incorrectos";
export const ERROR_ROL = "Esta app es solo para conductores. La central usa la web.";

async function leerPerfil(id: string): Promise<Perfil | null> {
  const { data } = await supabase.from("perfiles").select("*").eq("id", id).single();
  return (data as Perfil | null) ?? null;
}

// Guardia de rol: solo los perfiles con rol «conductor» mantienen la sesión abierta.
export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  const aplicar = useCallback(async (s: Session | null) => {
    if (!s) { setSesion(null); setPerfil(null); return; }
    const p = await leerPerfil(s.user.id);
    if (p?.rol !== "conductor") { await supabase.auth.signOut(); setSesion(null); setPerfil(null); return; }
    setPerfil(p); setSesion(s);
  }, []);

  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(async ({ data }) => { await aplicar(data.session); if (vivo) setCargando(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === "SIGNED_OUT") { setSesion(null); setPerfil(null); }
      else if (evento === "TOKEN_REFRESHED" && s) setSesion(s);
    });
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, [aplicar]);

  const entrar = useCallback(async (email: string, clave: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: clave.trim() });
    if (error || !data.session) return ERROR_CREDENCIALES;
    const p = await leerPerfil(data.session.user.id);
    if (p?.rol !== "conductor") { await supabase.auth.signOut(); return ERROR_ROL; }
    setPerfil(p); setSesion(data.session);
    return null;
  }, []);

  const salir = useCallback(async () => {
    await supabase.auth.signOut();
    setSesion(null); setPerfil(null);
  }, []);

  return <Contexto.Provider value={{ cargando, sesion, perfil, entrar, salir }}>{children}</Contexto.Provider>;
}

export function useSesion(): EstadoSesion {
  const c = useContext(Contexto);
  if (!c) throw new Error("useSesion fuera de ProveedorSesion");
  return c;
}
