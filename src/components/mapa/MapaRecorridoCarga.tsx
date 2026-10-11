"use client";
import dynamic from "next/dynamic";

const MapaRecorrido = dynamic(() => import("./MapaRecorrido"), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-lg bg-slate-800" />,
});
export default MapaRecorrido;
