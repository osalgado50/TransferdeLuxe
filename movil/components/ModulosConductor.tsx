import { debePedirChecklist, itemsActivos, type ItemChecklist, type RespuestaItem } from "@dominio/checklist";
import { diaMadrid } from "@dominio/geo";
import { TIPOS_INCIDENCIA } from "@dominio/incidencias";
import { formatoDuracion, rangosJornada, resumenConductor, type AccionJornada, type Jornada } from "@dominio/jornada";
import { leerModulos } from "@dominio/modulos";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Aviso, Boton, Tarjeta } from "~/components/ui";
import { llamarApi } from "~/lib/api";
import { exigir } from "~/lib/servicios";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { color } from "~/lib/tema";
import { useConsulta } from "~/lib/tiempoReal";

async function enviar(ruta: string, body: unknown): Promise<string | null> {
  try {
    const r = await llamarApi(ruta, { method: "POST", body });
    if (r.ok) return null;
    return ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo enviar.";
  } catch { return "Sin conexión. Inténtalo de nuevo."; }
}

type Vehiculo = { id: string; matricula: string; modelo: string };

/** Jornada, checklist e incidencias en la pantalla principal (solo los módulos activos en la central). */
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
  if (!datos) return null;
  const { m, jornadas, items, hechos, vehiculos } = datos;
  const habitual = perfil?.vehiculo_habitual_id ?? null;
  const pedir = m.checklist && debePedirChecklist({
    hecho: habitual ? hechos.has(habitual) : hechos.size > 0, jornadaActiva: m.jornada,
    jornadaAbierta: jornadas.some((j) => !j.fin), hayVehiculo: vehiculos.length > 0, hayItems: items.length > 0,
  });
  return (
    <View style={{ gap: 12 }}>
      {m.jornada && <JornadaTarjeta jornadas={jornadas} alCambiar={recargar} />}
      {pedir && <ChecklistTarjeta items={items} vehiculos={vehiculos} inicial={habitual} alGuardar={recargar} />}
      {m.incidencias && <BotonIncidencia />}
    </View>
  );
}

function JornadaTarjeta({ jornadas, alCambiar }: { jornadas: Jornada[]; alCambiar: () => Promise<void> }) {
  const [ahora, setAhora] = useState(() => new Date());
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30_000); return () => clearInterval(t); }, []);
  const r = resumenConductor(jornadas, ahora);
  const hacer = async (a: AccionJornada) => {
    setOcupado(true); setError(null);
    const e = await enviar("/api/conductor/jornada", { accion: a });
    setOcupado(false);
    if (e) { setError(e); return; }
    await alCambiar();
    if (a === "finalizar") Alert.alert("Jornada finalizada", "Si has terminado, recuerda ponerte «Fuera de servicio» con el interruptor de arriba para dejar de enviar GPS.");
  };
  const finalizar = () => Alert.alert("Finalizar jornada", "¿Finalizar la jornada de hoy?", [
    { text: "Cancelar", style: "cancel" }, { text: "Finalizar", style: "destructive", onPress: () => void hacer("finalizar") },
  ]);
  const estadoTxt = r.estado === "fuera" ? "Sin jornada iniciada" : r.estado === "en_pausa" ? "En pausa"
    : `Trabajando desde las ${new Date(r.abierta!.inicio).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" })}`;
  return (
    <Tarjeta>
      <Text style={e.titulo}>Jornada</Text>
      <Text style={e.texto}>{estadoTxt}</Text>
      <Text style={e.tenue}>Hoy: {formatoDuracion(r.msHoy)} · Semana: {formatoDuracion(r.msSemana)}</Text>
      <View style={e.fila}>
        {r.estado === "fuera" && <Boton texto="Iniciar jornada" onPress={() => void hacer("iniciar")} cargando={ocupado} estilo={{ flex: 1 }} />}
        {r.estado === "trabajando" && <Boton texto="Pausa" variante="secundario" onPress={() => void hacer("pausa")} cargando={ocupado} estilo={{ flex: 1 }} />}
        {r.estado === "en_pausa" && <Boton texto="Reanudar" onPress={() => void hacer("reanudar")} cargando={ocupado} estilo={{ flex: 1 }} />}
        {r.estado !== "fuera" && <Boton texto="Finalizar jornada" variante="secundario" onPress={finalizar} deshabilitado={ocupado} estilo={{ flex: 1 }} />}
      </View>
      {error && <Aviso tipo="error" texto={error} />}
    </Tarjeta>
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

/** Botón «Incidencia» con formulario modal (tipo, descripción, foto opcional y última posición conocida). */
export function BotonIncidencia({ servicioId }: { servicioId?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState("");
  const [desc, setDesc] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cerrar = () => { setAbierto(false); setTipo(""); setDesc(""); setFoto(null); setError(null); };

  const hacerFoto = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) { setError("Sin permiso de cámara."); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!r.canceled && r.assets[0]) setFoto(r.assets[0].uri);
  };
  const mandar = async () => {
    setOcupado(true); setError(null);
    try {
      let foto_path: string | null = null;
      if (foto) {
        const m = await ImageManipulator.manipulateAsync(foto, [{ resize: { width: 1600 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
        const fd = new FormData();
        fd.append("foto", { uri: m.uri, name: "incidencia.jpg", type: "image/jpeg" } as unknown as Blob);
        const r = await llamarApi("/api/conductor/incidencia/foto", { method: "POST", form: fd });
        const j = (await r.json().catch(() => null)) as { fotoPath?: string; error?: string } | null;
        if (!r.ok || !j?.fotoPath) { setError(j?.error ?? "No se pudo subir la foto."); return; }
        foto_path = j.fotoPath;
      }
      let lat: number | null = null, lng: number | null = null;
      if ((await Location.getForegroundPermissionsAsync()).granted) {
        const pos = await Location.getLastKnownPositionAsync().catch(() => null);
        if (pos) { lat = pos.coords.latitude; lng = pos.coords.longitude; }
      }
      const er = await enviar("/api/conductor/incidencia", { tipo, descripcion: desc, servicio_id: servicioId ?? null, foto_path, lat, lng });
      if (er) { setError(er); return; }
      cerrar();
      Alert.alert("Incidencia enviada", "La central ya la tiene.");
    } catch { setError("Sin conexión. Inténtalo de nuevo."); }
    finally { setOcupado(false); }
  };
  return (
    <>
      <Boton texto="⚠ Incidencia" variante="peligro" onPress={() => setAbierto(true)} />
      <Modal visible={abierto} animationType="slide" onRequestClose={cerrar}>
        <ScrollView style={{ backgroundColor: color.fondo }} contentContainerStyle={{ padding: 20, paddingTop: 60, gap: 12 }}>
          <Text style={e.titulo}>Comunicar incidencia</Text>
          <View style={e.envolver}>
            {TIPOS_INCIDENCIA.map((t) => <Opcion key={t.clave} texto={t.nombre} activa={tipo === t.clave} tono="#f87171" onPress={() => setTipo(t.clave)} />)}
          </View>
          <TextInput value={desc} onChangeText={setDesc} placeholder="Descripción" placeholderTextColor={color.textoTenue} multiline maxLength={1000} style={[e.entrada, { minHeight: 100 }]} />
          <Boton texto={foto ? "Repetir foto ✓" : "Hacer foto (opcional)"} variante="secundario" onPress={() => void hacerFoto()} />
          {error && <Aviso tipo="error" texto={error} />}
          <Boton texto="Enviar a la central" onPress={() => void mandar()} cargando={ocupado} deshabilitado={!tipo} />
          <Boton texto="Cancelar" variante="texto" onPress={cerrar} />
        </ScrollView>
      </Modal>
    </>
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
