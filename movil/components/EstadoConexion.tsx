import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { comprobarAhora, useEstadoRed } from "~/lib/red";

/** Aviso discreto cuando el servidor o la base de datos no responden: «… · reintentando en Xs» (tocar = reintentar ya). */
export function EstadoConexion() {
  const red = useEstadoRed();
  const caida = red.api ?? red.supabase;
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    if (!caida) return;
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 1000); // solo mientras se muestra
    return () => clearInterval(t);
  }, [caida]);
  if (!caida) return null;
  const quien = red.api ? "el servidor" : "la base de datos";
  const s = Math.max(0, Math.ceil((caida.proximo - ahora) / 1000));
  return (
    <Pressable onPress={comprobarAhora} accessibilityRole="button" accessibilityLiveRegion="polite" hitSlop={8}
      accessibilityLabel={`Sin conexión con ${quien}. Tocar para reintentar`}>
      <Text style={estilos.texto}>
        ⚠️ Sin conexión con {quien} · {s > 0 ? `reintentando en ${s}s` : "reintentando…"} · tocar para reintentar
      </Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  texto: { color: "#fcd34d", fontSize: 14, fontWeight: "600" },
});
