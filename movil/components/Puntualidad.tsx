import { clasificarRespuesta } from "@dominio/reintento";
import {
  calcularPuntualidad, claveAvisoRetraso, COLOR_PUNTUALIDAD, debeAvisarRetraso, REFRESCO_PUNTUALIDAD_MS, textoAvisoRetraso,
} from "@dominio/puntualidad";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { llamarApi } from "~/lib/api";

/** Reloj de la pantalla: se refresca cada 15 s (solo mientras el contador está montado). */
function useAhora(cadaMs = REFRESCO_PUNTUALIDAD_MS) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), cadaMs); return () => clearInterval(t); }, [cadaMs]);
  return ahora;
}

async function posicion(): Promise<{ lat: number | null; lng: number | null }> {
  try {
    if (!(await Location.getForegroundPermissionsAsync()).granted) return { lat: null, lng: null };
    const p = await Location.getLastKnownPositionAsync();
    return p ? { lat: p.coords.latitude, lng: p.coords.longitude } : { lat: null, lng: null };
  } catch { return { lat: null, lng: null }; }
}

/**
 * Contador GRANDE de puntualidad (verde a tiempo / ámbar justo / rojo tarde) con la ETA del mapa.
 * Si la ETA dice que llegará tarde (antes de la hora), avisa UNA vez a la central con una incidencia «retraso»
 * automática (persistido en AsyncStorage); si falla, como mucho un intento cada 60 s.
 */
export function ContadorPuntualidad({ servicioId, estado, recogida, etaS }: {
  servicioId: string; estado: string; recogida: string; etaS: number | null;
}) {
  const ahora = useAhora();
  const p = calcularPuntualidad({ estado, recogida, ahora, etaS });
  const clave = claveAvisoRetraso(servicioId);
  // null = aún leyendo AsyncStorage (no se envía nada hasta saber si ya se avisó).
  const enviado = useRef<boolean | null>(null);
  const enCurso = useRef(false);
  const ultimo = useRef(0);
  const [avisada, setAvisada] = useState(false);

  useEffect(() => {
    let vivo = true;
    enviado.current = null;
    void AsyncStorage.getItem(clave).then((v) => v, () => null).then((v) => {
      if (!vivo) return;
      enviado.current = !!v;
      setAvisada(!!v);
    });
    return () => { vivo = false; };
  }, [clave]);

  const tarde = p.estado === "tarde" && p.porEta;
  useEffect(() => {
    if (enviado.current === null) return;
    const t = Date.now();
    if (!debeAvisarRetraso(p, { enviado: enviado.current, enCurso: enCurso.current, ultimoIntento: ultimo.current, ahora: t })) return;
    enCurso.current = true; // síncrono: nunca dos envíos a la vez
    ultimo.current = t;
    const descripcion = textoAvisoRetraso(p);
    void (async () => {
      try {
        const { lat, lng } = await posicion();
        const r = await llamarApi("/api/conductor/incidencia", { method: "POST", body: { tipo: "retraso", servicio_id: servicioId, descripcion, lat, lng } });
        if (r.ok) {
          enviado.current = true; setAvisada(true);
          await AsyncStorage.setItem(clave, "1").catch(() => undefined);
        } else if (r.status !== 401 && clasificarRespuesta(r.status, r.headers.get("content-type")) === "ok") {
          enviado.current = true; // rechazo definitivo (módulo desactivado, servicio ajeno…): no se insiste en esta pantalla
        }
      } catch { /* sin red: siguiente intento pasados 60 s */ } finally { enCurso.current = false; }
    })();
  }, [ahora, tarde, clave, servicioId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p.estado) return null;
  const c = COLOR_PUNTUALIDAD[p.estado];
  return (
    <View accessibilityRole={p.estado === "tarde" ? "alert" : "text"} accessibilityLiveRegion="polite"
      style={[estilos.grande, { backgroundColor: c.fondo }]}>
      <Text style={[estilos.grandeTexto, { color: c.texto }]}>{p.texto}</Text>
      {avisada && p.estado === "tarde" && <Text style={[estilos.grandeSub, { color: c.texto }]}>Central avisada del retraso</Text>}
    </View>
  );
}

/** Versión compacta (chip) para la lista de hoy: solo el reloj (sin ETA). */
export function ChipPuntualidad({ estado, recogida }: { estado: string; recogida: string }) {
  const ahora = useAhora();
  const p = calcularPuntualidad({ estado, recogida, ahora });
  if (!p.estado) return null;
  const c = COLOR_PUNTUALIDAD[p.estado];
  return (
    <View style={[estilos.chip, { backgroundColor: c.fondo }]} accessibilityRole="text">
      <Text style={[estilos.chipTexto, { color: c.texto }]} numberOfLines={1}>{p.texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  grande: { borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16, alignItems: "center" },
  grandeTexto: { fontSize: 26, fontWeight: "900", textAlign: "center", fontVariant: ["tabular-nums"] },
  grandeSub: { fontSize: 14, fontWeight: "700", marginTop: 4, opacity: 0.9 },
  chip: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  chipTexto: { fontSize: 15, fontWeight: "800" },
});
