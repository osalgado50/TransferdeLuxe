// Actualizaciones automáticas (EAS Update). Al abrir la app y al volver a primer plano busca una versión nueva:
// - sin sesión (pantalla de login): la descarga y recarga al momento → se ve ya, sin cerrar y abrir la app;
// - con sesión: la descarga y se aplica en el siguiente arranque (nunca recarga en mitad de un servicio).
import { useEffect } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";
import { supabase } from "./supabase";

let ultimaComprobacion = 0;
let buscando = false;
async function buscar(alArrancar: boolean) {
  if (__DEV__ || !Updates.isEnabled || buscando) return;
  if (!alArrancar && Date.now() - ultimaComprobacion < 30 * 60_000) return;
  buscando = true;
  ultimaComprobacion = Date.now();
  try {
    const r = await Updates.checkForUpdateAsync();
    if (!r.isAvailable) return;
    const f = await Updates.fetchUpdateAsync();
    if (!f.isNew) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) await Updates.reloadAsync(); // en el login no se interrumpe nada
  } catch { /* sin red: se reintenta más tarde */ } finally { buscando = false; }
}

export function useActualizaciones() {
  useEffect(() => {
    void buscar(true);
    const s = AppState.addEventListener("change", (e) => { if (e === "active") void buscar(false); });
    return () => s.remove();
  }, []);
}
