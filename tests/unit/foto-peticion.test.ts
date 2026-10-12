import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { leerFotoDePeticion } from "@/lib/fotoPeticion";

const jpeg = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");
const json = (body: unknown) => new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("leerFotoDePeticion", () => {
  it("JSON con base64 (app nativa): devuelve el fichero con los mismos bytes", async () => {
    const r = await leerFotoDePeticion(json({ foto_base64: jpeg.toString("base64") }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(Buffer.from(await r.foto.arrayBuffer()).equals(jpeg)).toBe(true);
  });
  it("acepta el prefijo data: y rechaza vacío", async () => {
    expect((await leerFotoDePeticion(json({ foto_base64: `data:image/jpeg;base64,${jpeg.toString("base64")}` }))).ok).toBe(true);
    const r = await leerFotoDePeticion(json({}));
    expect(r.ok === false && r.res.status).toBe(400);
  });
  it("multipart sin content-length → 411 (no se lee el cuerpo)", async () => {
    const fd = new FormData(); fd.append("foto", new File([jpeg], "a.jpg"));
    const r = await leerFotoDePeticion(new Request("http://x", { method: "POST", body: fd }));
    expect(r.ok === false && r.res.status).toBe(411);
  });
});
