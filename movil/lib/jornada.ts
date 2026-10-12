// Avisos en memoria entre pantallas: la jornada ha cambiado (pantalla Jornada → icono de la pestaña, checklist de Hoy) y
// el GPS «En servicio» ha cambiado (Jornada enciende/apaga → el interruptor de la cabecera se resincroniza, y al revés).
type Oyente = () => void;
function emisor() {
  const oyentes = new Set<Oyente>();
  return {
    avisar: () => oyentes.forEach((f) => f()),
    escuchar: (f: Oyente): (() => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; },
  };
}
const jornada = emisor(), gps = emisor();
export const avisarCambioJornada = jornada.avisar;
export const alCambiarJornada = jornada.escuchar;
export const avisarCambioGps = gps.avisar;
export const alCambiarGps = gps.escuchar;
