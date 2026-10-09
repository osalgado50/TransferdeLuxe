"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { drenar } from "@/lib/offline/colaConductor";

/** Reintenta la cola de acciones del conductor esté donde esté (al montar, al volver la red y cada 20 s). */
export default function DrenajeCola({ conductorId }: { conductorId: string }) {
  const router = useRouter();
  useEffect(() => {
    const ir = async () => { const r = await drenar(conductorId); if (r.enviadas || r.errores.length) router.refresh(); };
    void ir();
    window.addEventListener("online", ir);
    const t = setInterval(ir, 20000);
    return () => { window.removeEventListener("online", ir); clearInterval(t); };
  }, [conductorId, router]);
  return null;
}
