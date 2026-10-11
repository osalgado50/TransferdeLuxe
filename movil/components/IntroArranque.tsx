// Entrada animada al abrir la app: el logo aparece grande y se asienta, un destello lo recorre, aparece
// el rótulo «CONDUCTOR» con una línea y todo se funde con la app. Solo en el arranque en frío. Usa la API Animated de React Native
// (sin dependencias nativas nuevas: llega por actualización automática).
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { color } from "~/lib/tema";

let yaMostrada = false; // una vez por arranque (no al volver de segundo plano)

export function IntroArranque({ listo }: { listo: boolean }) {
  const [visible, setVisible] = useState(!yaMostrada);
  const entrada = useRef(new Animated.Value(0)).current; // 0 → 1: aparece y se asienta
  const brillo = useRef(new Animated.Value(0)).current;  // destello que cruza el logo
  const texto = useRef(new Animated.Value(0)).current;
  const salida = useRef(new Animated.Value(1)).current;  // 1 → 0: fundido con la app
  const [animado, setAnimado] = useState(false);

  useEffect(() => {
    if (!visible) return;
    yaMostrada = true;
    // La pantalla nativa se oculta en cuanto esta intro (mismo fondo) está pintada: transición sin saltos.
    void SplashScreen.hideAsync().catch(() => undefined);
    Animated.sequence([
      Animated.timing(entrada, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(brillo, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(texto, { toValue: 1, duration: 600, delay: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.delay(250),
    ]).start(() => setAnimado(true));
  }, [visible, entrada, brillo, texto]);

  // Funde cuando la animación ha terminado Y la app (sesión) está lista.
  useEffect(() => {
    if (!visible || !animado || !listo) return;
    Animated.timing(salida, { toValue: 0, duration: 550, easing: Easing.inOut(Easing.cubic), useNativeDriver: true })
      .start(() => setVisible(false));
  }, [visible, animado, listo, salida]);

  if (!visible) return null;
  const escala = entrada.interpolate({ inputRange: [0, 1], outputRange: [1.35, 1] });
  const escalaSalida = salida.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const desliz = brillo.interpolate({ inputRange: [0, 1], outputRange: [-260, 260] });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, estilos.fondo, { opacity: salida }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={{ alignItems: "center", opacity: entrada, transform: [{ scale: Animated.multiply(escala, escalaSalida) }] }}>
        <View style={estilos.marco}>
          <Image source={require("../assets/images/logo.png")} style={estilos.logo} contentFit="contain" />
          <Animated.View style={[estilos.destello, { transform: [{ translateX: desliz }, { rotate: "20deg" }] }]} />
        </View>
        <Animated.Text style={[estilos.lema, { opacity: texto, transform: [{ translateY: texto.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
          CONDUCTOR
        </Animated.Text>
        <Animated.View style={[estilos.linea, { opacity: texto, transform: [{ scaleX: texto }] }]} />
      </Animated.View>
    </Animated.View>
  );
}

const estilos = StyleSheet.create({
  fondo: { backgroundColor: "#0b1b2e", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  marco: { width: 220, height: 241, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  logo: { width: 220, height: 241 },
  destello: { position: "absolute", top: -60, width: 46, height: 380, backgroundColor: "rgba(255,255,255,0.22)" },
  lema: { marginTop: 18, color: color.marcaClaro, fontSize: 15, fontWeight: "700", letterSpacing: 6 },
  linea: { marginTop: 10, width: 120, height: 2, borderRadius: 1, backgroundColor: color.marcaClaro },
});
