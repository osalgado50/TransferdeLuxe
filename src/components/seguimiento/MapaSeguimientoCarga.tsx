"use client";
import dynamic from "next/dynamic";

const MapaSeguimiento = dynamic(() => import("./MapaSeguimiento"), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-2xl bg-slate-800" />,
});
export default MapaSeguimiento;
