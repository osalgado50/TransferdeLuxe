// Hoja de cierre de jornada (app nativa): Modal a pantalla completa en 3 pasos. (1) Daños en el diagrama del coche visto
// desde arriba (DiagramaDanos; precargado con las zonas de los golpes/accidentes comunicados hoy). (2) Estado técnico, combustible y km.
// (3) Comentario y «Enviar y cerrar jornada». «Cancelar» no finaliza. Sin red: error y reintento con el mismo idAccion
// (lo marcado se conserva mientras el modal siga abierto).
import {
  COMBUSTIBLE, ITEMS_TECNICOS, MAX_COMENTARIO, TESTIGOS, alternarZona, gravedadCierre, normalizarZonas,
  resumenCierre, tecnicoInicial, validarKm, type Combustible, type GravedadCierre, type IdTestigo, type Tecnico,
} from "@dominio/cierre";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { DiagramaDanos, useAnchoDiagrama } from "./DiagramaDanos";
import { Boton } from "./ui";
import { nuevoIdAccion } from "~/lib/acciones";
import { llamarApi } from "~/lib/api";
import { color } from "~/lib/tema";

export interface VehiculoCierre { id: string; matricula: string; modelo: string; km_actuales: number }

const ROJO = "#dc2626";
const FONDO_G: Record<GravedadCierre, { fondo: string; borde: string; texto: string }> = {
  grave: { fondo: "#450a0a", borde: "#ef4444", texto: "#fee2e2" },
  mantenimiento: { fondo: "#451a03", borde: "#f59e0b", texto: "#fef3c7" },
  ok: { fondo: "#052e16", borde: "#22c55e", texto: "#dcfce7" },
};
/** `zonasIniciales`: zonas ya comunicadas hoy en golpes/accidentes (se precargan marcadas). `incidenciasHoy`: resumen para el paso 3. */
export function HojaCierre({ vehiculos, vehiculoInicial, alCancelar, alEnviado, zonasIniciales = [], incidenciasHoy = [] }: {
  vehiculos: VehiculoCierre[]; vehiculoInicial: string | null; alCancelar: () => void; alEnviado: (g: GravedadCierre) => void;
  zonasIniciales?: readonly string[]; incidenciasHoy?: readonly string[];
}) {
  // Ancho del diagrama: márgenes (24) + relleno (8) y, si cabe, rótulos laterales (2 × 16 + huecos).
  const { ancho, laterales } = useAnchoDiagrama(32);
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [vehiculo, setVehiculo] = useState(vehiculoInicial && vehiculos.some((v) => v.id === vehiculoInicial) ? vehiculoInicial : "");
  const [elegir, setElegir] = useState(!vehiculo);
  const [zonas, setZonas] = useState<string[]>(() => normalizarZonas(zonasIniciales));
  const precargadas = zonasIniciales.length;
  const [tecnico, setTecnico] = useState<Tecnico>(tecnicoInicial);
  const [combustible, setCombustible] = useState<Combustible | "">("");
  const [km, setKm] = useState("");
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const idAccion = useRef(nuevoIdAccion());
  const scroll = useRef<ScrollView>(null);

  const v = vehiculos.find((x) => x.id === vehiculo) ?? null;
  const kmOk = validarKm(km.trim() || null, v?.km_actuales ?? 0);
  const gravedad = gravedadCierre({ zonas, tecnico, combustible: combustible || "lleno" });
  const ir = (p: 1 | 2 | 3) => { setError(null); setPaso(p); scroll.current?.scrollTo({ y: 0, animated: false }); };

  const siguiente = () => {
    if (paso === 1) { if (!vehiculo) { setError("Elige el vehículo."); return; } ir(2); return; }
    if (!combustible) { setError("Indica el nivel de combustible."); return; }
    if (!kmOk.ok) { setError(kmOk.error); return; }
    ir(3);
  };
  const enviar = async () => {
    if (!combustible || !kmOk.ok || enviando) return;
    setEnviando(true); setError(null);
    try {
      const r = await llamarApi("/api/conductor/cierre", { method: "POST", body: { idAccion: idAccion.current, vehiculo_id: vehiculo, zonas, tecnico, combustible, km: kmOk.km, comentario } });
      const d = (await r.json().catch(() => null)) as { gravedad?: GravedadCierre; error?: string } | null;
      if (!r.ok) { setError(d?.error ?? `No se pudo enviar (error ${r.status}). Inténtalo de nuevo.`); return; }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      alEnviado(d?.gravedad ?? gravedad);
    } catch {
      setError("Sin conexión. Lo marcado se conserva: pulsa «Reintentar» cuando tengas cobertura.");
    } finally { setEnviando(false); }
  };
  const testigo = (id: IdTestigo) => setTecnico((t) => {
    const l = t.testigos ?? [];
    return { ...t, testigos: l.includes(id) ? l.filter((x) => x !== id) : [...l, id] };
  });
  const opcion = (activa: boolean, tono: "ok" | "malo", texto: string, alPulsar: () => void, etiqueta: string) => (
    <Pressable onPress={alPulsar} accessibilityRole="button" accessibilityLabel={etiqueta} accessibilityState={{ selected: activa }}
      style={({ pressed }) => [e.opcion, activa && (tono === "ok" ? e.opcionOk : e.opcionMal), pressed && { opacity: 0.75 }]}>
      <Text style={[e.opcionTexto, activa && { color: "#fff" }]}>{texto}</Text>
    </Pressable>
  );
  const g = FONDO_G[gravedad];

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!enviando) alCancelar(); }}>
      {/* Un Modal es otra ventana nativa: necesita su propio proveedor de zona segura. */}
      <SafeAreaProvider>
        <SafeAreaView style={e.pantalla} edges={["top", "bottom", "left", "right"]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={e.cabecera}>
              <View style={{ flex: 1 }}>
                <Text style={e.titulo} accessibilityRole="header">Cierre de jornada</Text>
                <Text style={e.subtitulo}>Paso {paso} de 3 · {paso === 1 ? "Daños del vehículo" : paso === 2 ? "Estado técnico" : "Comentario y envío"}</Text>
              </View>
              <Boton texto="Cancelar" variante="secundario" alto={44} tamano={16} deshabilitado={enviando} onPress={alCancelar} etiqueta="Cancelar sin finalizar la jornada" />
            </View>

            <ScrollView ref={scroll} contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
              {paso === 1 && (
                <>
                  {elegir || !v ? (
                    <View style={{ gap: 6 }}>
                      <Text style={e.etiqueta}>¿Qué vehículo has llevado hoy?</Text>
                      <View style={e.chips}>
                        {vehiculos.map((x) => (
                          <Pressable key={x.id} onPress={() => { setVehiculo(x.id); setElegir(false); setError(null); }} accessibilityRole="button"
                            accessibilityLabel={`${x.matricula}, ${x.modelo}`} accessibilityState={{ selected: x.id === vehiculo }}
                            style={[e.chip, x.id === vehiculo && e.chipOn]}>
                            <Text style={[e.chipTexto, x.id === vehiculo && { color: "#fff" }]}>{x.matricula} · {x.modelo}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={e.filaVehiculo}>
                      <Text style={e.vehiculo}>🚐 {v.matricula} · {v.modelo}</Text>
                      <Boton texto="Cambiar" variante="texto" alto={44} tamano={15} onPress={() => setElegir(true)} etiqueta="Cambiar de vehículo" />
                    </View>
                  )}
                  <Text style={e.ayuda}>Toca las zonas que se han dañado <Text style={{ fontWeight: "800" }}>hoy</Text> (se marcan en rojo). Si no hay daños, pulsa «Hecho».</Text>
                  {precargadas > 0 && <Text style={e.precarga}>Ya están marcadas las zonas de los golpes que has comunicado hoy. Añade las que falten.</Text>}
                  <View style={{ alignItems: "center" }}><DiagramaDanos zonas={zonas} alAlternar={(id) => setZonas((z) => alternarZona(z, id))} ancho={ancho} laterales={laterales} /></View>
                  <Text style={e.ayuda} accessibilityLiveRegion="polite">{zonas.length ? `${zonas.length} zona${zonas.length > 1 ? "s" : ""} marcada${zonas.length > 1 ? "s" : ""}` : "Sin daños marcados"}</Text>
                </>
              )}

              {paso === 2 && (
                <>
                  {ITEMS_TECNICOS.map((i) => (
                    <View key={i.id} style={e.item}>
                      <Text style={e.itemTitulo}>{i.etiqueta}</Text>
                      {!!i.ayuda && <Text style={e.ayudaPeq}>{i.ayuda}</Text>}
                      <View style={e.fila}>
                        {opcion(tecnico[i.id] === "ok", "ok", i.textoOk, () => setTecnico((t) => ({ ...t, [i.id]: "ok" })), `${i.etiqueta}: ${i.textoOk}`)}
                        {opcion(tecnico[i.id] !== "ok", "malo", i.textoMalo, () => setTecnico((t) => ({ ...t, [i.id]: i.malo })), `${i.etiqueta}: ${i.textoMalo}`)}
                      </View>
                      {i.id === "testigos_cuadro" && tecnico.testigos_cuadro !== "ok" && (
                        <View style={e.chips}>
                          {TESTIGOS.map((t) => {
                            const on = (tecnico.testigos ?? []).includes(t.id);
                            return (
                              <Pressable key={t.id} onPress={() => testigo(t.id)} accessibilityRole="button" accessibilityLabel={`Testigo de ${t.etiqueta}`}
                                accessibilityState={{ selected: on }} style={[e.chip, on && e.chipMal]}>
                                <Text style={[e.chipTexto, on && { color: "#fff" }]}>Testigo de {t.etiqueta}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  ))}
                  <View style={e.item}>
                    <Text style={e.itemTitulo}>Combustible</Text>
                    <View style={e.fila}>
                      {COMBUSTIBLE.map((c) => (
                        <Pressable key={c.id} onPress={() => setCombustible(c.id)} accessibilityRole="button" accessibilityLabel={`Combustible: ${c.etiqueta}`}
                          accessibilityState={{ selected: combustible === c.id }}
                          style={[e.opcion, { paddingHorizontal: 2 }, combustible === c.id && (c.id === "reserva" ? e.opcionAviso : e.opcionMarca)]}>
                          <Text style={[e.opcionTexto, { fontSize: 15 }, combustible === c.id && { color: "#fff" }]}>{c.etiqueta}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View style={e.item}>
                    <Text style={e.itemTitulo}>Km del cuentakilómetros (opcional)</Text>
                    <TextInput value={km} onChangeText={(t) => setKm(t.replace(/[^\d]/g, ""))} keyboardType="number-pad" inputMode="numeric" maxLength={7}
                      placeholder={v ? `≥ ${v.km_actuales.toLocaleString("es-ES")}` : ""} placeholderTextColor={color.textoTenue}
                      accessibilityLabel="Kilómetros del cuentakilómetros" style={e.entrada} />
                  </View>
                </>
              )}

              {paso === 3 && (
                <>
                  <View style={[e.resumen, { backgroundColor: g.fondo, borderColor: g.borde }]}>
                    <Text style={[e.resumenTexto, { color: g.texto }]}>{resumenCierre({ zonas, tecnico, combustible: combustible || "lleno", matricula: v?.matricula })}</Text>
                  </View>
                  {incidenciasHoy.length > 0 && (
                    <View style={e.item}>
                      <Text style={e.itemTitulo}>Incidencias de hoy</Text>
                      <Text style={e.ayuda}>{incidenciasHoy.join(" · ")}</Text>
                      <Text style={e.ayudaPeq}>Se envían a la central junto con esta hoja.</Text>
                    </View>
                  )}
                  <Text style={e.itemTitulo}>Comentario para la central (opcional)</Text>
                  <TextInput value={comentario} onChangeText={setComentario} multiline maxLength={MAX_COMENTARIO} textAlignVertical="top"
                    placeholder="Ej.: rozadura en el portón al aparcar en el aeropuerto" placeholderTextColor={color.textoTenue}
                    accessibilityLabel="Comentario para la central" style={[e.entrada, { minHeight: 140, fontSize: 17 }]} />
                  <Text style={[e.ayudaPeq, { textAlign: "right" }]}>{comentario.length}/{MAX_COMENTARIO}</Text>
                </>
              )}
              {!!error && <Text style={e.error} accessibilityRole="alert">{error}</Text>}
            </ScrollView>

            <View style={e.pie}>
              {paso === 1
                ? <Boton texto="Borrar todo" variante="secundario" estilo={{ flex: 1 }} deshabilitado={!zonas.length} onPress={() => setZonas([])} etiqueta="Borrar todas las zonas marcadas" />
                : <Boton texto="Atrás" variante="secundario" estilo={{ flex: 1 }} deshabilitado={enviando} onPress={() => ir(paso === 3 ? 2 : 1)} />}
              {paso < 3
                ? <Boton texto={paso === 1 ? "Hecho" : "Siguiente"} estilo={[{ flex: 1 }, paso === 1 && { backgroundColor: ROJO }]} onPress={siguiente} />
                : <Boton texto={error ? "Reintentar" : "Enviar y cerrar jornada"} cargando={enviando} estilo={{ flex: 2, backgroundColor: ROJO }} tamano={17} onPress={() => void enviar()} />}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  cabecera: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.borde },
  titulo: { color: color.marcaClaro, fontSize: 22, fontWeight: "800" },
  subtitulo: { color: color.textoTenue, fontSize: 14 },
  contenido: { padding: 12, gap: 12, paddingBottom: 24 },
  filaVehiculo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  vehiculo: { color: color.texto, fontSize: 18, fontWeight: "700", flexShrink: 1 },
  etiqueta: { color: color.texto, fontSize: 17, fontWeight: "700" },
  ayuda: { color: color.textoSuave, fontSize: 16 },
  ayudaPeq: { color: color.textoTenue, fontSize: 14 },
  precarga: { color: "#fecaca", backgroundColor: "#450a0a", borderRadius: 10, padding: 10, fontSize: 15, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, borderRadius: 22, borderWidth: 1.5, borderColor: color.borde, paddingHorizontal: 14, justifyContent: "center" },
  chipOn: { backgroundColor: color.marca, borderColor: color.marcaClaro },
  chipMal: { backgroundColor: ROJO, borderColor: "#ef4444" },
  chipTexto: { color: color.texto, fontSize: 16, fontWeight: "600" },
  item: { backgroundColor: color.tarjeta, borderWidth: 1, borderColor: color.borde, borderRadius: 14, padding: 12, gap: 8 },
  itemTitulo: { color: color.texto, fontSize: 18, fontWeight: "700" },
  fila: { flexDirection: "row", gap: 8 },
  opcion: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 2, borderColor: color.borde, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  opcionOk: { backgroundColor: "#16a34a", borderColor: "#22c55e" },
  opcionMal: { backgroundColor: ROJO, borderColor: "#ef4444" },
  opcionAviso: { backgroundColor: "#d97706", borderColor: "#f59e0b" },
  opcionMarca: { backgroundColor: color.marca, borderColor: color.marcaClaro },
  opcionTexto: { color: color.texto, fontSize: 17, fontWeight: "800" },
  entrada: { minHeight: 52, borderWidth: 1.5, borderColor: color.borde, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: color.texto, fontSize: 20, backgroundColor: "#020617" },
  resumen: { borderWidth: 2, borderRadius: 14, padding: 12 },
  resumenTexto: { fontSize: 18, fontWeight: "700" },
  error: { color: "#fecaca", backgroundColor: "#450a0a", borderRadius: 10, padding: 12, fontSize: 16 },
  pie: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: color.borde },
});
