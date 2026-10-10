"use client";
import { useState } from "react";

const campo = "rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm";

/** Plazas y maletas del alta de vehículo: las maletas siguen a las plazas hasta que el usuario las edita. */
export default function CamposNuevoVehiculo() {
  const [plazas, setPlazas] = useState("4");
  const [maletas, setMaletas] = useState("4");
  const [editadas, setEditadas] = useState(false);
  return (
    <>
      <div className="flex flex-col gap-1"><label htmlFor="nv-plazas" className="text-xs text-slate-400">Plazas</label>
        <input id="nv-plazas" name="plazas" type="number" min={1} max={19} value={plazas} className={`${campo} w-16`}
          onChange={(e) => { setPlazas(e.target.value); if (!editadas) setMaletas(e.target.value); }} /></div>
      <div className="flex flex-col gap-1"><label htmlFor="nv-maletas" className="text-xs text-slate-400">Maletas</label>
        <input id="nv-maletas" name="maletas" type="number" min={0} max={30} value={maletas} className={`${campo} w-16`}
          onChange={(e) => { setEditadas(true); setMaletas(e.target.value); }} /></div>
    </>
  );
}
