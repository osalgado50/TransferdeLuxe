import { expect, test } from "vitest";
import { enlaceLlamar, enlaceWhatsApp, horaMinima, numeroInternacional, sinAntelacion } from "@/lib/reserva/disponibilidad";

const a21 = Date.parse("2026-10-16T19:00:00Z"); // 21:00 en Madrid (horario de verano)

test("antelación: hoy a las 7 con las 9 de la noche, no; dentro de menos de 1 h, no; mañana, sí", () => {
  expect(sinAntelacion("2026-10-16", "07:00", a21)).toBe(true);
  expect(sinAntelacion("2026-10-16", "21:30", a21)).toBe(true);
  expect(sinAntelacion("2026-10-16", "22:05", a21)).toBe(false);
  expect(sinAntelacion("2026-10-17", "07:00", a21)).toBe(false);
  expect(sinAntelacion("2026-10-15", "23:00", a21)).toBe(true);
});

test("hora mínima del campo: solo hoy, ahora + 1 h redondeada a 5 min; tarde por la noche, ninguna", () => {
  expect(horaMinima("2026-10-16", Date.parse("2026-10-16T19:02:00Z"))).toBe("22:05");
  expect(horaMinima("2026-10-17", a21)).toBeUndefined();
  expect(horaMinima("2026-10-16", Date.parse("2026-10-16T21:30:00Z"))).toBe("23:59"); // 23:30 → ya no da tiempo hoy
});

test("contacto: número con prefijo, enlace de llamada y de WhatsApp con el texto", () => {
  expect(numeroInternacional("600 11 22 33")).toBe("34600112233");
  expect(numeroInternacional("+34 977 00 00 00")).toBe("34977000000");
  expect(numeroInternacional("0034600112233")).toBe("34600112233");
  expect(numeroInternacional("abc")).toBeNull();
  expect(numeroInternacional(null)).toBeNull();
  expect(enlaceLlamar("600112233")).toBe("tel:+34600112233");
  expect(enlaceWhatsApp("600112233", "Hola, ¿hay coche?")).toBe("https://wa.me/34600112233?text=Hola%2C%20%C2%BFhay%20coche%3F");
  expect(enlaceWhatsApp("", "x")).toBeNull();
});
