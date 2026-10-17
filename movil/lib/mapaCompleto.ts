import { useEffect, useState } from "react";

/**
 * Coordina el mapa a pantalla completa con el aviso «Servicio nuevo». Los dos son ventanas nativas (Modal) y iOS no
 * presenta una encima de otra: si llega un servicio con el mapa ampliado, el aviso no salía. Ahora el aviso pide cerrar
 * el mapa y espera a que termine de cerrarse.
 */
let abierto = false;
const cerrar = new Set<() => void>();

/** El mapa ampliado avisa de si está abierto y de cómo cerrarlo. */
export function useRegistroMapaCompleto(estaAbierto: boolean, alCerrar: () => void) {
  useEffect(() => {
    abierto = estaAbierto;
    if (!estaAbierto) return;
    cerrar.add(alCerrar);
    return () => { cerrar.delete(alCerrar); abierto = false; };
  }, [estaAbierto, alCerrar]);
}

/** true mientras hay que esperar a que se cierre el mapa ampliado antes de enseñar `quiereMostrar`. */
export function useEsperaMapaCompleto(quiereMostrar: boolean): boolean {
  const [esperando, setEsperando] = useState(false);
  useEffect(() => {
    if (!quiereMostrar || !abierto) return;
    setEsperando(true);
    cerrar.forEach((f) => f());
    const t = setTimeout(() => setEsperando(false), 600); // lo que tarda en cerrarse (animación «fade»)
    return () => clearTimeout(t);
  }, [quiereMostrar]);
  return esperando;
}
