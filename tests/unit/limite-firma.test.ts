import { describe, expect, it, vi } from "vitest";
import { clavesActivas, permitir, purgarCaducados } from "@/lib/limite";
import { detectarTipoImagen, extensionDe } from "@/lib/firmaImagen";

describe("permitir / purga", () => {
  it("limita y purga claves caducadas", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    expect(permitir("a", 1, 1000)).toBe(true);
    expect(permitir("a", 1, 1000)).toBe(false);
    permitir("b", 5, 10_000);
    vi.setSystemTime(2000);
    purgarCaducados();
    expect(clavesActivas()).toBe(1); // "b" sigue viva
    expect(permitir("a", 1, 1000)).toBe(true);
    vi.useRealTimers();
  });
  it("la purga automática mantiene el Map acotado", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    for (let i = 0; i < 400; i++) permitir(`x${i}`, 1, 10);
    vi.setSystemTime(200_000);
    for (let i = 0; i < 1100; i++) permitir("y", 1_000_000, 10);
    expect(clavesActivas()).toBeLessThan(10);
    vi.useRealTimers();
  });
});

describe("detectarTipoImagen", () => {
  const b = (...x: number[]) => new Uint8Array(x);
  const s = (t: string) => [...t].map((c) => c.charCodeAt(0));
  it("reconoce JPEG, PNG y WEBP", () => {
    expect(detectarTipoImagen(b(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectarTipoImagen(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toBe("image/png");
    expect(detectarTipoImagen(b(...s("RIFF"), 1, 2, 3, 4, ...s("WEBP")))).toBe("image/webp");
    expect(extensionDe("image/jpeg")).toBe("jpg");
  });
  it("rechaza lo demás", () => {
    expect(detectarTipoImagen(b(...s("<svg ")))).toBeNull();
    expect(detectarTipoImagen(b(...s("RIFF"), 1, 2, 3, 4, ...s("WAVE")))).toBeNull();
    expect(detectarTipoImagen(b(0, 0, 0, 0x18, ...s("ftypheic")))).toBeNull();
    expect(detectarTipoImagen(b())).toBeNull();
  });
});
