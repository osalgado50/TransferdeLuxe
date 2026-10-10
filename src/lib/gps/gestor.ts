"use client";
// Gestor único de GPS por página: un solo watchPosition compartido por el interruptor «En servicio»
// y la navegación. iOS mata el watch al bloquear/pasar a segundo plano y a menudo no lo reanuda,
// así que se reinicia al volver a primer plano (visibilitychange/pageshow/online) y con un watchdog
// si pasan 30 s sin fix, más un getCurrentPosition de respaldo. Si el usuario deniega el permiso
// no se reintenta (evita repetir el diálogo) hasta una nueva suscripción explícita o un fix.
import { debeReiniciar, REARRANQUE_MIN_MS } from "@/lib/dominio/gps";

export type Fix = GeolocationPosition;
type Oyente = { fix: (p: Fix) => void; error?: (e: GeolocationPositionError) => void };

const oyentes = new Set<Oyente>();
let watchId: number | null = null;
let arrancado = 0;
let ultimoFix: number | null = null;
let ultimaPos: Fix | null = null;
let ultimoError: GeolocationPositionError | null = null;
let denegado = false;
let perro: ReturnType<typeof setInterval> | null = null;
const OPC: PositionOptions = { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 };

function alFix(p: Fix) {
  ultimoFix = Date.now(); ultimaPos = p; ultimoError = null; denegado = false;
  oyentes.forEach((o) => o.fix(p));
}
function alError(e: GeolocationPositionError) {
  ultimoError = e;
  if (e.code === 1) denegado = true; // PERMISSION_DENIED
  oyentes.forEach((o) => o.error?.(e));
}

function arrancarWatch() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  arrancado = Date.now();
  watchId = navigator.geolocation.watchPosition(alFix, alError, OPC);
  navigator.geolocation.getCurrentPosition(alFix, () => undefined, { ...OPC, maximumAge: 0 });
}

function reactivar() {
  if (denegado || watchId === null || document.visibilityState !== "visible") return;
  if (Date.now() - arrancado < REARRANQUE_MIN_MS) return; // visibilitychange + pageshow seguidos
  arrancarWatch();
}

export function suscribirGps(o: Oyente): () => void {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    o.error?.({ code: 2, message: "sin geolocalización", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    return () => undefined;
  }
  oyentes.add(o);
  if (oyentes.size === 1) {
    denegado = false;
    arrancarWatch();
    perro = setInterval(() => {
      if (!denegado && document.visibilityState === "visible" && debeReiniciar(Date.now(), ultimoFix, arrancado)) arrancarWatch();
    }, 5_000);
    document.addEventListener("visibilitychange", reactivar);
    window.addEventListener("pageshow", reactivar);
    window.addEventListener("online", reactivar);
  } else {
    // Suscriptor tardío: recibe lo último conocido; si estaba denegado, una suscripción explícita reintenta.
    if (ultimaPos) o.fix(ultimaPos);
    else if (ultimoError) o.error?.(ultimoError);
    if (denegado) { denegado = false; arrancarWatch(); }
  }
  return () => {
    oyentes.delete(o);
    if (oyentes.size > 0) return;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null; ultimoFix = null; ultimaPos = null; ultimoError = null; denegado = false;
    if (perro) clearInterval(perro);
    perro = null;
    document.removeEventListener("visibilitychange", reactivar);
    window.removeEventListener("pageshow", reactivar);
    window.removeEventListener("online", reactivar);
  };
}
