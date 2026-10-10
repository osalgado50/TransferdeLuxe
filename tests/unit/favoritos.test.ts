import { expect, test } from "vitest";
import {
  esquemaFavoritoDireccion, esquemaFavoritoTrayecto, filtrarDirecciones, leerDireccionForm, tieneCoordenadas, normalizarNombre, trayectoCompleto, type Favorito,
} from "@/lib/dominio/favoritos";

const dir = (nombre: string, texto: string): Favorito => ({
  id: nombre, tipo: "direccion", nombre, origen_texto: texto, origen_lat: 41.1, origen_lng: 1.1,
  destino_texto: null, destino_lat: null, destino_lng: null, pasajeros: null, maletas: null, tipo_vehiculo_pedido: null,
});

test("normaliza el nombre", () => expect(normalizarNombre("  Hotel   Demo  ")).toBe("Hotel Demo"));

test("dirección: nombre obligatorio y coordenadas vacías = null", () => {
  expect(esquemaFavoritoDireccion.safeParse({ nombre: "  ", texto: "x", lat: "", lng: "" }).success).toBe(false);
  const r = esquemaFavoritoDireccion.parse({ nombre: " Hotel ", texto: "Calle Demo 1", lat: "", lng: "" });
  expect(r).toEqual({ nombre: "Hotel", texto: "Calle Demo 1", lat: null, lng: null });
});

test("trayecto: valida pax, maletas y tipo", () => {
  const ok = { nombre: "Reus-PA", origen_texto: "A", origen_lat: "41.1", origen_lng: "1.1", destino_texto: "B", destino_lat: "", destino_lng: "", pasajeros: "3", maletas: "2", tipo_vehiculo_pedido: "sedan" };
  expect(esquemaFavoritoTrayecto.parse(ok).pasajeros).toBe(3);
  expect(esquemaFavoritoTrayecto.safeParse({ ...ok, tipo_vehiculo_pedido: "tanque" }).success).toBe(false);
  expect(esquemaFavoritoTrayecto.safeParse({ ...ok, pasajeros: "40" }).success).toBe(false);
});

test("trayectoCompleto exige origen y destino", () => {
  expect(trayectoCompleto({ origen_texto: "A", destino_texto: " " })).toBe(false);
  expect(trayectoCompleto({ origen_texto: "A", destino_texto: "B" })).toBe(true);
});

test("filtrarDirecciones ignora trayectos y prioriza los que empiezan por el texto", () => {
  const favs = [dir("Hotel Demo Salou", "Calle Falsa 1, Salou"), dir("Mi hotel", "Av. Demo"), { ...dir("Hotel ruta", "x"), tipo: "trayecto" as const }];
  expect(filtrarDirecciones(favs, "hot").map((f) => f.nombre)).toEqual(["Hotel Demo Salou", "Mi hotel"]);
  expect(filtrarDirecciones(favs, "h")).toEqual([]);
});

test("leerDireccionForm lee texto y coordenadas de los inputs", () => {
  const fd = new FormData();
  fd.set("origen_texto", "Aeropuerto de Reus"); fd.set("origen_lat", "41.1474"); fd.set("origen_lng", "1.1672");
  const v = leerDireccionForm(fd, "origen");
  expect(v).toEqual({ texto: "Aeropuerto de Reus", lat: "41.1474", lng: "1.1672" });
  expect(tieneCoordenadas(v)).toBe(true);
  expect(esquemaFavoritoDireccion.parse({ nombre: "x", ...v }).lat).toBe(41.1474);
  expect(tieneCoordenadas(leerDireccionForm(fd, "destino"))).toBe(false);
});
