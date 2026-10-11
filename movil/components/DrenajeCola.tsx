import NetInfo from "@react-native-community/netinfo";
import { useEffect } from "react";
import { AppState } from "react-native";
import { drenar } from "~/lib/cola";
import { alRecuperar } from "~/lib/red";

/**
 * Reintenta la cola de acciones: al arrancar, al volver a primer plano y cada 20 s respetando el backoff de la cola
 * (2 s, 4 s, 8 s… hasta 5 min tras fallos seguidos); al recuperar la red o el servidor, intenta ya.
 */
export function DrenajeCola({ conductorId }: { conductorId: string }) {
  useEffect(() => {
    const ir = (forzar = false) => { void drenar(conductorId, forzar).catch(() => {}); };
    ir(true);
    const a = AppState.addEventListener("change", (e) => { if (e === "active") ir(); });
    let conectado: boolean | null = null;
    const n = NetInfo.addEventListener((s) => {
      const ahora = !!s.isConnected && s.isInternetReachable !== false;
      if (ahora && conectado === false) ir(true);
      conectado = ahora;
    });
    const r = alRecuperar((d) => { if (d === "api") ir(true); });
    const t = setInterval(() => ir(), 20_000);
    return () => { a.remove(); n(); r(); clearInterval(t); };
  }, [conductorId]);
  return null;
}
