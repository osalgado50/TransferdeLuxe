"use client";
import { useEffect, useState } from "react";
import { clienteNavegador } from "./navegador";

export function useTiempoReal<T extends object>(
  tabla: "servicios" | "posicion_actual" | "eventos_servicio", iniciales: T[], clave: keyof T,
): T[] {
  const [filas, setFilas] = useState(iniciales);
  useEffect(() => setFilas(iniciales), [iniciales]);
  useEffect(() => {
    const sb = clienteNavegador();
    const canal = sb.channel(`rt-${tabla}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tabla }, (p) => {
        setFilas((act) => {
          if (p.eventType === "DELETE") return act.filter((f) => f[clave] !== (p.old as T)[clave]);
          const nueva = p.new as T;
          const i = act.findIndex((f) => f[clave] === nueva[clave]);
          return i === -1 ? [...act, nueva] : act.map((f, j) => (j === i ? nueva : f));
        });
      }).subscribe();
    return () => { sb.removeChannel(canal); };
  }, [tabla, clave]);
  return filas;
}
