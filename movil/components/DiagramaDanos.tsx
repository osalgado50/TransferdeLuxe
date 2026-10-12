// Diagrama de daños del vehículo visto desde arriba (DELANTERA arriba; la izquierda del coche a la izquierda): Views absolutas
// escaladas al ancho disponible (sin react-native-svg). Lo usan la hoja de cierre y el parte de golpes de las incidencias.
import { ALTO_DIAGRAMA, ANCHO_DIAGRAMA, ZONAS_VEHICULO } from "@dominio/cierre";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

const ROJO = "#dc2626";
/** Zonas pequeñas en los bordes: área táctil extra hacia fuera (no pisa otras zonas). */
const HOLGURA: Record<string, { top?: number; bottom?: number }> = {
  faro_izq: { top: 10 }, faro_der: { top: 10 }, parachoques_del: { top: 10 },
  piloto_izq: { bottom: 10 }, piloto_der: { bottom: 10 }, parachoques_tras: { bottom: 10 },
  retrovisor_izq: { bottom: 10 }, retrovisor_der: { bottom: 10 },
};

/** Diagrama del coche (DELANTERA arriba, la izquierda del coche a la izquierda). Fondo gris claro; marcada = rojo con texto blanco. */
export function DiagramaDanos({ zonas, alAlternar, ancho, laterales = true }: { zonas: readonly string[]; alAlternar?: (id: string) => void; ancho: number; laterales?: boolean }) {
  const k = ancho / ANCHO_DIAGRAMA;
  const alto = ALTO_DIAGRAMA * k;
  const marcadas = new Set(zonas);
  const lateral = (texto: string, giro: string) => (
    <View style={{ width: 16, height: alto }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text style={[e.rotulo, { position: "absolute", width: alto, left: 8 - alto / 2, top: alto / 2 - 8, transform: [{ rotate: giro }] }]}>{texto}</Text>
    </View>
  );
  return (
    <View style={e.diagrama}>
      {laterales ? <Text style={e.rotulo} importantForAccessibility="no">DELANTERA</Text> : (
        // Pantallas estrechas: los rótulos laterales van arriba para que las zonas sean más grandes.
        <View style={{ width: ancho, flexDirection: "row", justifyContent: "space-between" }} importantForAccessibility="no-hide-descendants">
          <Text style={e.rotulo}>◀ IZQ.</Text><Text style={e.rotulo}>DELANTERA</Text><Text style={e.rotulo}>DER. ▶</Text>
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {laterales && lateral("IZQUIERDA", "-90deg")}
        <View style={{ width: ancho, height: alto }}>
          {ZONAS_VEHICULO.map((z) => {
            const on = marcadas.has(z.id);
            const fondo = on ? ROJO : z.tipo === "rueda" ? "#64748b" : z.tipo === "cristal" ? "#e0f2fe" : "#ffffff";
            const borde = on ? "#991b1b" : z.tipo === "rueda" ? "#475569" : z.tipo === "cristal" ? "#7dd3fc" : "#cbd5e1";
            const tinta = on || z.tipo === "rueda" ? "#ffffff" : "#334155";
            const radio = z.tipo === "luz" ? Math.min(z.w, z.h) * k / 2 : z.tipo === "rueda" ? 12 : 9;
            return (
              <Pressable key={z.id} disabled={!alAlternar} hitSlop={HOLGURA[z.id]}
                onPress={() => { void Haptics.selectionAsync().catch(() => undefined); alAlternar?.(z.id); }}
                accessibilityRole="button" accessibilityLabel={z.etiqueta} accessibilityState={{ selected: on }}
                accessibilityHint={alAlternar ? (on ? "Toca para quitar el daño" : "Toca para marcarla como dañada hoy") : undefined}
                style={({ pressed }) => [e.zona, {
                  left: z.x * k, top: z.y * k, width: z.w * k, height: z.h * k, backgroundColor: fondo, borderColor: borde, borderRadius: radio,
                }, pressed && { opacity: 0.7 }]}>
                <Text style={[e.zonaTexto, { color: tinta, fontWeight: on ? "800" : "600" }]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>{z.corta ?? z.etiqueta}</Text>
              </Pressable>
            );
          })}
        </View>
        {laterales && lateral("DERECHA", "90deg")}
      </View>
      <Text style={e.rotulo} importantForAccessibility="no">TRASERA</Text>
    </View>
  );
}

/** Ancho del diagrama: márgenes de la pantalla (`margen`) y, si cabe, rótulos laterales. Zonas ≥ 40 pt donde se pueda. */
export function useAnchoDiagrama(margen = 32): { ancho: number; laterales: boolean } {
  const { width } = useWindowDimensions();
  const laterales = width >= 400;
  return { ancho: Math.min(width - margen - (laterales ? 40 : 0), 420), laterales };
}

const e = StyleSheet.create({
  diagrama: { backgroundColor: "#e2e8f0", borderRadius: 16, padding: 4, alignItems: "center", gap: 2 },
  rotulo: { color: "#475569", fontSize: 11, fontWeight: "800", letterSpacing: 2, textAlign: "center" },
  zona: { position: "absolute", borderWidth: 1.5, alignItems: "center", justifyContent: "center", padding: 2, overflow: "hidden" },
  zonaTexto: { fontSize: 11, textAlign: "center", lineHeight: 13 },
});
