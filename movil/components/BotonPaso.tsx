import type { AccionPendiente } from "@/lib/offline/cola";
import { ACCION_SIGUIENTE_CONDUCTOR } from "@dominio/estados";
import type { EstadoServicio } from "@dominio/tipos";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Aviso, Boton } from "./ui";
import { nuevoIdAccion } from "~/lib/acciones";
import { avisar, colaDe, drenar, type Compartida } from "~/lib/cola";
import { color } from "~/lib/tema";

type Paso = AccionPendiente["accion"];
const SIGUIENTE: Record<Paso, EstadoServicio> = { salir: "en_camino", cargar: "recogido", descargar: "completado" };

/** Botón del siguiente paso con cola offline: optimista, un toque a la vez, y el servidor manda si rechaza. */
export function BotonPaso({ servicioId, conductorId, estadoServidor, siguienteId, alCambiar }: {
  servicioId: string; conductorId: string; estadoServidor: EstadoServicio; siguienteId: string | null; alCambiar: () => void;
}) {
  const [c, setC] = useState<Compartida | null>(null);
  const [estado, setEstado] = useState<EstadoServicio>(estadoServidor);
  const [, forzar] = useState(0);
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

  if (estado === "completado") {
    return (
      <View style={estilos.caja}>
        <Text style={estilos.terminado}>¡Servicio terminado!</Text>
        <Boton texto={siguienteId ? "Siguiente servicio de hoy" : "Volver a Hoy"}
          onPress={() => (siguienteId ? router.replace(`/servicio/${siguienteId}`) : router.dismissTo("/"))} />
        {avisoPendiente}
      </View>
    );
  }
  const paso = ACCION_SIGUIENTE_CONDUCTOR[estado];
  const pulsar = () => {
    if (!c || !paso || mias().length > 0) return; // un toque a la vez: evita saltarse un paso
    const accion = paso.accion as Paso;
    c.rechazos.delete(servicioId);
    c.cola.encolar({ idAccion: nuevoIdAccion(), servicioId, accion });
    setEstado(SIGUIENTE[accion]); // optimista
    void drenar(conductorId).catch(() => {});
  };
  const descartar = () => {
    if (!c || !atascada) return;
    c.cola.descartar(atascada.idAccion);
    setEstado(servidor.current);
    avisar(c);
  };
  return (
    <View style={estilos.caja}>
      {paso && <Boton texto={paso.etiqueta} alto={72} tamano={20} deshabilitado={!c || pendientes > 0} onPress={pulsar} />}
      {avisoPendiente}
      {atascada && (
        <Boton variante="peligro" alto={52} tamano={15} onPress={descartar}
          texto={`Descartar (no se pudo enviar tras ${atascada.intentos} intentos)`} />
      )}
      {errores.map((e, i) => <Aviso key={i} tipo="error" texto={e} />)}
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: { gap: 10 },
  terminado: { color: "#34d399", fontSize: 22, fontWeight: "800", textAlign: "center" },
});
