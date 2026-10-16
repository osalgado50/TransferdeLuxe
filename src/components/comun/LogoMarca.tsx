import { emblemaSvg, LEMA_MARCA, NOMBRE_MARCA } from "@/lib/marca/emblema";

/**
 * Logo de la marca ficticia del proyecto (TransferdeLuxe): emblema dorado con el nombre y el lema debajo, en blanco
 * (para fondos oscuros). `alto` es la altura total; con `soloEmblema`, solo el emblema (cabeceras pequeñas).
 */
export default function LogoMarca({ alto = 48, soloEmblema = false, className = "" }: { alto?: number; soloEmblema?: boolean; prioridad?: boolean; className?: string }) {
  const id = `tdl-${alto}${soloEmblema ? "e" : ""}`;
  if (soloEmblema) {
    return <svg role="img" aria-label={NOMBRE_MARCA} viewBox="0 0 100 100" width={alto} height={alto} className={className}
      dangerouslySetInnerHTML={{ __html: emblemaSvg(id) }} />;
  }
  return (
    <svg role="img" aria-label={`${NOMBRE_MARCA} · ${LEMA_MARCA}`} viewBox="0 0 150 150" width={alto} height={alto} className={className}>
      <g transform="translate(29 0) scale(.92)" dangerouslySetInnerHTML={{ __html: emblemaSvg(id) }} />
      <text x="75" y="118" textAnchor="middle" fontSize="17" fontWeight="700" textLength={134} lengthAdjust="spacingAndGlyphs" fill="#fff" style={{ fontFamily: "var(--font-titulo-portada, Georgia), Georgia, serif" }}>{NOMBRE_MARCA}</text>
      <text x="75" y="136" textAnchor="middle" fontSize="9" letterSpacing="3" fill="#d9a92e" style={{ fontFamily: "var(--font-titulo-portada, Georgia), Georgia, serif" }}>{LEMA_MARCA.toUpperCase()}</text>
    </svg>
  );
}
