"use client";
import dynamic from "next/dynamic";

const MapaFlota = dynamic(() => import("./MapaFlota"), {
  ssr: false,
  loading: () => <div className="h-[32rem] w-full animate-pulse rounded-lg bg-slate-800" />,
});
export default MapaFlota;
