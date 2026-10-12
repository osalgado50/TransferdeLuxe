import { debePedirChecklist, itemsActivos, type ItemChecklist, type RespuestaItem } from "@dominio/checklist";
import { diaMadrid } from "@dominio/geo";
import { rangosJornada, type Jornada } from "@dominio/jornada";
import { leerModulos } from "@dominio/modulos";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Aviso, Boton, Tarjeta } from "~/components/ui";
import { llamarApi } from "~/lib/api";
import { exigir } from "~/lib/servicios";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { color } from "~/lib/tema";
import { useConsulta } from "~/lib/tiempoReal";
import { alCambiarJornada } from "~/lib/jornada";

async function enviar(ruta: string, body: unknown): Promise<string | null> {
  try {
    const r = await llamarApi(ruta, { method: "POST", body });
    if (r.ok) return null;
    return ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo enviar.";
  } catch { return "Sin conexión. Inténtalo de nuevo."; }
}

type Vehiculo = { id: string; matricula: string; modelo: string };

/** Checklist del vehículo en la pantalla de Hoy (si toca). Jornada e incidencias tienen su propia pantalla (pestaña «Jornada»). */
export function ModulosConductor() {
  const { sesion, perfil } = useSesion();
  const yo = sesion!.user.id;
  const { datos, recargar } = useConsulta(async () => {
    const r = rangosJornada(new Date());
    const [aj, jor, it, rev, veh] = await Promise.all([
      supabase.from("ajustes").select("modulos").eq("id", 1).maybeSingle(),
      supabase.from("jornadas").select("id,conductor_id,inicio,fin,pausas(inicio,fin)").eq("conductor_id", yo).or(`fin.is.null,fin.gte.${r.semana.desde}`).order("inicio"),
      supabase.from("checklist_items").select("id,texto,orden,activo"),
      supabase.from("checklist_revisiones").select("vehiculo_id").eq("conductor_id", yo).eq("fecha", diaMadrid(new Date())),
      supabase.from("vehiculos").select("id,matricula,modelo").eq("estado", "activo").order("matricula"),
    ]);
    return {
      m: leerModulos(aj.data?.modulos), jornadas: (jor.data ?? []) as Jornada[], items: itemsActivos((it.data ?? []) as ItemChecklist[]),
      hechos: new Set(((rev.data ?? []) as { vehiculo_id: string }[]).map((x) => x.vehiculo_id)), vehiculos: exigir(veh) as Vehiculo[],
    };
  }, [yo]);
  // La jornada se controla desde su pantalla; al cambiar, recargar para pedir el checklist si toca.
  useEffect(() => alCambiarJornada(() => void recargar()), [recargar]);
  if (!datos) return null;
  const { m, jornadas, items, hechos, vehiculos } = datos;
  const habitual = perfil?.vehiculo_habitual_id ?? null;
  const pedir = m.checklist && debePedirChecklist({
    hecho: habitual ? hechos.has(habitual) : hechos.size > 0, jornadaActiva: m.jornada,
    jornadaAbierta: jornadas.some((j) => !j.fin), hayVehiculo: vehiculos.length > 0, hayItems: items.length > 0,
  });
  return (
    <View style={{ gap: 12 }}>
      {pedir && <ChecklistTarjeta items={items} vehiculos={vehiculos} inicial={habitual} alGuardar={recargar} />}
    </View>
  );
}

function Opcion({ texto, activa, onPress, tono = color.marcaClaro }: { texto: string; activa: boolean; onPress: () => void; tono?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: activa }}
      style={[e.opcion, activa && { borderColor: tono, backgroundColor: "#ffffff14" }]}>
      <Text style={[e.opcionTexto, activa && { color: tono }]}>{texto}</Text>
    </Pressable>
  );
}

function ChecklistTarjeta({ items, vehiculos, inicial, alGuardar }: { items: ItemChecklist[]; vehiculos: Vehiculo[]; inicial: string | null; alGuardar: () => Promise<void> }) {
  const [vehiculo, setVehiculo] = useState(inicial ?? "");
  const [resp, setResp] = useState<Record<string, RespuestaItem>>({});
  const [obs, setObs] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    setOcupado(true); setError(null);
    const er = await enviar("/api/conductor/checklist", { vehiculo_id: vehiculo, respuestas: resp, observaciones: obs });
    setOcupado(false);
    if (er) setError(er); else await alGuardar();
  };
  return (
    <Tarjeta destacada>
      <Text style={e.titulo}>Checklist del vehículo (hoy)</Text>
      <Text style={e.tenue}>Vehículo</Text>
      <View style={e.envolver}>
        {vehiculos.map((v) => <Opcion key={v.id} texto={v.matricula} activa={vehiculo === v.id} onPress={() => setVehiculo(v.id)} />)}
      </View>
      {items.map((i) => (
        <View key={i.id} style={e.filaItem}>
          <Text style={[e.texto, { flex: 1 }]}>{i.texto}</Text>
          <Opcion texto="Bien" activa={resp[i.id] === "ok"} tono="#4ade80" onPress={() => setResp((r) => ({ ...r, [i.id]: "ok" }))} />
          <Opcion texto="Mal" activa={resp[i.id] === "mal"} tono="#f87171" onPress={() => setResp((r) => ({ ...r, [i.id]: "mal" }))} />
        </View>
      ))}
      <TextInput value={obs} onChangeText={setObs} placeholder="Observaciones" placeholderTextColor={color.textoTenue} multiline maxLength={1000} style={e.entrada} />
      {error && <Aviso tipo="error" texto={error} />}
      <Boton texto="Guardar checklist" onPress={() => void guardar()} cargando={ocupado} deshabilitado={!vehiculo || items.some((i) => !resp[i.id])} />
    </Tarjeta>
  );
}

const e = StyleSheet.create({
  titulo: { color: color.marcaClaro, fontSize: 20, fontWeight: "700" },
  texto: { color: color.texto, fontSize: 16 },
  tenue: { color: color.textoTenue, fontSize: 15 },
  fila: { flexDirection: "row", gap: 10, marginTop: 6 },
  filaItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  envolver: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  opcion: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, borderWidth: 1.5, borderColor: color.borde, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  opcionTexto: { color: color.texto, fontSize: 15, fontWeight: "600" },
  entrada: { borderWidth: 1, borderColor: color.borde, borderRadius: 10, color: color.texto, padding: 10, fontSize: 16, minHeight: 60, textAlignVertical: "top" },
});
