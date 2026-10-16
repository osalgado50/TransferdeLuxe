/**
 * Reserva pública con sentido: nada en el pasado ni con menos de 1 h de antelación (para lo urgente, llamar), y si no
 * hay ningún coche libre a esa hora, ofrecer contactar con la central por WhatsApp o teléfono (lógica pura).
 */
import { madridAUtc } from "@/lib/dominio/dias";

export const ANTELACION_MIN = 60;

/** ¿La recogida es antes de ahora + 1 h? (fecha «2026-10-16», hora «07:00», hora de Madrid). */
export function sinAntelacion(fecha: string, hora: string, ahora: number): boolean {
  const t = Date.parse(madridAUtc(fecha, hora));
  return Number.isFinite(t) && t < ahora + ANTELACION_MIN * 60_000;
}

const fmtDia = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" });
const fmtHora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/**
 * Hora mínima del campo «hora» si la fecha elegida es hoy (ahora + 1 h, redondeada a 5 min hacia arriba); undefined si
 * es otro día. Si ya no da tiempo hoy, «23:59» (el navegador no dejará elegir ninguna).
 */
export function horaMinima(fecha: string, ahora: number): string | undefined {
  if (fecha !== fmtDia.format(new Date(ahora))) return undefined;
  const t = Math.ceil((ahora + ANTELACION_MIN * 60_000) / 300_000) * 300_000;
  return fmtDia.format(new Date(t)) !== fecha ? "23:59" : fmtHora.format(new Date(t));
}

/** Número con prefijo internacional y solo dígitos («600 11 22 33» → «34600112233»); null si no parece un teléfono. */
export function numeroInternacional(n: string | null | undefined): string | null {
  if (!n) return null;
  let d = n.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1); else if (d.startsWith("00")) d = d.slice(2); else if (d.length === 9) d = `34${d}`;
  return /^\d{9,15}$/.test(d) ? d : null;
}
export const enlaceLlamar = (n: string | null | undefined) => { const d = numeroInternacional(n); return d ? `tel:+${d}` : null; };
export const enlaceWhatsApp = (n: string | null | undefined, texto: string) => {
  const d = numeroInternacional(n);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(texto)}` : null;
};
