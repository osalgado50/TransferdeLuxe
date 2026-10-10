"use client";
import dynamic from "next/dynamic";

const MapaNavegacion = dynamic(() => import("./MapaNavegacion"), {
  ssr: false,
  loading: () => <div className="h-[55vh] w-full animate-pulse bg-slate-800" />,
});
export default MapaNavegacion;
