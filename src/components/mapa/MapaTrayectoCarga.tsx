"use client";
import dynamic from "next/dynamic";

const MapaTrayecto = dynamic(() => import("./MapaTrayecto"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-slate-800" />,
});
export default MapaTrayecto;
