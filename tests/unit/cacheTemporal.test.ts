import { describe, expect, it } from "vitest";
import { crearCacheTemporal } from "@/lib/cacheTemporal";

describe("crearCacheTemporal", () => {
  it("guarda y caduca a los ttlMs", () => {
    let t = 0;
    const c = crearCacheTemporal<string[]>({ max: 10, ttlMs: 1000, ahora: () => t });
    c.set("salou", ["Salou"]);
    t = 999;
    expect(c.get("salou")).toEqual(["Salou"]);
    t = 1000;
    expect(c.get("salou")).toBeUndefined();
    expect(c.size).toBe(0);
  });
  it("expulsa la menos usada al pasar de max", () => {
    const c = crearCacheTemporal<number>({ max: 2, ttlMs: 60_000 });
    c.set("a", 1); c.set("b", 2);
    expect(c.get("a")).toBe(1); // «a» pasa a ser la más reciente
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
    expect(c.get("c")).toBe(3);
    expect(c.size).toBe(2);
  });
});
