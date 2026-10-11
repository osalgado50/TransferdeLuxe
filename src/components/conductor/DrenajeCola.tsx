"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { drenar } from "@/lib/offline/colaConductor";

/** Reintenta la cola de acciones del conductor esté donde esté (al montar, al volver la red y cada 20 s respetando el backoff). */
export default function DrenajeCola({ conductorId }: { conductorId: string }) {
  const router = useRouter();
  useEffect(() => {
    const ir = async (forzar = false) => {
      try { const r = await drenar(conductorId, forzar); if (r.enviadas || r.errores.length) router.refresh(); } catch { /* se reintenta */ }
    };
    const online = () => void ir(true);
    void ir(true);
    window.addEventListener("online", online);
    const t = setInterval(() => void ir(), 20000);
    return () => { window.removeEventListener("online", online); clearInterval(t); };
  }, [conductorId, router]);
  return null;
}
