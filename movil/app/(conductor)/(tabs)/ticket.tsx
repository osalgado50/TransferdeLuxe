import { useEffect, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { llamarApi } from "~/lib/api";
import { color } from "~/lib/tema";
import { Aviso, Boton, Tarjeta } from "~/components/ui";

const COMBUSTIBLES = ["Diésel", "Gasolina 95", "Gasolina 98", "Eléctrico", "Otro"];
const hoyMadrid = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
const num = (s: string) => Number(s.trim().replace(",", "."));
type Foto = { uri: string; estado: "subiendo" | "ok" | "error"; path?: string; error?: string };
type Campo = "fecha" | "gasolinera" | "litros" | "precio" | "importe" | "combustible" | "km";
type DatosLeidos = { fecha: string | null; gasolinera: string | null; litros: number | null; precio_litro: number | null; importe: number | null; tipo_combustible: string | null; avisos?: string[] };
type Referencia = { min: number; max: number; medio: number; fuente: string };
type Lectura = { estado: "leyendo" } | { estado: "ok"; campos: number; avisos: string[] } | { estado: "nada" };
const coma = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
const fmtKm = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const SALTO_RARO_KM = 3000; // más que esto desde el último registro: ¿seguro?
/** Aviso de km: menos que los últimos del coche (no se puede guardar) o un salto muy grande (¿seguro?). */
function avisoKm(km: string, fecha: string, ultimo: { matricula: string; km: number } | null): { texto: string; error: boolean } | null {
  if (!ultimo || !/^\d+$/.test(km.trim())) return null;
  const n = Number(km.trim());
  const reciente = fecha.trim() >= new Date(Date.now() - 2 * 86400e3).toISOString().slice(0, 10);
  if (reciente && n < ultimo.km) return { texto: `Son menos km que los últimos registrados de ${ultimo.matricula} (${fmtKm(ultimo.km)} km): el cuentakilómetros no baja.`, error: true };
  if (n - ultimo.km > SALTO_RARO_KM) return { texto: `Son ${fmtKm(n - ultimo.km)} km más que el último registro (${fmtKm(ultimo.km)} km): ¿seguro?`, error: false };
  return null;
}
const euros = (n: number) => n.toFixed(3).replace(/0$/, "").replace(".", ",");
/** Aviso si el €/L escrito no parece un precio por litro (p. ej. 1287 sin coma). */
function precioRaro(precio: string, ref: Referencia | null): string | null {
  const p = num(precio);
  if (!precio.trim() || !Number.isFinite(p) || p <= 0) return null;
  const min = (ref?.min ?? 0.9) * 0.75, max = (ref?.max ?? 2.6) * 1.25;
  if (p >= min && p <= max) return null;
  const arreglo = [10, 100, 1000, 10000].map((d) => p / d).find((x) => x >= min && x <= max);
  return `${coma(p)} €/L no parece un precio por litro${arreglo ? `: ¿${euros(arreglo)}?` : "."}`;
}
const VACIO = { fecha: "", gasolinera: "", litros: "", precio: "", importe: "", combustible: "", km: "" };

/** Misma tolerancia que esCoherente de la web (litros × €/L ≈ importe). */
function incoherente(litros: string, precio: string, importe: string): boolean {
  const l = num(litros), p = num(precio), i = num(importe);
  if (!litros.trim() || !precio.trim() || !importe.trim() || [l, p, i].some((x) => !Number.isFinite(x))) return false;
  return Math.abs(l * p - i) > Math.max(0.1, i * 0.02);
}

export default function Ticket() {
  const [v, setV] = useState({ ...VACIO, fecha: hoyMadrid() });
  const [foto, setFoto] = useState<Foto | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [referencia, setReferencia] = useState<Referencia | null>(null);
  const [ultimoKm, setUltimoKm] = useState<{ matricula: string; km: number } | null>(null);
  // Últimos km del coche del conductor (para avisar antes de guardar). Sin red: sin aviso, el servidor valida igual.
  useEffect(() => {
    let vivo = true;
    void llamarApi("/api/conductor/ticket").then((r) => (r.ok ? r.json() : null)).then((j: { vehiculo?: { matricula: string; km: number } | null } | null) => {
      if (vivo && j?.vehiculo) setUltimoKm(j.vehiculo);
    }).catch(() => undefined);
    return () => { vivo = false; };
  }, []);
  // Campos que el conductor ya ha tocado: la lectura del ticket no los pisa.
  const tocados = useRef(new Set<Campo>());
  const set = (k: Campo) => (t: string) => { tocados.current.add(k); setV((a) => ({ ...a, [k]: t })); setResultado(null); };

  /** OCR libre en el servidor (el mismo motor que la web): rellena lo que no haya escrito ya el conductor. */
  async function leerTicket(path: string) {
    setLectura({ estado: "leyendo" });
    try {
      const r = await llamarApi("/api/conductor/ticket/leer", { method: "POST", body: { fotoPath: path }, tiempoMs: 65_000 });
      const j = (await r.json().catch(() => ({}))) as { datos?: DatosLeidos; referencia?: Referencia };
      const d = r.ok ? j.datos : undefined;
      if (r.ok && j.referencia) setReferencia(j.referencia);
      if (!d) { setLectura({ estado: "nada" }); return; }
      const leidos: Partial<Record<Campo, string>> = {
        fecha: d.fecha ?? "", gasolinera: d.gasolinera ?? "", litros: coma(d.litros), precio: coma(d.precio_litro), importe: coma(d.importe),
        combustible: d.tipo_combustible && COMBUSTIBLES.includes(d.tipo_combustible) ? d.tipo_combustible : "",
      };
      const aplicar = (Object.entries(leidos) as [Campo, string][]).filter(([k, x]) => x && !tocados.current.has(k));
      setV((a) => ({ ...a, ...Object.fromEntries(aplicar) }));
      setLectura(aplicar.length ? { estado: "ok", campos: aplicar.length, avisos: d.avisos ?? [] } : { estado: "nada" });
    } catch {
      setLectura({ estado: "nada" });
    }
  }

  async function subir(uri: string) {
    setFoto({ uri, estado: "subiendo" });
    try {
      let m: ImageManipulator.ImageResult;
      try { m = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }); }
      catch { setFoto({ uri, estado: "error", error: "No se pudo preparar la foto. Prueba con otra." }); return; }
      // JSON con base64 (no multipart: el proxy del servidor estropea las subidas troceadas del iPhone).
      const r = await llamarApi("/api/conductor/ticket/foto", { method: "POST", body: { foto_base64: m.base64 } });
      const j = (await r.json().catch(() => ({}))) as { fotoPath?: string; error?: string };
      if (!r.ok || !j.fotoPath) { setFoto({ uri: m.uri, estado: "error", error: j.error ?? "No se pudo subir la foto" }); return; }
      setFoto({ uri: m.uri, estado: "ok", path: j.fotoPath });
      void leerTicket(j.fotoPath);
    } catch {
      setFoto({ uri, estado: "error", error: "Sin conexión: no se pudo subir la foto. Reinténtalo." });
    }
  }

  async function elegir(camara: boolean) {
    const permiso = camara ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) { setResultado({ ok: false, texto: camara ? "Permite el acceso a la cámara en los ajustes del móvil." : "Permite el acceso a las fotos en los ajustes del móvil." }); return; }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7, allowsEditing: false };
    const r = camara ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled && r.assets[0]) { setResultado(null); void subir(r.assets[0].uri); }
  }

  async function guardar() {
    const e: string[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.fecha.trim())) e.push("La fecha debe tener el formato AAAA-MM-DD.");
    else if (new Date(`${v.fecha.trim()}T00:00:00Z`).getTime() > Date.now() + 86400e3) e.push("La fecha no puede ser futura.");
    if (!(num(v.litros) > 0) || !v.litros.trim()) e.push("Indica los litros (mayor que 0).");
    if (!(num(v.importe) > 0) || !v.importe.trim()) e.push("Indica el importe (mayor que 0).");
    if (v.precio.trim() && !(num(v.precio) > 0)) e.push("El precio por litro debe ser mayor que 0.");
    if (!/^\d+$/.test(v.km.trim())) e.push("Indica los kilómetros del cuentakilómetros (número entero).");
    const ak = avisoKm(v.km, v.fecha, ultimoKm);
    if (ak?.error) e.push(ak.texto);
    setErrores(e);
    if (e.length) return;
    setGuardando(true); setResultado(null);
    try {
      const r = await llamarApi("/api/conductor/ticket", { method: "POST", body: {
        fecha: v.fecha.trim(), gasolinera: v.gasolinera, litros: num(v.litros), precio_litro: v.precio.trim() ? num(v.precio) : null,
        importe: num(v.importe), tipo_combustible: v.combustible, km: Number(v.km.trim()), foto_path: foto?.estado === "ok" ? foto.path : null,
      } });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (r.ok) { if (ultimoKm && Number(v.km.trim()) > ultimoKm.km) setUltimoKm({ ...ultimoKm, km: Number(v.km.trim()) }); setResultado({ ok: true, texto: "Ticket guardado" }); setV({ ...VACIO, fecha: hoyMadrid() }); setFoto(null); setLectura(null); setReferencia(null); tocados.current.clear(); }
      else setResultado({ ok: false, texto: j.error ?? "No se pudo guardar el ticket" });
    } catch { setResultado({ ok: false, texto: "Sin conexión: no se pudo guardar. Reinténtalo." }); }
    finally { setGuardando(false); }
  }

  const aviso = incoherente(v.litros, v.precio, v.importe);
  const subiendo = foto?.estado === "subiendo";
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
        <Text style={e.titulo}>Ticket de combustible</Text>
        <Boton texto="📷 Hacer foto" onPress={() => void elegir(true)} deshabilitado={subiendo} alto={72} />
        <Boton texto="Elegir de la galería" variante="secundario" onPress={() => void elegir(false)} deshabilitado={subiendo} />
        {!foto && <Aviso texto="Haz la foto y se rellenan solos la fecha, la gasolinera, los litros, el precio, el importe y el combustible. Los kilómetros, a mano." />}
        {foto && (
          <Tarjeta>
            <Image source={{ uri: foto.uri }} style={e.miniatura} resizeMode="contain" accessibilityLabel="Foto del ticket" />
            {foto.estado === "subiendo" && <Aviso texto="Subiendo foto…" tipo="pendiente" />}
            {foto.estado === "ok" && lectura?.estado === "leyendo" && <Aviso texto="Leyendo el ticket…" tipo="pendiente" />}
            {foto.estado === "ok" && lectura?.estado === "ok" && <Aviso texto={`Datos leídos del ticket (${lectura.campos}): revisa que estén bien y añade los kilómetros.`} />}
            {foto.estado === "ok" && lectura?.estado === "ok" && lectura.avisos.map((a) => <Aviso key={a} texto={a} tipo="pendiente" />)}
            {foto.estado === "ok" && lectura?.estado === "nada" && <Aviso texto="Foto subida. No se han podido leer los datos: rellénalos a mano." tipo="pendiente" />}
            {foto.estado === "ok" && !lectura && <Aviso texto="Foto subida" />}
            {foto.estado === "error" && <>
              <Aviso texto={foto.error ?? "Error al subir"} tipo="error" />
              <Boton texto="Reintentar subida" variante="secundario" alto={48} tamano={16} onPress={() => void subir(foto.uri)} />
            </>}
            <Boton texto="Quitar foto" variante="texto" alto={44} tamano={15} onPress={() => { setFoto(null); setLectura(null); }} />
          </Tarjeta>
        )}
        <Campo etiqueta="Fecha (AAAA-MM-DD)" valor={v.fecha} onChange={set("fecha")} />
        <Campo etiqueta="Gasolinera" valor={v.gasolinera} onChange={set("gasolinera")} />
        <View style={e.fila}>
          <Campo etiqueta="Litros" valor={v.litros} onChange={set("litros")} teclado="decimal-pad" />
          <Campo etiqueta="€/L" valor={v.precio} onChange={set("precio")} teclado="decimal-pad" />
          <Campo etiqueta="Importe €" valor={v.importe} onChange={set("importe")} teclado="decimal-pad" />
        </View>
        {aviso && <Aviso tipo="pendiente" texto="Los litros × precio no cuadran con el importe: revísalo." />}
        {precioRaro(v.precio, referencia) && <Aviso tipo="pendiente" texto={precioRaro(v.precio, referencia)!} />}
        {referencia && <Text style={e.nota}>Precio de hoy ({referencia.fuente}): {euros(referencia.medio)} €/L de media, entre {euros(referencia.min)} y {euros(referencia.max)}.</Text>}
        <Text style={e.etiqueta}>Combustible</Text>
        <View style={e.chips}>
          {COMBUSTIBLES.map((c) => (
            <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: v.combustible === c }}
              onPress={() => set("combustible")(v.combustible === c ? "" : c)}
              style={[e.chip, v.combustible === c && { backgroundColor: color.marca, borderColor: color.marca }]}>
              <Text style={{ color: color.texto, fontSize: 15 }}>{c}</Text>
            </Pressable>
          ))}
        </View>
        <Campo etiqueta="Kilómetros del cuentakilómetros" valor={v.km} onChange={set("km")} teclado="number-pad" />
        {ultimoKm && <Text style={e.nota}>Último registrado de {ultimoKm.matricula}: {fmtKm(ultimoKm.km)} km</Text>}
        {(() => { const a = avisoKm(v.km, v.fecha, ultimoKm); return a ? <Aviso texto={a.texto} tipo={a.error ? "error" : "pendiente"} /> : null; })()}
        {errores.map((m) => <Aviso key={m} texto={m} tipo="error" />)}
        {resultado && <Aviso texto={resultado.texto} tipo={resultado.ok ? "info" : "error"} />}
        <Boton texto={subiendo ? "Subiendo foto…" : lectura?.estado === "leyendo" ? "Leyendo el ticket…" : "Guardar ticket"} onPress={() => void guardar()} cargando={guardando} deshabilitado={subiendo} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Campo({ etiqueta, valor, onChange, teclado }: { etiqueta: string; valor: string; onChange: (t: string) => void; teclado?: "decimal-pad" | "number-pad" }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={e.etiqueta}>{etiqueta}</Text>
      <TextInput value={valor} onChangeText={onChange} keyboardType={teclado} accessibilityLabel={etiqueta}
        placeholderTextColor={color.textoTenue} style={e.input} />
    </View>
  );
}
const e = StyleSheet.create({
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  titulo: { color: color.texto, fontSize: 22, fontWeight: "700" },
  miniatura: { height: 160, width: "100%", borderRadius: 10, backgroundColor: color.fondo },
  fila: { flexDirection: "row", gap: 8 },
  etiqueta: { color: color.textoSuave, fontSize: 14, marginBottom: 4 },
  nota: { color: color.textoSuave, fontSize: 13 },
  input: { backgroundColor: color.tarjeta, borderColor: color.borde, borderWidth: 1, borderRadius: 10, color: color.texto, fontSize: 18, paddingHorizontal: 12, paddingVertical: 12, minHeight: 52 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1.5, borderColor: color.borde, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: "center" },
});
