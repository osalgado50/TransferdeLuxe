"use client";
import { useCallback, useState } from "react";
import { useTiempoReal } from "@/lib/supabase/useTiempoReal";
import type { PosicionActual, Servicio, Perfil, Vehiculo } from "@/lib/dominio/tipos";
import MapaFlota from "@/components/mapa/MapaFlotaCarga";
import ColumnaAlertas, { type EventoAlerta } from "./ColumnaAlertas";
import Contadores from "./Contadores";
import { useSonidosCentral } from "./useSonidosCentral";

export default function PanelEnVivo({ servicios, posiciones, eventos, conductores, vehiculos, umbralMin }: {
  servicios: Servicio[]; posiciones: PosicionActual[]; eventos: EventoAlerta[];
  conductores: Pick<Perfil, "id" | "nombre" | "vehiculo_habitual_id">[]; vehiculos: Pick<Vehiculo, "id" | "matricula">[]; umbralMin: number;
}) {
  const [ok, setOk] = useState(true);
  const sv = useTiempoReal<Servicio>("servicios", servicios, "id", setOk);
  const ps = useTiempoReal<PosicionActual>("posicion_actual", posiciones, "conductor_id");
  const ev = useTiempoReal<EventoAlerta>("eventos_servicio", eventos, "id");
  const pedirSonido = useSonidosCentral(ev, sv);
  const alIncidencia = useCallback(() => pedirSonido("incidencia"), [pedirSonido]);
  return (
    <div className="space-y-4">
      {!ok && <p role="status" className="text-xs text-amber-300">Reconectando…</p>}
      <Contadores servicios={sv} conductores={conductores} />
      {/* Mapa grande (ocupa casi toda la altura) y alertas al lado con su propio scroll, sin salirse por la derecha. */}
      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
        <div className="min-w-0 lg:col-span-2 xl:col-span-3"><MapaFlota posiciones={ps} servicios={sv} conductores={conductores} vehiculos={vehiculos} umbralMin={umbralMin} eventos={ev} /></div>
        <div className="min-w-0 lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto lg:pr-1"><ColumnaAlertas servicios={sv} eventos={ev} conductores={conductores} vehiculos={vehiculos} alIncidencia={alIncidencia} /></div>
      </div>
    </div>
  );
}
