export function segundosRestantes(asignadoEn: string, plazoMin: number, ahora: Date): number {
  return Math.max(0, Math.floor((new Date(asignadoEn).getTime() + plazoMin * 60_000 - ahora.getTime()) / 1000));
}
