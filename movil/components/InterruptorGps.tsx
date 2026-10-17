import { AVISO_SIN_FONDO, alIniciar, type EstadoInterruptor } from "@dominio/gpsNativo";
import { estadoEnvio } from "@dominio/gps";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Linking, Modal, StyleSheet, Switch, Text, View } from "react-native";
import { Boton } from "~/components/ui";
import { apagarServicio, arrancarGps, encenderServicio, leerEnServicio, pararGps, permisosActuales, tareaCorriendo } from "~/lib/gps";
import { alCambiarGps } from "~/lib/jornada";
import { leerUltimoEnvio } from "~/lib/gpsTarea";
import { color } from "~/lib/tema";

/**
 * Pantalla explicativa «Ubicación Siempre» antes del diálogo del sistema (interruptor de la cabecera y «Iniciar jornada»).
 * `explicar()` la abre y resuelve true con «Continuar» (pedir «Siempre») o false con «Ahora no».
 */
export function useExplicacionUbicacion(): { explicar: () => Promise<boolean>; modal: ReactNode } {
  const [abierta, setAbierta] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const explicar = useCallback(() => new Promise<boolean>((res) => { resolver.current = res; setAbierta(true); }), []);
  const responder = (v: boolean) => { setAbierta(false); resolver.current?.(v); resolver.current = null; };
  const modal = (
    <Modal visible={abierta} transparent animationType="fade" onRequestClose={() => responder(false)}>
      <View style={estilos.velo}>
        <View style={estilos.dialogo}>
          <Text style={estilos.titulo}>Ubicación «Siempre»</Text>
          <Text style={estilos.cuerpo}>
            Para que la central vea dónde estás con la pantalla bloqueada o con otra app abierta (navegador, llamadas),
            en el siguiente aviso elige «Permitir siempre» (en Android: «Permitir todo el tiempo»).
            Solo se envía tu posición mientras estés «En servicio».
          </Text>
          <Boton texto="Continuar" onPress={() => responder(true)} />
          <Boton texto="Ahora no (solo con la app abierta)" variante="texto" tamano={15} onPress={() => responder(false)} />
        </View>
      </View>
    </Modal>
  );
  return { explicar, modal };
}

/** Interruptor «En servicio / Fuera de servicio» de la cabecera + estado del último envío. Se resincroniza si la pantalla
 *  Jornada enciende (al iniciar la jornada) o apaga (al finalizarla) el GPS. */
export function InterruptorGps({ conductorId }: { conductorId: string }) {
  const [estado, setEstado] = useState<EstadoInterruptor>("fuera");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<number | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  const desde = useRef<number | null>(null);
  const { explicar, modal } = useExplicacionUbicacion();

  // Al abrir y al volver a primer plano: reconciliar estado persistido, tarea y permisos (pudieron cambiar en Ajustes).
  const ocupadoRef = useRef(false);
  const sincronizar = useCallback(async () => {
    if (ocupadoRef.current) return; // no pisar un encendido/apagado en curso
    const [on, corriendo, p] = await Promise.all([leerEnServicio(conductorId), tareaCorriendo(), permisosActuales()]);
    const r = alIniciar(on, corriendo, p.primerPlano, p.fondo);
    try {
      if (r.accion === "arrancar") await arrancarGps();
      if (r.accion === "parar") await pararGps(conductorId);
    } catch (e) { setError(`No se pudo reanudar el GPS: ${(e as Error).message}`); }
    if (on && r.estado === "fuera") setError("Se ha retirado el permiso de ubicación. Actívalo en Ajustes y vuelve a entrar en servicio.");
    if (r.estado !== "fuera" && desde.current === null) { desde.current = Date.now(); setError(null); }
    if (r.estado === "fuera" && !on) { desde.current = null; setUltimo(null); }
    setEstado(r.estado);
  }, [conductorId]);

  useEffect(() => {
    void sincronizar();
    const s = AppState.addEventListener("change", (e) => { if (e === "active") void sincronizar(); });
    const quitar = alCambiarGps(() => void sincronizar());
    return () => { s.remove(); quitar(); };
  }, [sincronizar]);

  // Solo con la app en primer plano: con el GPS en segundo plano el proceso sigue vivo y el temporizador gastaba batería.
  const [visible, setVisible] = useState(AppState.currentState === "active");
  useEffect(() => {
    const s = AppState.addEventListener("change", (e) => setVisible(e === "active"));
    return () => s.remove();
  }, []);
  useEffect(() => {
    if (estado === "fuera" || !visible) return;
    // El contador «hace Xs» avanza cada segundo, pero el disco (AsyncStorage) solo se lee cada 5 s: la tarea envía cada ≥ 12 s.
    let n = 0;
    const leer = () => void leerUltimoEnvio(conductorId).then(setUltimo, () => undefined);
    leer();
    const t = setInterval(() => { setAhora(Date.now()); if (++n % 5 === 0) leer(); }, 1000);
    return () => clearInterval(t);
  }, [estado, conductorId, visible]);

  const marcar = (v: boolean) => { ocupadoRef.current = v; setOcupado(v); };
  const encender = async () => {
    setError(null);
    marcar(true);
    try {
      const r = await encenderServicio(conductorId, explicar);
      if (r.error) { setError(r.error); return; }
      desde.current = Date.now();
      setEstado(r.estado);
    } finally { marcar(false); }
  };

  const apagar = async () => {
    marcar(true);
    setError(null);
    try {
      const avisado = await apagarServicio(conductorId);
      setEstado("fuera"); setUltimo(null); desde.current = null;
      if (!avisado) setError("No se pudo avisar a la central de «Fuera de servicio». Se dejará de ver tu posición igualmente.");
    } finally { marcar(false); }
  };

  const on = estado !== "fuera";
  const env = estadoEnvio(ahora, ultimo, desde.current);
  return (
    <View style={{ gap: 4 }}>
      <View style={estilos.fila}>
        <Text style={[estilos.etiqueta, { color: on ? "#4ade80" : color.textoTenue }]}>{on ? "En servicio" : "Fuera de servicio"}</Text>
        <Switch value={on} disabled={ocupado} onValueChange={(v) => void (v ? encender() : apagar())}
          accessibilityLabel={on ? "En servicio. Tocar para pasar a fuera de servicio" : "Fuera de servicio. Tocar para entrar en servicio"}
          trackColor={{ true: "#16a34a", false: color.borde }} />
      </View>
      {on && <Text style={[estilos.estado, { color: env.alerta ? color.error : color.textoSuave }]}>{env.texto}</Text>}
      {estado === "solo_primer_plano" && <AvisoSinFondo />}
      {error && <Text accessibilityRole="alert" style={estilos.error}>{error}</Text>}
      {error && !on && <Boton texto="Abrir Ajustes" variante="texto" alto={44} tamano={15} onPress={() => void Linking.openSettings()} />}
      {modal}
    </View>
  );
}

/** Aviso amarillo: con solo «Mientras se usa», con la pantalla bloqueada no se envía la ubicación. */
export function AvisoSinFondo() {
  return (
    <View style={estilos.aviso}>
      <Text style={estilos.avisoTexto}>⚠️ {AVISO_SIN_FONDO}. Permite la ubicación «Siempre».</Text>
      <Boton texto="Abrir Ajustes" variante="secundario" alto={44} tamano={16} onPress={() => void Linking.openSettings()} />
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: "row", alignItems: "center", gap: 8 },
  etiqueta: { fontSize: 16, fontWeight: "700" },
  estado: { fontSize: 14 },
  aviso: { backgroundColor: "#422006", borderColor: "#facc15", borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  avisoTexto: { color: "#fde047", fontSize: 15, fontWeight: "600" },
  error: { color: color.error, fontSize: 14 },
  velo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  dialogo: { backgroundColor: color.tarjeta, borderColor: color.borde, borderWidth: 1, borderRadius: 16, padding: 20, gap: 14 },
  titulo: { color: color.marcaClaro, fontSize: 22, fontWeight: "700" },
  cuerpo: { color: color.texto, fontSize: 17, lineHeight: 24 },
});
