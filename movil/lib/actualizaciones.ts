// Actualizaciones automáticas (EAS Update): al volver a primer plano descarga la versión nueva si la hay; se aplica
// en el siguiente arranque (sin recargar en mitad de un servicio). El GPS en segundo plano no se ve afectado.
import { useEffect } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";

let ultimaComprobacion = 0;
async function buscar() {
  if (__DEV__ || !Updates.isEnabled || Date.now() - ultimaComprobacion < 30 * 60_000) return;
  ultimaComprobacion = Date.now();
  try {
    const r = await Updates.checkForUpdateAsync();
    if (r.isAvailable) await Updates.fetchUpdateAsync();
  } catch { /* sin red: se reintenta más tarde */ }
}

export function useActualizaciones() {
  useEffect(() => {
    const s = AppState.addEventListener("change", (e) => { if (e === "active") void buscar(); });
    return () => s.remove();
  }, []);
}
