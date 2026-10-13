// Pantalla «Jornada»: estado de la jornada (horas de hoy y de la semana, GPS), botones grandes Iniciar / Pausa / Reanudar /
// Finalizar e incidencias del día. Iniciar la jornada enciende antes el GPS (sin permiso de ubicación NO se inicia);
// finalizarla (tras enviar la hoja de cierre) lo apaga. La pausa no toca el GPS.
import { etiquetaZona, cierreObligatorio, normalizarZonas, type GravedadCierre } from "@dominio/cierre";
import { acumuladoDelDia, esIncidenciaGrave, nombreTipoIncidencia } from "@dominio/incidencias";
import { formatoDuracion, rangosJornada, resumenConductor, type AccionJornada, type Jornada } from "@dominio/jornada";
import { leerModulos } from "@dominio/modulos";
import { itemsActivos, type ItemChecklist } from "@dominio/checklist";
import { diaMadrid } from "@dominio/geo";
import { proximasAusencias, textoAusencia, type Ausencia } from "@dominio/ausencias";
import { accionFinJornada, ESTADOS_PENDIENTE_HOY, MOTIVO_FIN_JORNADA, pendientesHoy, textoPendientes } from "@dominio/finJornada";
import { lugarBreve } from "@dominio/actividad";
import { agruparHorarios, textoHorarioHoy } from "@dominio/horarios";
import type { EstadoInterruptor } from "@dominio/gpsNativo";
import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, Modal, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { HojaCierre, type VehiculoCierre } from "~/components/HojaCierre";
import { BotonIncidencia } from "~/components/Incidencias";
import { ChecklistTarjeta } from "~/components/ModulosConductor";
import { AvisoSinFondo, useExplicacionUbicacion } from "~/components/InterruptorGps";
import { Aviso, Boton } from "~/components/ui";
import { llamarApi } from "~/lib/api";
import { nuevoIdAccion } from "~/lib/acciones";
import { avisar as avisarCola, colaDe, drenar } from "~/lib/cola";
import { hora as fmtHora, fmt } from "~/lib/formato";
import { apagarServicio, encenderServicio, estadoGps } from "~/lib/gps";
import { alCambiarGps, avisarCambioJornada } from "~/lib/jornada";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { color } from "~/lib/tema";
import { useConsulta } from "~/lib/tiempoReal";

interface PendienteHoy { id: string; estado: string; fecha_hora_recogida: string; origen_texto: string; destino_texto: string }
interface IncidenciaHoy { id: string; tipo: string; zonas: string[] | null; descripcion: string; creado_en: string; resuelta: boolean }

const VERDE = "#16a34a", AMBAR = "#d97706", ROJO = "#dc2626";
const hhmm = (iso: string) => fmt(fmtHora, iso);

/** Estado del GPS «En servicio» (mismo almacenamiento que el interruptor de la cabecera; se actualiza con sus cambios). */
function useEstadoGps(yo: string): EstadoInterruptor | null {
  const [estado, setEstado] = useState<EstadoInterruptor | null>(null);
  const leer = useCallback(() => { void estadoGps(yo).then(setEstado, () => undefined); }, [yo]);
  useEffect(() => {
    leer();
    const quitar = alCambiarGps(leer);
    const s = AppState.addEventListener("change", (e) => { if (e === "active") leer(); });
    return () => { quitar(); s.remove(); };
  }, [leer]);
  return estado;
}

export default function PantallaJornada() {
  const { sesion } = useSesion();
  const yo = sesion!.user.id;
  const { datos, error, cargando, recargar } = useConsulta(async () => {
    const r = rangosJornada(new Date());
    const [aj, jor, veh, per, inc, it, rev, aus, hor, exc] = await Promise.all([
      supabase.from("ajustes").select("modulos").eq("id", 1).maybeSingle(),
      supabase.from("jornadas").select("id,conductor_id,inicio,fin,pausas(inicio,fin)").eq("conductor_id", yo).or(`fin.is.null,fin.gte.${r.semana.desde}`).order("inicio"),
      supabase.from("vehiculos").select("id,matricula,modelo,km_actuales").eq("estado", "activo").order("matricula"),
      supabase.from("perfiles").select("vehiculo_habitual_id").eq("id", yo).maybeSingle(),
      supabase.from("incidencias").select("id,tipo,zonas,descripcion,creado_en,resuelta").eq("conductor_id", yo).gte("creado_en", r.hoy.desde).order("creado_en", { ascending: false }),
      supabase.from("checklist_items").select("id,texto,orden,activo"),
      supabase.from("checklist_revisiones").select("vehiculo_id").eq("conductor_id", yo).eq("fecha", diaMadrid(new Date())),
      // Próximas ausencias marcadas por la central (solo lectura). Con un servidor sin la tabla, simplemente vacío.
      supabase.from("ausencias").select("id,conductor_id,desde,hasta,franja,tipo,nota").eq("conductor_id", yo).gte("hasta", diaMadrid(new Date())).order("desde").limit(10),
      // Su horario (semana tipo + cambio de hoy). Con un servidor sin las tablas, simplemente no se muestra.
      supabase.from("horarios_conductor").select("conductor_id,dia_semana,tramos,vehiculo_id").eq("conductor_id", yo),
      supabase.from("excepciones_horario").select("conductor_id,fecha,tramos,nota").eq("conductor_id", yo).eq("fecha", diaMadrid(new Date())),
    ]);
    if (jor.error) throw new Error(jor.error.message);
    const m = leerModulos(aj.data?.modulos);
    const vehiculos = (veh.data ?? []) as VehiculoCierre[];
    const habitual = (per.data?.vehiculo_habitual_id as string | null) ?? null;
    const items = itemsActivos((it.data ?? []) as ItemChecklist[]);
    const hechos = new Set(((rev.data ?? []) as { vehiculo_id: string }[]).map((x) => x.vehiculo_id));
    // Checklist del vehículo ANTES de iniciar la jornada (una vez al día por vehículo).
    const checklist = m.checklist && items.length > 0 && vehiculos.length > 0 && !(habitual ? hechos.has(habitual) : hechos.size > 0)
      ? { items, vehiculos, habitual } : null;
    return {
      checklist,
      m, jornadas: (jor.data ?? []) as Jornada[], incidencias: (inc.data ?? []) as IncidenciaHoy[],
      ausencias: proximasAusencias((aus.data ?? []) as Ausencia[], diaMadrid(new Date())),
      horarioHoy: textoHorarioHoy(agruparHorarios(hor.data ?? [], exc.data ?? []).get(yo), diaMadrid(new Date())),
      // Hoja de cierre al finalizar (módulos jornada + checklist + cierre); sin vehículos activos, como antes.
      cierre: cierreObligatorio(m) && vehiculos.length > 0 ? { vehiculos, habitual: (per.data?.vehiculo_habitual_id as string | null) ?? null } : null,
    };
  }, [yo]);
  const gps = useEstadoGps(yo);
  const { explicar, modal } = useExplicacionUbicacion();
  const [ahora, setAhora] = useState(() => new Date());
  const [ocupado, setOcupado] = useState(false);
  const [hoja, setHoja] = useState(false);
  const [sinGps, setSinGps] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30_000); return () => clearInterval(t); }, []);

  const tirar = async () => { setRefrescando(true); await recargar(); setRefrescando(false); };
  const accion = async (a: AccionJornada): Promise<boolean> => {
    let err: string | null = null;
    try {
      const res = await llamarApi("/api/conductor/jornada", { method: "POST", body: { accion: a } });
      if (!res.ok) err = ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo guardar.";
    } catch { err = "Sin conexión. Inténtalo de nuevo."; }
    if (err) { Alert.alert("Jornada", err); return false; }
    await recargar();
    avisarCambioJornada(); // icono de la pestaña y checklist de Hoy
    return true;
  };
  const conOcupado = (f: () => Promise<void>) => async () => {
    if (ocupado) return;
    setOcupado(true);
    try { await f(); } finally { setOcupado(false); }
  };

  // Iniciar: primero el GPS (mismo flujo de permisos que el interruptor). Sin permiso de ubicación no se inicia.
  const [pidiendoChecklist, setPidiendoChecklist] = useState(false);
  // Iniciar: 1) checklist del vehículo si falta hoy; 2) GPS; 3) jornada.
  const pulsarIniciar = () => {
    if (datos?.checklist) { setPidiendoChecklist(true); return; }
    void iniciar();
  };
  const iniciar = conOcupado(async () => {
    setSinGps(null);
    if ((await estadoGps(yo)) === "fuera") {
      const r = await encenderServicio(yo, explicar);
      if (r.error) {
        setSinGps(/^Sin permiso/.test(r.error)
          ? "No se ha iniciado la jornada: la jornada se trabaja con el GPS activo para que la central sepa dónde estás. Permite la ubicación en Ajustes y vuelve a pulsar «Iniciar jornada»."
          : `No se ha iniciado la jornada: ${r.error}`);
        return;
      }
    }
    await accion("iniciar");
  });
  const apagarGps = async () => {
    const avisado = await apagarServicio(yo);
    return avisado ? "GPS apagado: ya no se envía tu ubicación." : "GPS apagado (no se pudo avisar a la central; te verá desconectado en unos minutos).";
  };
  // Finalizar: antes de la hoja de cierre, los servicios de HOY aún por hacer (los de mañana son otra jornada: no se tocan).
  const [pendientes, setPendientes] = useState<PendienteHoy[] | null>(null);
  const [volvere, setVolvere] = useState(false);
  const pulsarFinalizar = () => void conOcupado(async () => {
    const ahora = new Date();
    let lista: PendienteHoy[] = [];
    try {
      const { data } = await supabase.from("servicios").select("id,estado,fecha_hora_recogida,origen_texto,destino_texto").eq("conductor_id", yo)
        .in("estado", [...ESTADOS_PENDIENTE_HOY]).gt("fecha_hora_recogida", ahora.toISOString()).lt("fecha_hora_recogida", rangosJornada(ahora).hoy.hasta).limit(50);
      lista = pendientesHoy((data ?? []) as PendienteHoy[], ahora);
    } catch { /* sin conexión: no se bloquea el cierre */ }
    if (lista.length) { setVolvere(false); setPendientes(lista); } else finalizar();
  })();
  const devolverTodos = async () => {
    const lista = pendientes ?? [];
    setPendientes(null);
    const c = await colaDe(yo);
    let n = 0;
    for (const s of lista) {
      const a = accionFinJornada(s.estado);
      if (!a) continue;
      c.rechazos.delete(s.id);
      c.cola.encolar({ idAccion: nuevoIdAccion(), servicioId: s.id, accion: a, motivo: MOTIVO_FIN_JORNADA });
      n++;
    }
    avisarCola(c);
    void drenar(yo, true).catch(() => {}); // si no hay cobertura, la cola reintenta
    Alert.alert("Servicios devueltos", `${n === 1 ? "1 servicio devuelto" : `${n} servicios devueltos`} a la central para reasignarlos.`, [{ text: "Seguir", onPress: finalizar }]);
  };
  const finalizar = () => {
    if (!datos) return;
    if (datos.cierre) { setHoja(true); return; }
    Alert.alert("Finalizar jornada", "¿Terminas la jornada de hoy? Se apagará el GPS.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Finalizar", style: "destructive", onPress: () => void conOcupado(async () => {
        if (await accion("finalizar")) Alert.alert("Jornada finalizada", await apagarGps());
      })() },
    ]);
  };
  const cerrada = (g: GravedadCierre) => { setHoja(false); void conOcupado(async () => {
    const txtGps = await apagarGps();
    await recargar();
    avisarCambioJornada();
    const txt = g === "ok" ? "Vehículo listo para mañana." : g === "grave" ? "La central revisará los daños." : "La central programará el mantenimiento.";
    Alert.alert("Jornada finalizada", `Hoja de cierre enviada con todo lo de hoy. ${txt}\n\n${txtGps}`);
  })(); };

  if (!datos) {
    return (
      <ScrollView contentContainerStyle={e.contenido} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={tirar} tintColor={color.marcaClaro} />}>
        <Text style={e.titulo} accessibilityRole="header">Jornada</Text>
        {error ? <Aviso tipo="error" texto={`Error al cargar: ${error}. Desliza hacia abajo para reintentar.`} /> : cargando && <Aviso texto="Cargando…" />}
      </ScrollView>
    );
  }
  const { m, jornadas, incidencias } = datos;
  const r = resumenConductor(jornadas, ahora);
  const pausa = r.abierta?.pausas?.find((p) => !p.fin) ?? null;
  const acumulado = acumuladoDelDia(incidencias, hhmm);
  const tono = r.estado === "trabajando" ? "#4ade80" : r.estado === "en_pausa" ? "#fbbf24" : color.textoSuave;

  return (
    <ScrollView contentContainerStyle={e.contenido} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={tirar} tintColor={color.marcaClaro} />}>
      <Text style={e.titulo} accessibilityRole="header">Jornada</Text>
      {error && <Aviso tipo="error" texto={`Error al actualizar: ${error}`} />}
      {datos.horarioHoy && <Text style={e.horario} accessibilityRole="text">🕒 {datos.horarioHoy}</Text>}

      {m.jornada ? (
        <>
          <View style={[e.estado, { borderColor: tono }]} accessibilityRole="summary">
            <Text style={[e.estadoTexto, { color: tono }]}>
              {r.estado === "fuera" ? "Sin iniciar" : r.estado === "en_pausa" ? `⏸ En pausa desde las ${pausa ? hhmm(pausa.inicio) : "--:--"}` : `● Trabajando desde las ${hhmm(r.abierta!.inicio)}`}
            </Text>
            <View style={e.horas}>
              <View style={{ flex: 1 }}><Text style={e.horasEtiqueta}>Hoy</Text><Text style={e.horasValor}>{formatoDuracion(r.msHoy)}</Text></View>
              <View style={{ flex: 1 }}><Text style={e.horasEtiqueta}>Semana</Text><Text style={e.horasValor}>{formatoDuracion(r.msSemana)}</Text></View>
            </View>
            <Text style={[e.gps, { color: gps && gps !== "fuera" ? "#4ade80" : color.textoTenue }]}>
              {gps === null ? "📍 GPS…" : gps === "fuera" ? "📍 GPS apagado" : gps === "solo_primer_plano" ? "📍 GPS activo (solo con la app abierta)" : "📍 GPS activo"}
            </Text>
          </View>
          {gps === "solo_primer_plano" && r.estado !== "fuera" && <AvisoSinFondo />}

          {r.estado === "fuera" && <>
            <Boton texto="▶ Iniciar jornada" alto={72} tamano={22} cargando={ocupado} estilo={{ backgroundColor: VERDE }}
              etiqueta="Iniciar jornada (activa el GPS)" onPress={pulsarIniciar} />
            <Text style={e.ayuda}>Al iniciar se activa el GPS: la central verá dónde estás mientras trabajas.</Text>
          </>}
          {r.estado === "trabajando" && <Boton texto="⏸ Pausa" alto={64} tamano={20} deshabilitado={ocupado} estilo={{ backgroundColor: AMBAR }}
            etiqueta="Hacer una pausa (comida, descanso)" onPress={() => void conOcupado(async () => { await accion("pausa"); })()} />}
          {r.estado === "en_pausa" && <Boton texto="▶ Reanudar" alto={64} tamano={20} deshabilitado={ocupado} estilo={{ backgroundColor: AMBAR }}
            onPress={() => void conOcupado(async () => { await accion("reanudar"); })()} />}
          {r.estado !== "fuera" && <Boton texto="🏁 Finalizar jornada" alto={64} tamano={20} variante="secundario" cargando={ocupado && !hoja}
            etiqueta={datos.cierre ? "Finalizar jornada: rellenar la hoja de cierre del vehículo" : "Finalizar jornada"} onPress={pulsarFinalizar} />}
          {sinGps && (
            <View style={e.sinGps} accessibilityRole="alert">
              <Text style={e.sinGpsTexto}>{sinGps}</Text>
              <Boton texto="Abrir Ajustes" variante="secundario" alto={48} tamano={17} onPress={() => void Linking.openSettings()} />
            </View>
          )}
        </>
      ) : <Aviso texto="El registro de jornada está desactivado por la central." />}

      <View style={{ gap: 8, marginTop: 8 }}>
        <Text style={e.subtitulo} accessibilityRole="header">Próximas ausencias</Text>
        {datos.ausencias.length === 0 ? <Text style={e.vacio}>Ninguna marcada por la central.</Text> : datos.ausencias.map((a) => (
          <View key={a.id ?? `${a.desde}-${a.tipo}`} style={e.incidencia}>
            <Text style={e.incTitulo}>{textoAusencia(a)}</Text>
            {!!a.nota && <Text style={e.incDesc}>{a.nota}</Text>}
          </View>
        ))}
      </View>

      {m.incidencias && (
        <View style={{ gap: 10, marginTop: 8 }}>
          <Text style={e.subtitulo} accessibilityRole="header">Incidencias</Text>
          <BotonIncidencia grande alEnviada={() => void recargar()} />
          <Text style={e.ayuda}>Avería, accidente o golpe: llegan a la central al momento, con alarma.</Text>
          <Text style={e.etiqueta}>Incidencias de hoy</Text>
          {incidencias.length === 0 ? <Text style={e.vacio}>Ninguna.</Text> : incidencias.map((i) => {
            const zonas = normalizarZonas(i.zonas ?? []);
            return (
              <View key={i.id} style={[e.incidencia, esIncidenciaGrave(i.tipo) && { borderColor: "#ef4444" }]}>
                <Text style={e.incTitulo}>{hhmm(i.creado_en)} · {nombreTipoIncidencia(i.tipo)}{i.resuelta ? " · resuelta" : ""}</Text>
                {zonas.length > 0 && <Text style={e.incZonas}>Daños: {zonas.map(etiquetaZona).join(", ")}</Text>}
                {!!i.descripcion && <Text style={e.incDesc} numberOfLines={3}>{i.descripcion}</Text>}
              </View>
            );
          })}
          {acumulado.zonas.length > 0 && r.estado !== "fuera" && datos.cierre && (
            <Text style={e.ayuda}>Las zonas dañadas de hoy saldrán ya marcadas en la hoja de cierre.</Text>
          )}
        </View>
      )}

      {hoja && datos.cierre && (
        <HojaCierre vehiculos={datos.cierre.vehiculos} vehiculoInicial={datos.cierre.habitual} zonasIniciales={acumulado.zonas}
          incidenciasHoy={acumulado.resumen} alCancelar={() => setHoja(false)} alEnviado={cerrada} />
      )}
      {pendientes && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPendientes(null)}>
          <SafeAreaProvider>
            <SafeAreaView style={{ flex: 1, backgroundColor: color.fondo }} edges={["top", "bottom"]}>
              <ScrollView contentContainerStyle={e.contenido}>
                {!volvere ? <>
                  <Text style={[e.subtitulo, { color: "#fcd34d" }]} accessibilityRole="header">Te quedan {textoPendientes(pendientes.map((p) => hhmm(p.fecha_hora_recogida)))}</Text>
                  {pendientes.map((p) => (
                    <View key={p.id} style={e.incidencia}>
                      <Text style={e.incTitulo}>{hhmm(p.fecha_hora_recogida)} · {lugarBreve(p.origen_texto)} → {lugarBreve(p.destino_texto)}</Text>
                    </View>
                  ))}
                  <Text style={e.ayudaModal}>¿Vas a volver para hacerlos? Si no, no pueden quedar desatendidos.</Text>
                  <Boton texto="No, devolverlos a la central" alto={64} tamano={19} estilo={{ backgroundColor: AMBAR }} onPress={() => void devolverTodos()} />
                  <Boton texto="Sí, volveré para hacerlos" alto={64} tamano={19} variante="secundario" onPress={() => setVolvere(true)} />
                  <Boton texto="Cancelar" variante="texto" alto={48} onPress={() => setPendientes(null)} />
                </> : <>
                  <Text style={[e.subtitulo, { color: "#fcd34d" }]} accessibilityRole="header">Mejor haz una pausa</Text>
                  <Text style={e.ayudaModal}>Si vas a volver hoy, usa ⏸ Pausa en vez de finalizar: la jornada sigue abierta y la central sabe que harás esos servicios.</Text>
                  {r.estado === "trabajando" && <Boton texto="⏸ Hacer una pausa" alto={64} tamano={19} estilo={{ backgroundColor: AMBAR }}
                    onPress={() => { setPendientes(null); void conOcupado(async () => { await accion("pausa"); })(); }} />}
                  <Boton texto="Finalizar igualmente" alto={64} tamano={19} variante="secundario" onPress={() => { setPendientes(null); finalizar(); }} />
                  <Boton texto="Cancelar" variante="texto" alto={48} onPress={() => setPendientes(null)} />
                </>}
              </ScrollView>
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      )}
      {pidiendoChecklist && datos.checklist && (
        // Checklist antes de empezar: al guardarlo se inicia la jornada (y el GPS) automáticamente.
        <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setPidiendoChecklist(false)}>
          <SafeAreaProvider>
            <SafeAreaView style={{ flex: 1, backgroundColor: color.fondo }} edges={["top", "bottom"]}>
              <View style={e.cabModal}>
                <Text style={e.subtitulo}>Antes de empezar</Text>
                <Boton texto="Cancelar" variante="secundario" alto={44} tamano={16} onPress={() => setPidiendoChecklist(false)} />
              </View>
              <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
                <Text style={e.ayudaModal}>Revisa el vehículo. Al guardar el checklist se inicia la jornada y se activa el GPS.</Text>
                <ChecklistTarjeta items={datos.checklist.items} vehiculos={datos.checklist.vehiculos} inicial={datos.checklist.habitual}
                  alGuardar={async () => { setPidiendoChecklist(false); await recargar(); avisarCambioJornada(); void iniciar(); }} />
              </ScrollView>
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      )}
      {modal}
    </ScrollView>
  );
}

const e = StyleSheet.create({
  cabModal: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.borde },
  ayudaModal: { color: color.textoSuave, fontSize: 16 },
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  titulo: { color: color.marcaClaro, fontSize: 24, fontWeight: "700" },
  subtitulo: { color: color.marcaClaro, fontSize: 22, fontWeight: "700" },
  estado: { borderWidth: 2, borderRadius: 18, padding: 16, gap: 12, backgroundColor: color.tarjeta },
  estadoTexto: { fontSize: 24, fontWeight: "800" },
  horas: { flexDirection: "row", gap: 12 },
  horasEtiqueta: { color: color.textoTenue, fontSize: 15 },
  horasValor: { color: color.texto, fontSize: 22, fontWeight: "700" },
  gps: { fontSize: 17, fontWeight: "700" },
  horario: { color: color.texto, fontSize: 19, fontWeight: "700", borderWidth: 1, borderColor: color.borde, borderRadius: 14, padding: 12, backgroundColor: color.tarjeta },
  ayuda: { color: color.textoSuave, fontSize: 15 },
  sinGps: { backgroundColor: "#450a0a", borderColor: ROJO, borderWidth: 1.5, borderRadius: 14, padding: 12, gap: 10 },
  sinGpsTexto: { color: "#fee2e2", fontSize: 16, fontWeight: "600", lineHeight: 22 },
  etiqueta: { color: color.texto, fontSize: 18, fontWeight: "700", marginTop: 4 },
  vacio: { color: color.textoTenue, fontSize: 16 },
  incidencia: { borderWidth: 1, borderColor: color.borde, borderRadius: 12, padding: 12, gap: 4, backgroundColor: color.tarjeta },
  incTitulo: { color: color.texto, fontSize: 17, fontWeight: "700" },
  incZonas: { color: "#fecaca", fontSize: 15, fontWeight: "600" },
  incDesc: { color: color.textoSuave, fontSize: 15 },
});
