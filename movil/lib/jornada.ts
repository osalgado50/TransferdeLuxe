// Aviso en memoria de que la jornada ha cambiado (botón de la cabecera → pantalla de Hoy, que recarga el checklist).
type Oyente = () => void;
const oyentes = new Set<Oyente>();
export function avisarCambioJornada() { oyentes.forEach((f) => f()); }
export function alCambiarJornada(f: Oyente): () => void { oyentes.add(f); return () => { oyentes.delete(f); }; }
