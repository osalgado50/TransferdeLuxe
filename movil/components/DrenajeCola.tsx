import NetInfo from "@react-native-community/netinfo";
import { useEffect } from "react";
import { AppState } from "react-native";
import { drenar } from "~/lib/cola";

/** Reintenta la cola de acciones: al arrancar, al volver a primer plano, al recuperar la red y cada 20 s. */
export function DrenajeCola({ conductorId }: { conductorId: string }) {
  useEffect(() => {
    const ir = () => { void drenar(conductorId).catch(() => {}); };
    ir();
    const a = AppState.addEventListener("change", (e) => { if (e === "active") ir(); });
    let conectado: boolean | null = null;
    const n = NetInfo.addEventListener((s) => {
      const ahora = !!s.isConnected && s.isInternetReachable !== false;
      if (ahora && conectado === false) ir();
      conectado = ahora;
    });
    const t = setInterval(ir, 20_000);
    return () => { a.remove(); n(); clearInterval(t); };
  }, [conductorId]);
  return null;
}
