"use client";
import { useState } from "react";
import { useTiempoReal } from "@/lib/supabase/useTiempoReal";
import type { PosicionActual, Servicio, Perfil, Vehiculo } from "@/lib/dominio/tipos";
import MapaFlota from "@/components/mapa/MapaFlotaCarga";
import ColumnaAlertas, { type EventoAlerta } from "./ColumnaAlertas";
import Contadores from "./Contadores";

export default function PanelEnVivo({ servicios, posiciones, eventos, conductores, vehiculos, umbralMin }: {
  servicios: Servicio[]; posiciones: PosicionActual[]; eventos: EventoAlerta[];
  conductores: Pick<Perfil, "id" | "nombre" | "vehiculo_habitual_id">[]; vehiculos: Pick<Vehiculo, "id" | "matricula">[]; umbralMin: number;
}) {
  const [ok, setOk] = useState(true);
  const sv = useTiempoReal<Servicio>("servicios", servicios, "id", setOk);
  const ps = useTiempoReal<PosicionActual>("posicion_actual", posiciones, "conductor_id");
  const ev = useTiempoReal<EventoAlerta>("eventos_servicio", eventos, "id");
  return (
    <div className="space-y-4">
      {!ok && <p role="status" className="text-xs text-amber-300">Reconectando…</p>}
      <Contadores servicios={sv} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><MapaFlota posiciones={ps} servicios={sv} conductores={conductores} vehiculos={vehiculos} umbralMin={umbralMin} /></div>
        <ColumnaAlertas servicios={sv} eventos={ev} conductores={conductores} />
      </div>
    </div>
  );
}
