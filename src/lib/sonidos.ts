"use client";
import type { Sonido } from "@/lib/dominio/sonidos";

/**
 * Sonidos sintetizados con Web Audio (sin ficheros ni APIs). Un único AudioContext para toda la pestaña
 * (central y conductor). Los navegadores lo crean «suspendido» hasta el primer gesto: `prepararDesbloqueo`.
 */
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (C) ctx = new C();
    }
    return ctx;
  } catch { return null; }
}

/**
 * Reanuda el audio con el primer clic/toque/tecla (política de autoplay) y con los siguientes si el sistema lo
 * vuelve a suspender (p. ej. iOS al volver de segundo plano). Devuelve la limpieza.
 */
export function prepararDesbloqueo(): () => void {
  const f = () => { try { const c = audio(); if (c && c.state !== "running") void c.resume(); } catch { /* ignorar */ } };
  const evs = ["pointerdown", "keydown"] as const;
  evs.forEach((e) => window.addEventListener(e, f));
  return () => evs.forEach((e) => window.removeEventListener(e, f));
}

interface Nota { f: number; t: number; d: number; v?: number; onda?: OscillatorType; fFin?: number }

/** Una nota con envolvente (ataque corto y caída exponencial) para que no «chasquee». */
function nota(c: AudioContext, destino: AudioNode, { f, t, d, v = 0.25, onda = "sine", fFin }: Nota) {
  const t0 = c.currentTime + t;
  const o = c.createOscillator(), g = c.createGain();
  o.type = onda;
  o.frequency.setValueAtTime(f, t0);
  if (fFin) o.frequency.exponentialRampToValueAtTime(fFin, t0 + d);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g).connect(destino);
  o.start(t0); o.stop(t0 + d + 0.02);
}

/** «Whoosh»: ruido filtrado con barrido de frecuencia. */
function whoosh(c: AudioContext, destino: AudioNode) {
  const d = 0.4, t0 = c.currentTime;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * d), c.sampleRate);
  const datos = buf.getChannelData(0);
  for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
  const ruido = c.createBufferSource(); ruido.buffer = buf;
  const filtro = c.createBiquadFilter(); filtro.type = "bandpass"; filtro.Q.value = 1.2;
  filtro.frequency.setValueAtTime(350, t0); filtro.frequency.exponentialRampToValueAtTime(2800, t0 + d);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  ruido.connect(filtro).connect(g).connect(destino);
  ruido.start(t0); ruido.stop(t0 + d);
  nota(c, destino, { f: 520, fFin: 1040, t: 0.05, d: 0.25, v: 0.08 });
}

const RECETAS: Record<Sonido, (c: AudioContext, o: AudioNode) => void> = {
  reserva_nueva: (c, o) => { nota(c, o, { f: 660, t: 0, d: 0.2 }); nota(c, o, { f: 880, t: 0.2, d: 0.3 }); },
  enviado: whoosh,
  aceptado: (c, o) => {
    nota(c, o, { f: 784, t: 0, d: 0.35, onda: "triangle", v: 0.3 }); nota(c, o, { f: 988, t: 0, d: 0.35, v: 0.12 });
    nota(c, o, { f: 1047, t: 0.16, d: 0.5, onda: "triangle", v: 0.3 }); nota(c, o, { f: 1319, t: 0.16, d: 0.5, v: 0.12 });
  },
  rechazado: (c, o) => { nota(c, o, { f: 392, t: 0, d: 0.28, onda: "triangle", v: 0.4 }); nota(c, o, { f: 262, t: 0.3, d: 0.45, onda: "triangle", v: 0.4 }); },
  en_camino: (c, o) => nota(c, o, { f: 523, t: 0, d: 0.45, v: 0.18 }),
  cargado: (c, o) => { nota(c, o, { f: 659, t: 0, d: 0.14, onda: "triangle" }); nota(c, o, { f: 659, t: 0.18, d: 0.18, onda: "triangle" }); },
  completado: (c, o) => [523, 659, 784, 1047].forEach((f, i) => nota(c, o, { f, t: i * 0.09, d: i === 3 ? 0.55 : 0.14, onda: "triangle", v: 0.22 })),
  incidencia: (c, o) => [0, 0.22, 0.44].forEach((t) => nota(c, o, { f: 988, t, d: 0.16, onda: "square", v: 0.12 })),
  llegando: (c, o) => { nota(c, o, { f: 1319, t: 0, d: 1.2, v: 0.25 }); nota(c, o, { f: 2637, t: 0, d: 0.7, v: 0.07 }); nota(c, o, { f: 3951, t: 0, d: 0.35, v: 0.03 }); },
};

/** Reproduce un sonido del vocabulario. Nunca lanza (audio bloqueado o sin soporte: silencio). */
export function reproducir(s: Sonido): void {
  conAudio((c) => RECETAS[s](c, c.destination));
}

/**
 * Ejecuta `f` con el audio en marcha. Si está suspendido intenta reanudarlo; si no lo consigue enseguida (aún no
 * hubo gesto del usuario) el sonido se descarta: no se acumulan pitidos para soltarlos todos de golpe al primer clic.
 */
function conAudio(f: (c: AudioContext) => void) {
  try {
    const c = audio();
    if (!c) return;
    if (c.state === "running") { f(c); return; }
    const pedido = Date.now();
    void c.resume().then(() => { if (Date.now() - pedido < 1000) f(c); }, () => undefined);
  } catch { /* sin sonido */ }
}

/** Pitidos simples (avisos del conductor: servicio nuevo, llegando). */
export function pitar(veces: number, freq: number, separacion = 0.3): void {
  conAudio((c) => { for (let i = 0; i < veces; i++) nota(c, c.destination, { f: freq, t: i * separacion, d: 0.22, v: 0.35 }); });
}

// ── Interruptor 🔊/🔇 de la central (persistente por navegador) ──
const CLAVE = "tdl-sonidos-central";
const oyentes = new Set<() => void>();
let activo: boolean | null = null;

export function sonidosActivos(): boolean {
  if (activo === null) {
    try { activo = localStorage.getItem(CLAVE) !== "0"; } catch { activo = true; }
  }
  return activo;
}
export function fijarSonidosActivos(v: boolean): void {
  activo = v;
  try { localStorage.setItem(CLAVE, v ? "1" : "0"); } catch { /* sin almacenamiento: vale para esta pestaña */ }
  oyentes.forEach((f) => f());
}
export function suscribirSonidos(f: () => void): () => void {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}

/** Sonido de la central: respeta el interruptor. */
export function avisarCentral(s: Sonido): void {
  if (sonidosActivos()) reproducir(s);
}
