import { expect, it } from "vitest";
import { esquemaLugarEmpresa, filtrarLugaresEmpresa, sugerenciaEmpresa, type LugarEmpresa } from "@/lib/dominio/lugaresEmpresa";
import { filtrarDirecciones, type Favorito } from "@/lib/dominio/favoritos";

const lugar = (nombre: string, direccion: string, lat: number | null = 41.1): LugarEmpresa =>
  ({ id: nombre, nombre, direccion, lat, lng: lat == null ? null : 1.1, notas: null, telefono: null });
const lista = [lugar("Logística Ejemplo SL", "Polígono Demo 3, Reus"), lugar("Almacén Prueba", "Carrer de la Logística 1, Valls"), lugar("Otro", "Salou")];

it("filtra por nombre sin acentos ni mayúsculas; nombre antes que dirección", () => {
  expect(filtrarLugaresEmpresa(lista, "LOGISTICA").map((l) => l.nombre)).toEqual(["Logística Ejemplo SL", "Almacén Prueba"]);
  expect(filtrarLugaresEmpresa(lista, "almacen").map((l) => l.nombre)).toEqual(["Almacén Prueba"]);
  expect(filtrarLugaresEmpresa(lista, "l")).toEqual([]);
  expect(filtrarLugaresEmpresa(lista, "zzz")).toEqual([]);
});

it("sugerencia 🏢 con el nombre delante", () => {
  expect(sugerenciaEmpresa(lista[0])).toEqual({ etiqueta: "Logística Ejemplo SL · Polígono Demo 3, Reus", lat: 41.1, lng: 1.1, frecuente: true, fuente: "empresa", nombre: "Logística Ejemplo SL" });
});

it("esquema: limpia, opcionales vacíos a null y coordenadas completas", () => {
  const r = esquemaLugarEmpresa.parse({ nombre: "  Logística   Ejemplo SL ", direccion: " Polígono Demo 3 ", lat: "41.1", lng: "1.1", notas: " ", telefono: "" });
  expect(r).toEqual({ nombre: "Logística Ejemplo SL", direccion: "Polígono Demo 3", lat: 41.1, lng: 1.1, notas: null, telefono: null });
  expect(esquemaLugarEmpresa.parse({ nombre: "A", direccion: "B", lat: "", lng: "" }).lat).toBeNull();
  expect(esquemaLugarEmpresa.safeParse({ nombre: "A", direccion: "B", lat: "41", lng: "" }).success).toBe(false);
  expect(esquemaLugarEmpresa.safeParse({ nombre: " ", direccion: "B", lat: "", lng: "" }).success).toBe(false);
  expect(esquemaLugarEmpresa.safeParse({ nombre: "A", direccion: "B", lat: "", lng: "", telefono: "llámame" }).success).toBe(false);
  expect(esquemaLugarEmpresa.parse({ nombre: "A", direccion: "B", lat: "", lng: "", telefono: "+34 600 000 000" }).telefono).toBe("+34 600 000 000");
});

it("favoritos de dirección también sin acentos", () => {
  const fav: Favorito = { id: "1", tipo: "direccion", nombre: "Estación Demo", origen_texto: "Plaça Demo", origen_lat: null, origen_lng: null,
    destino_texto: null, destino_lat: null, destino_lng: null, pasajeros: null, maletas: null, tipo_vehiculo_pedido: null };
  expect(filtrarDirecciones([fav], "estacion")).toHaveLength(1);
});
