import { describe, expect, test } from "vitest";
import {
  avisosCentral, avisosDisponibles, enlaceSms, estimacionAviso, enlaceWhatsApp, leerMotivoAviso, mensajeAviso, motivoAviso, nombreDePila, normalizarTelefono,
} from "@/lib/dominio/avisoCliente";

describe("normalizarTelefono (E.164 sin +, España por defecto)", () => {
  test("móviles y fijos españoles sin prefijo → +34", () => {
    expect(normalizarTelefono("600000000")).toBe("34600000000");
    expect(normalizarTelefono("600 00 00 00")).toBe("34600000000");
    expect(normalizarTelefono("977-12-34-56")).toBe("34977123456");
    expect(normalizarTelefono("(600) 000.000")).toBe("34600000000");
  });
  test("con prefijo: +, 00 o 34 delante", () => {
    expect(normalizarTelefono("+34 600 000 000")).toBe("34600000000");
    expect(normalizarTelefono("0034600000000")).toBe("34600000000");
    expect(normalizarTelefono("34600000000")).toBe("34600000000");
    expect(normalizarTelefono("+44 7700 900123")).toBe("447700900123");
    expect(normalizarTelefono("+33 6 12 34 56 78")).toBe("33612345678");
  });
  test("vacío, corto o con letras → null", () => {
    expect(normalizarTelefono("")).toBeNull();
    expect(normalizarTelefono(null)).toBeNull();
    expect(normalizarTelefono("12345")).toBeNull();
    expect(normalizarTelefono("abc600000000")).toBeNull();
    expect(normalizarTelefono("+0 600")).toBeNull();
  });
});

describe("mensajeAviso", () => {
  const d = { cliente: "Lucía Pérez", conductor: "Marc García", hora: "15:42", enlace: "https://app.example/s/abc" };
  test("en camino (es) con ETA y enlace", () => {
    expect(mensajeAviso("en_camino", d)).toBe("Hola Lucía, soy Marc de TVL VIP Transfers. Voy de camino a recogerte; llegada estimada 15:42. Sígueme en directo: https://app.example/s/abc");
  });
  test("en camino sin ETA ni enlace: sin huecos", () => {
    expect(mensajeAviso("en_camino", { cliente: "Lucía", conductor: "Marc" })).toBe("Hola Lucía, soy Marc de TVL VIP Transfers. Voy de camino a recogerte.");
  });
  test("retraso con minutos y hora", () => {
    expect(mensajeAviso("retraso", { ...d, minutos: 8 })).toBe("Hola Lucía, soy Marc de TVL VIP Transfers. Llegaré con unos 8 min de retraso (aprox. 15:42). Disculpa las molestias. https://app.example/s/abc");
    expect(mensajeAviso("retraso", { cliente: "Lucía", conductor: "Marc" })).toBe("Hola Lucía, soy Marc de TVL VIP Transfers. Llegaré con retraso. Disculpa las molestias.");
  });
  test("llegado con vehículo", () => {
    expect(mensajeAviso("llegado", { ...d, modelo: "Mercedes Clase V", matricula: "1234 ABC" }))
      .toBe("Hola Lucía, soy Marc de TVL VIP Transfers. Ya estoy en el punto de recogida. Vehículo Mercedes Clase V · 1234 ABC.");
  });
  test("reasignación", () => {
    expect(mensajeAviso("reasignacion", d)).toBe("Hola Lucía, soy Marc de TVL VIP Transfers. He tenido un imprevisto y no podré hacer tu traslado. La central te asignará otro conductor en breve; te avisaremos.");
  });
  test("en inglés", () => {
    expect(mensajeAviso("en_camino", { ...d, idioma: "en" })).toBe("Hello Lucía, this is Marc from TVL VIP Transfers. I'm on my way to pick you up; estimated arrival 15:42. Follow me live: https://app.example/s/abc");
    expect(mensajeAviso("retraso", { ...d, minutos: 10, idioma: "en" })).toMatch(/^Hello Lucía, this is Marc from TVL VIP Transfers\. I'll be about 10 min late \(approx\. 15:42\)\. Sorry/);
  });
  test("sin conductor (central): habla la empresa", () => {
    expect(mensajeAviso("llegado", { cliente: "Lucía" })).toBe("Hola Lucía, te escribimos de TVL VIP Transfers. Ya estoy en el punto de recogida.");
  });
  test("nombre de pila", () => {
    expect(nombreDePila("  Marc  García ")).toBe("Marc");
    expect(nombreDePila(null)).toBe("");
  });
});

describe("enlaces y motivo", () => {
  test("wa.me con texto codificado; sms con body", () => {
    expect(enlaceWhatsApp("600 000 000", "Hola & adiós?")).toBe("https://wa.me/34600000000?text=Hola%20%26%20adi%C3%B3s%3F");
    expect(enlaceSms("600000000", "Hola")).toBe("sms:+34600000000?body=Hola");
    expect(enlaceWhatsApp("123", "x")).toBeNull();
  });
  test("motivo del evento ida y vuelta", () => {
    expect(motivoAviso("en_camino")).toBe("en_camino");
    expect(motivoAviso("retraso", "sms")).toBe("retraso|sms");
    expect(leerMotivoAviso("retraso|sms")).toEqual({ tipo: "retraso", canal: "sms" });
    expect(leerMotivoAviso("llegado")).toEqual({ tipo: "llegado", canal: "whatsapp" });
    expect(leerMotivoAviso("otra cosa")).toBeNull();
  });
  test("avisos por estado", () => {
    expect(avisosDisponibles("en_camino")).toEqual(["en_camino", "retraso", "llegado"]);
    expect(avisosDisponibles("recogido")).toEqual([]);
    expect(avisosDisponibles("pendiente")).toEqual([]);
  });
});

describe("estimacionAviso (ETA del mapa + contador de puntualidad)", () => {
  const recogida = "2026-10-13T13:00:00Z";
  const ahora = Date.parse("2026-10-13T12:50:00Z");
  test("a tiempo: hora de llegada, sin retraso", () => {
    expect(estimacionAviso({ estado: "en_camino", recogida, ahora, etaS: 300 })).toEqual({ hora: "14:55", minutos: null });
  });
  test("tarde por la ETA: minutos de retraso", () => {
    expect(estimacionAviso({ estado: "en_camino", recogida, ahora, etaS: 18 * 60 })).toEqual({ hora: "15:08", minutos: 8 });
  });
  test("sin ETA: sin hora", () => {
    expect(estimacionAviso({ estado: "en_camino", recogida, ahora })).toEqual({ hora: null, minutos: null });
  });
});

describe("avisos de la central", () => {
  test("en tercera persona", () => {
    const d = { cliente: "Lucía", conductor: "Marc García", hora: "15:42", emisor: "central" as const };
    expect(mensajeAviso("en_camino", d)).toBe("Hola Lucía, te escribimos de TVL VIP Transfers. Tu conductor Marc va de camino a recogerte; llegada estimada 15:42.");
    expect(mensajeAviso("reasignacion", d)).toBe("Hola Lucía, te escribimos de TVL VIP Transfers. Tu conductor ha tenido un imprevisto y no podrá hacer tu traslado. Te asignaremos otro conductor en breve; te avisaremos.");
    expect(mensajeAviso("llegado", { ...d, idioma: "en", matricula: "1234 ABC" })).toBe("Hello Lucía, this is TVL VIP Transfers. Your driver Marc is already at the pick-up point. Vehicle 1234 ABC.");
  });
  test("qué avisos según estado", () => {
    expect(avisosCentral("en_camino", null)).toEqual(["en_camino", "retraso", "llegado"]);
    expect(avisosCentral("pendiente", "devuelto: Avería")).toEqual(["reasignacion"]);
    expect(avisosCentral("pendiente", "rechazado: Avería")).toEqual([]);
    expect(avisosCentral("recogido", null)).toEqual([]);
  });
});
