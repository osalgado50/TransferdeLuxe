import { AVISO_SIN_FONDO, alEncender, alIniciar, type EstadoInterruptor } from "@dominio/gpsNativo";
import { estadoEnvio } from "@dominio/gps";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, StyleSheet, Switch, Text, View } from "react-native";
import { Boton } from "~/components/ui";
import {
  arrancarGps, guardarEnServicio, leerEnServicio, marcarFueraDeServicio, pararGps, pedirFondo, pedirPrimerPlano,
  permisosActuales, tareaCorriendo,
} from "~/lib/gps";
import { leerUltimoEnvio } from "~/lib/gpsTarea";
import { color } from "~/lib/tema";

/** Interruptor «En servicio / Fuera de servicio» de la cabecera + estado del último envío. */
export function InterruptorGps({ conductorId }: { conductorId: string }) {
  const [estado, setEstado] = useState<EstadoInterruptor>("fuera");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explicando, setExplicando] = useState(false);
  const [ultimo, setUltimo] = useState<number | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  const desde = useRef<number | null>(null);

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
    if (r.estado !== "fuera" && desde.current === null) desde.current = Date.now();
    setEstado(r.estado);
  }, [conductorId]);

  useEffect(() => {
    void sincronizar();
    const s = AppState.addEventListener("change", (e) => { if (e === "active") void sincronizar(); });
    return () => s.remove();
  }, [sincronizar]);

  useEffect(() => {
    if (estado === "fuera") return;
    const t = setInterval(() => { setAhora(Date.now()); void leerUltimoEnvio(conductorId).then(setUltimo); }, 1000);
    return () => clearInterval(t);
  }, [estado, conductorId]);

  const marcar = (v: boolean) => { ocupadoRef.current = v; setOcupado(v); };
  const activar = async (pedirSiempre: boolean) => {
    setExplicando(false);
    marcar(true);
    try {
      const actuales = await permisosActuales();
      const fondo = pedirSiempre ? await pedirFondo() : actuales.fondo;
      const r = alEncender(actuales.primerPlano, fondo);
      if (r.error) { setError(r.error); return; }
      await arrancarGps();
      await guardarEnServicio(conductorId, true);
      desde.current = Date.now();
      setEstado(r.estado);
    } catch (e) { setError(`No se pudo arrancar el GPS: ${(e as Error).message}`); }
    finally { marcar(false); }
  };

  const encender = async () => {
    setError(null);
    marcar(true);
    let modal = false; // con el modal abierto sigue «ocupado» hasta que activar() termine
    try {
      const pp = await pedirPrimerPlano(); // iOS exige «Mientras se usa» antes de «Siempre»
      const r0 = alEncender(pp, "undetermined");
      if (r0.error) { setError(r0.error); return; }
      const { fondo } = await permisosActuales();
      if (fondo === "granted") { marcar(false); await activar(false); return; }
      modal = true;
      setExplicando(true); // pantalla explicativa antes del diálogo del sistema
    } finally { if (!modal) marcar(false); }
  };

  const apagar = async () => {
    marcar(true);
    setError(null);
    try {
      await pararGps(conductorId);
      setEstado("fuera"); setUltimo(null); desde.current = null;
      if (!(await marcarFueraDeServicio())) setError("No se pudo avisar a la central de «Fuera de servicio». Se dejará de ver tu posición igualmente.");
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
      {estado === "solo_primer_plano" && (
        <View style={estilos.aviso}>
          <Text style={estilos.avisoTexto}>⚠️ {AVISO_SIN_FONDO}. Permite la ubicación «Siempre».</Text>
          <Boton texto="Abrir Ajustes" variante="secundario" alto={44} tamano={16} onPress={() => void Linking.openSettings()} />
        </View>
      )}
      {error && <Text accessibilityRole="alert" style={estilos.error}>{error}</Text>}
      {error && !on && <Boton texto="Abrir Ajustes" variante="texto" alto={44} tamano={15} onPress={() => void Linking.openSettings()} />}
      <Modal visible={explicando} transparent animationType="fade" onRequestClose={() => void activar(false)}>
        <View style={estilos.velo}>
          <View style={estilos.dialogo}>
            <Text style={estilos.titulo}>Ubicación «Siempre»</Text>
            <Text style={estilos.cuerpo}>
              Para que la central vea dónde estás con la pantalla bloqueada o con otra app abierta (navegador, llamadas),
              en el siguiente aviso elige «Permitir siempre» (en Android: «Permitir todo el tiempo»).
              Solo se envía tu posición mientras estés «En servicio».
            </Text>
            <Boton texto="Continuar" onPress={() => void activar(true)} />
            <Boton texto="Ahora no (solo con la app abierta)" variante="texto" tamano={15} onPress={() => void activar(false)} />
          </View>
        </View>
      </Modal>
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
