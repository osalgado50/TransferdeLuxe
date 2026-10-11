import type { AccionPendiente } from "@/lib/offline/cola";
import { confirmacionDistancia, DESHACER, formatoCuentaAtras, preguntaDeshacer, restanteDeshacerMs, type EventoPaso, type PasoConductor } from "@dominio/deshacer";
import { ACCION_SIGUIENTE_CONDUCTOR } from "@dominio/estados";
import type { TipoObjetivo } from "@dominio/navegacion";
import type { EstadoServicio } from "@dominio/tipos";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Aviso, Boton } from "./ui";
import { nuevoIdAccion } from "~/lib/acciones";
import { avisar, colaDe, drenar, type Compartida } from "~/lib/cola";
import { color } from "~/lib/tema";

type Accion = AccionPendiente["accion"];
const SIGUIENTE: Record<PasoConductor, EstadoServicio> = { salir: "en_camino", cargar: "recogido", descargar: "completado" };

const confirmar = (titulo: string, texto: string, si: string) => new Promise<boolean>((ok) => {
  Alert.alert(titulo, texto, [{ text: "No", style: "cancel", onPress: () => ok(false) }, { text: si, onPress: () => ok(true) }],
    { cancelable: true, onDismiss: () => ok(false) });
});

/**
 * Botón del siguiente paso con cola offline: optimista, un toque a la vez, y el servidor manda si rechaza.
 * Tras cada paso, «↩ Deshacer» durante 10 min (misma cola offline; el servidor comprueba la ventana).
 */
export function BotonPaso({ servicioId, conductorId, estadoServidor, siguienteId, alCambiar, resaltar, ultimoPaso, distancia }: {
  servicioId: string; conductorId: string; estadoServidor: EstadoServicio; siguienteId: string | null; alCambiar: () => void;
  /** Ha llegado al objetivo: el botón del paso se destaca. */
  resaltar?: boolean;
  /** Último evento de acción del servicio según el servidor (cuenta atrás de «Deshacer»). */
  ultimoPaso?: EventoPaso | null;
  /** Distancia GPS al objetivo de la navegación: CARGA/DESCARGA a más de 300 m piden confirmación. */
  distancia?: { tipo: TipoObjetivo; distanciaM: number } | null;
}) {
  const [c, setC] = useState<Compartida | null>(null);
  const [estado, setEstado] = useState<EstadoServicio>(estadoServidor);
  const [, forzar] = useState(0);
  const [local, setLocal] = useState<{ estado: EstadoServicio; en: number } | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const servidor = useRef(estadoServidor);
  servidor.current = estadoServidor;
  const cb = useRef(alCambiar);
  useEffect(() => { cb.current = alCambiar; });

  useEffect(() => { let v = true; void colaDe(conductorId).then((x) => { if (v) setC(x); }); return () => { v = false; }; }, [conductorId]);
  const mias = () => c?.cola.pendientes().filter((p) => p.servicioId === servicioId) ?? [];
  // El estado del servidor manda: si no hay nada pendiente, seguirlo siempre.
  useEffect(() => { if (c && mias().length === 0) setEstado(estadoServidor); }, [estadoServidor, c]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!c) return;
    const f = () => {
      forzar((n) => n + 1);
      if (c.cola.pendientes().every((p) => p.servicioId !== servicioId)) {
        if (c.rechazos.has(servicioId)) setEstado(servidor.current); // rechazado: deshacer lo optimista
        cb.current(); // sincroniza con el servidor
      }
    };
    c.oyentes.add(f);
    return () => { c.oyentes.delete(f); };
  }, [c, servicioId]);

  const pendientes = mias().length;
  const atascada = mias().find((p) => (p.intentos ?? 0) >= 3);
  const errores = c?.rechazos.get(servicioId) ?? [];
  const avisoPendiente = pendientes > 0 && <Aviso tipo="pendiente" texto={`⏳ Pendiente de enviar (${pendientes})`} />;

  // «Deshacer»: hora local si el paso se hizo aquí; si no, el evento del servidor (si sigue en ese estado).
  const info = DESHACER[estado];
  const ultimo: EventoPaso | null = info && local?.estado === estado
    ? { tipo: info.evento, actor_id: conductorId, creado_en: new Date(local.en).toISOString() }
    : estado === estadoServidor ? (ultimoPaso ?? null) : null;
  const restante = restanteDeshacerMs(estado, ultimo, conductorId, new Date(ahora));
  const yaDeshaciendo = mias().some((p) => p.accion === "deshacer");
  const hayVentana = !!c && restante != null && !yaDeshaciendo;
  useEffect(() => {
    if (!hayVentana) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hayVentana]);
  const encolar = (accion: Accion, nuevo: EstadoServicio) => {
    if (!c) return;
    c.rechazos.delete(servicioId);
    c.cola.encolar({ idAccion: nuevoIdAccion(), servicioId, accion });
    setEstado(nuevo); // optimista
    void drenar(conductorId, true).catch(() => {}); // gesto del usuario: intenta ya
  };
  const deshacer = async () => {
    const pregunta = preguntaDeshacer(estado);
    if (!c || !info || !pregunta || yaDeshaciendo) return;
    if (!(await confirmar("Deshacer", pregunta, "Sí, deshacer"))) return;
    setLocal(null);
    encolar("deshacer", info.hacia);
  };
  const botonDeshacer = hayVentana && restante != null && (
    <Boton variante="secundario" alto={56} tamano={17} onPress={() => void deshacer()} etiqueta={`Deshacer ${info?.nombre ?? "último paso"}`}
      texto={`↩ Deshacer ${info?.nombre ?? ""} (quedan ${formatoCuentaAtras(restante)})`} />
  );
  const listaErrores = errores.map((e, i) => <Aviso key={i} tipo="error" texto={e} />);

  if (estado === "completado") {
    return (
      <View style={estilos.caja}>
        <Text style={estilos.terminado}>¡Servicio terminado!</Text>
        <Boton texto={siguienteId ? "Siguiente servicio de hoy" : "Volver a Hoy"}
          onPress={() => (siguienteId ? router.replace(`/servicio/${siguienteId}`) : router.dismissTo("/"))} />
        {botonDeshacer}
        {avisoPendiente}
        {listaErrores}
      </View>
    );
  }
  const paso = ACCION_SIGUIENTE_CONDUCTOR[estado];
  const pulsar = async () => {
    if (!c || !paso || mias().length > 0) return; // un toque a la vez: evita saltarse un paso
    const accion = paso.accion as PasoConductor;
    // ¿Toque sin querer? CARGA/DESCARGA a más de 300 m del objetivo (según el GPS) piden confirmación.
    const aviso = confirmacionDistancia(accion, distancia);
    if (aviso && !(await confirmar(accion === "descargar" ? "¿Finalizar el servicio?" : "¿Pasajeros a bordo?", aviso, "Sí"))) return;
    if (mias().length > 0) return;
    const t = Date.now();
    setLocal({ estado: SIGUIENTE[accion], en: t });
    setAhora(t);
    encolar(accion, SIGUIENTE[accion]);
  };
  const descartar = () => {
    if (!c || !atascada) return;
    c.cola.descartar(atascada.idAccion);
    setEstado(servidor.current);
    avisar(c);
  };
  return (
    <View style={estilos.caja}>
      {paso && <Boton texto={paso.etiqueta} alto={72} tamano={20} deshabilitado={!c || pendientes > 0} onPress={() => void pulsar()}
        variante={resaltar ? "exito" : "primario"} estilo={resaltar ? estilos.resaltado : undefined} />}
      {avisoPendiente}
      {atascada && (
        <Boton variante="peligro" alto={52} tamano={15} onPress={descartar}
          texto={`Descartar (no se pudo enviar tras ${atascada.intentos} intentos)`} />
      )}
      {botonDeshacer}
      {listaErrores}
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: { gap: 10 },
  resaltado: { borderWidth: 3, borderColor: color.texto },
  terminado: { color: "#34d399", fontSize: 22, fontWeight: "800", textAlign: "center" },
});
