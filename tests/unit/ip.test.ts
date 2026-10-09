import { describe, expect, it } from "vitest";
import { ipCliente } from "@/lib/ip";

const h = (o: Record<string, string>) => new Headers(o);
describe("ipCliente", () => {
  it("prefiere x-real-ip", () => expect(ipCliente(h({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1"));
  it("usa la última entrada de x-forwarded-for", () => expect(ipCliente(h({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 3.3.3.3" }))).toBe("3.3.3.3"));
  it("una sola entrada", () => expect(ipCliente(h({ "x-forwarded-for": "4.4.4.4" }))).toBe("4.4.4.4"));
  it("sin cabeceras devuelve local", () => expect(ipCliente(h({}))).toBe("local"));
});
