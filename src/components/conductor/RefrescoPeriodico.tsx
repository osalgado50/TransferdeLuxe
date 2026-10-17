"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Vuelve a pedir la página al servidor cada `segundos` mientras la pestaña está visible (y al volver a ella). Para lo que
 * Realtime no trae al conductor: cuando la central le quita un servicio, la fila deja de ser suya y no le llega el cambio.
 * `router.refresh()` conserva el estado de los componentes de cliente (formularios a medias, mapa).
 */
export default function RefrescoPeriodico({ segundos }: { segundos: number }) {
  const router = useRouter();
  useEffect(() => {
    const refrescar = () => { if (document.visibilityState === "visible") router.refresh(); };
    const t = setInterval(refrescar, segundos * 1000);
    document.addEventListener("visibilitychange", refrescar);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", refrescar); };
  }, [router, segundos]);
  return null;
}
