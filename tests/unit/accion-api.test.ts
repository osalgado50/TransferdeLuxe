import { describe, expect, it, vi } from "vitest";
import { crearEnviarAccion, ErrorTransitorio } from "@/lib/offline/accionApi";
import { ColaAcciones } from "@/lib/offline/cola";

const p = { idAccion: "a1", servicioId: "s1", accion: "salir" as const };
const resp = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

function deps(respuestas: (Response | Error)[]) {
  const fetch = vi.fn(async () => { const r = respuestas.shift()!; if (r instanceof Error) throw r; return r; });
  return { apiUrl: "https://x.test/", token: vi.fn(async () => "t1"), refrescar: vi.fn(async () => "t2"), fetch: fetch as unknown as typeof globalThis.fetch };
}

describe("crearEnviarAccion", () => {
  it("envía Bearer y JSON y devuelve ok", async () => {
    const d = deps([resp(200, { ok: true, estado: "en_camino", duplicada: true })]);
    expect(await crearEnviarAccion(d)(p)).toEqual({ ok: true, estado: "en_camino", duplicada: true });
    const [url, init] = (d.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://x.test/api/conductor/accion");
    expect(init.headers.Authorization).toBe("Bearer t1");
    expect(JSON.parse(init.body)).toEqual(p);
  });
  it("401 → refresca y reintenta una vez con el token nuevo", async () => {
    const d = deps([resp(401, { error: "x" }), resp(200, { ok: true, estado: "aceptado" })]);
    expect((await crearEnviarAccion(d)(p)).ok).toBe(true);
    expect(d.refrescar).toHaveBeenCalledOnce();
    const init = (d.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1];
    expect(init.headers.Authorization).toBe("Bearer t2");
  });
  it("401 dos veces, sin token, red, 5xx, 429 o HTML → ErrorTransitorio", async () => {
    await expect(crearEnviarAccion(deps([resp(401, {}), resp(401, {})]))(p)).rejects.toBeInstanceOf(ErrorTransitorio);
    await expect(crearEnviarAccion({ ...deps([]), token: async () => null })(p)).rejects.toBeInstanceOf(ErrorTransitorio);
    await expect(crearEnviarAccion(deps([new TypeError("net")]))(p)).rejects.toBeInstanceOf(ErrorTransitorio);
    await expect(crearEnviarAccion(deps([resp(503, {})]))(p)).rejects.toBeInstanceOf(ErrorTransitorio);
    await expect(crearEnviarAccion(deps([resp(429, { error: "x" })]))(p)).rejects.toBeInstanceOf(ErrorTransitorio);
    await expect(crearEnviarAccion(deps([resp(200, "<html>")]))(p)).rejects.toBeInstanceOf(ErrorTransitorio);
  });
  it("409 ok:false → rechazo de negocio con su mensaje", async () => {
    expect(await crearEnviarAccion(deps([resp(409, { ok: false, error: "Este servicio ya no está asignado a ti" })]))(p))
      .toEqual({ ok: false, error: "Este servicio ya no está asignado a ti" });
    expect(await crearEnviarAccion(deps([resp(400, { error: "Datos no válidos." })]))(p)).toEqual({ ok: false, error: "Datos no válidos." });
  });
});

describe("ColaAcciones + API (app nativa)", () => {
  const almacen = () => { let v: string | null = null; return { get: () => v, set: (x: string) => { v = x; } }; };
  it("conserva en fallo transitorio, quita en ok, descarta y avisa en rechazo", async () => {
    const d = deps([new TypeError("net"), resp(200, { ok: true }), resp(409, { ok: false, error: "No" })]);
    const enviar = crearEnviarAccion(d);
    const rechazos: string[] = [];
    const cola = new ColaAcciones(almacen(), (a) => enviar(a), (_a, e) => rechazos.push(e));
    cola.encolar({ idAccion: "a1", servicioId: "s1", accion: "salir" });
    cola.encolar({ idAccion: "a2", servicioId: "s1", accion: "cargar" });
    expect(await cola.vaciar()).toMatchObject({ enviadas: 0, errores: [] });
    expect(cola.pendientes()[0].intentos).toBe(1);
    expect(await cola.vaciar(true)).toEqual({ enviadas: 1, errores: ["No"] });
    expect(cola.pendientes()).toEqual([]);
    expect(rechazos).toEqual(["No"]);
  });
});
