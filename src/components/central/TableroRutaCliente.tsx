"use client";
import dynamic from "next/dynamic";

// dnd-kit genera ids de accesibilidad distintos en servidor y cliente: el tablero se pinta solo en el cliente.
const TableroRuta = dynamic(() => import("./TableroRuta"), {
  ssr: false,
  loading: () => <p className="text-sm text-slate-400">Cargando hoja de ruta…</p>,
});

export default TableroRuta;
