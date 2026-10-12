import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  acumuladoDelDia, admiteZonas, esIncidenciaGrave, nombreTipoIncidencia, validarIncidencia, validarZonasIncidencia,
} from "@/lib/dominio/incidencias";
import { construirActividad } from "@/lib/dominio/actividad";
import { construirAvisos } from "@/lib/dominio/avisosCentral";
import { sonidoDeAviso } from "@/lib/dominio/sonidoPush";
import { esquemaZonasIncidencia } from "@/lib/conductor/modulos";
import { gravedadCierre, tecnicoInicial } from "@/lib/dominio/cierre";

const yo = "11111111-1111-4111-8111-111111111111";

describe("incidencias con parte de golpes", () => {
  it("golpe y accidente admiten zonas; golpe, accidente y avería son graves", () => {
    expect(admiteZonas("golpe")).toBe(true);
    expect(admiteZonas("accidente")).toBe(true);
    expect(admiteZonas("averia")).toBe(false);
    expect(["averia", "accidente", "golpe"].every(esIncidenciaGrave)).toBe(true);
    expect(esIncidenciaGrave("retraso")).toBe(false);
    expect(nombreTipoIncidencia("golpe")).toBe("Golpe");
  });

  it("valida las zonas contra el diagrama (sin repetir y en orden); fuera de accidente/golpe se ignoran", () => {
    expect(validarZonasIncidencia("golpe", ["aleta_tras_der", "puerta_del_izq", "puerta_del_izq"])).toEqual({ ok: true, zonas: ["puerta_del_izq", "aleta_tras_der"] });
    expect(validarZonasIncidencia("golpe", ["ala_delta"]).ok).toBe(false);
    expect(validarZonasIncidencia("golpe", "capo").ok).toBe(false);
    expect(validarZonasIncidencia("golpe", undefined)).toEqual({ ok: true, zonas: [] });
    expect(validarZonasIncidencia("retraso", ["capo"])).toEqual({ ok: true, zonas: [] });
  });

  it("validarIncidencia: golpe con zonas sin descripción vale; golpe vacío no; apps antiguas sin zonas siguen valiendo", () => {
    const r = validarIncidencia({ tipo: "golpe", zonas: ["capo", "faro_izq"] }, yo);
    expect(r.ok && r.datos.zonas).toEqual(["faro_izq", "capo"]);
    expect(validarIncidencia({ tipo: "golpe" }, yo)).toMatchObject({ ok: false });
    expect(validarIncidencia({ tipo: "golpe", descripcion: "Roce en el aparcamiento" }, yo).ok).toBe(true);
    expect(validarIncidencia({ tipo: "accidente", zonas: ["capo"] }, yo)).toMatchObject({ ok: false, error: "Describe brevemente lo ocurrido." });
    const vieja = validarIncidencia({ tipo: "accidente", descripcion: "Alcance" }, yo);
    expect(vieja.ok && vieja.datos.zonas).toEqual([]);
    expect(validarIncidencia({ tipo: "golpe", zonas: ["capo", "nada"] }, yo).ok).toBe(false);
  });

  it("servidor (zod): lista de ids válidos, opcional", () => {
    expect(esquemaZonasIncidencia.safeParse(undefined).success).toBe(true);
    expect(esquemaZonasIncidencia.safeParse(null).success).toBe(true);
    expect(esquemaZonasIncidencia.safeParse(["capo", "porton"]).success).toBe(true);
    expect(esquemaZonasIncidencia.safeParse(["capo", "x"]).success).toBe(false);
    expect(esquemaZonasIncidencia.safeParse("capo").success).toBe(false);
  });

  it("precarga de la hoja de cierre: zonas de accidentes y golpes del día, y resumen en orden", () => {
    const hora = (iso: string) => iso.slice(11, 16);
    const a = acumuladoDelDia([
      { tipo: "averia", zonas: [], creado_en: "2026-10-12T12:05:00Z" },
      { tipo: "golpe", zonas: ["puerta_del_izq", "aleta_tras_der"], creado_en: "2026-10-12T10:42:00Z" },
      { tipo: "accidente", zonas: ["capo", "puerta_del_izq"], creado_en: "2026-10-12T11:00:00Z" },
      { tipo: "retraso", zonas: ["techo"], creado_en: "2026-10-12T09:00:00Z" },
    ], hora);
    expect(a.zonas).toEqual(["capo", "puerta_del_izq", "aleta_tras_der"]);
    expect(a.resumen).toEqual(["Retraso 09:00", "Golpe 10:42 (2 zonas)", "Accidente 11:00 (2 zonas)", "Avería 12:05"]);
    expect(acumuladoDelDia([], hora)).toEqual({ zonas: [], resumen: [] });
    // Con zonas precargadas, la hoja de cierre sale grave.
    expect(gravedadCierre({ zonas: a.zonas, tecnico: tecnicoInicial(), combustible: "lleno" })).toBe("grave");
  });

  it("central: actividad «⚠ GOLPE · Marc · zona · daños», grave pendiente con zonas; push con alarma", () => {
    const inc = { id: "g1", conductor_id: "c1", servicio_id: null, tipo: "golpe", descripcion: "", lat: 41.156, lng: 1.107,
      creado_en: "2026-10-11T12:30:00Z", resuelta: false, zonas: ["aleta_tras_der", "puerta_del_izq"] };
    const r = construirActividad({ servicios: [], conductores: [{ id: "c1", nombre: "Marc" }], incidencias: [inc] });
    expect(r.movimientos[0]).toMatchObject({
      texto: "⚠ GOLPE · Marc · en Reus · Puerta del. izq., Aleta tras. der.", gravedad: "grave", pendiente: true,
      zonasDanadas: ["puerta_del_izq", "aleta_tras_der"],
    });
    expect(r.graves.map((g) => g.id)).toEqual(["inc-g1"]);
    const av = construirAvisos({ eventos: [], incidencias: [inc], revisiones: [], servicios: new Map(), nombres: new Map([["c1", "Marc"]]), matriculas: new Map() });
    expect(av[0]).toMatchObject({ titulo: "⚠ GOLPE · Marc · en Reus", cuerpo: "Daños: Puerta del. izq., Aleta tras. der.", data: { grave: true } });
    expect(sonidoDeAviso(av[0].data)).toBe("alarma");
    expect(sonidoDeAviso({ tipo: "golpe" })).toBe("alarma");
  });
});
