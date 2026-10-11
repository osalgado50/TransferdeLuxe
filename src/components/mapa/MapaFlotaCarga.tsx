"use client";
import dynamic from "next/dynamic";

const MapaFlota = dynamic(() => import("./MapaFlota"), {
  ssr: false,
  loading: () => <div className="h-[60vh] min-h-[22rem] w-full lg:h-[calc(100vh-13rem)] lg:min-h-[32rem] animate-pulse rounded-lg bg-slate-800" />,
});
export default MapaFlota;
