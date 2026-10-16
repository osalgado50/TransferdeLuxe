/**
 * Marca ficticia del proyecto (hackathon): «TransferdeLuxe». Emblema propio, dibujado con trazos (sin textos ni
 * imágenes de terceros): anillo dorado, monograma T·L con el trazo vertical compartido y un arco de carretera.
 * Lo usan el componente LogoMarca (web) y scripts/marca.ts (iconos de la web y de la app).
 */
export const NOMBRE_MARCA = "TransferdeLuxe";
export const LEMA_MARCA = "Costa Dorada";

/** Interior del emblema (viewBox 0 0 100 100). `id` evita choques de degradados si hay varios en la página. */
export function emblemaSvg(id = "tdl"): string {
  return `<defs><linearGradient id="${id}-oro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e08a"/><stop offset=".5" stop-color="#d9a92e"/><stop offset="1" stop-color="#a87412"/></linearGradient></defs>
<circle cx="50" cy="50" r="46" fill="none" stroke="url(#${id}-oro)" stroke-width="3.2"/>
<circle cx="50" cy="50" r="40.5" fill="none" stroke="url(#${id}-oro)" stroke-width=".9" opacity=".65"/>
<path d="M50 11.5l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6z" fill="url(#${id}-oro)"/>
<path d="M26 27h48a2 2 0 0 1 0 4h-21v31h19.5a2 2 0 0 1 0 4H47V31H26a2 2 0 0 1 0-4z" fill="url(#${id}-oro)"/>
<path d="M22 79q28-12 56 0" fill="none" stroke="url(#${id}-oro)" stroke-width="2.2" stroke-linecap="round"/>
<path d="M33 79.6q17-6.5 34 0" fill="none" stroke="url(#${id}-oro)" stroke-width="1" stroke-linecap="round" stroke-dasharray="3 3" opacity=".8"/>`;
}

/** SVG completo: emblema y, debajo, nombre y lema (para el logo grande y la pantalla de inicio de la app). */
export function logoSvg({ conTexto = true, colorTexto = "#ffffff", fuente = "Georgia, 'Times New Roman', serif" } = {}): string {
  if (!conTexto) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${emblemaSvg()}</svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><g transform="translate(29 0) scale(.92)">${emblemaSvg()}</g>
<text x="75" y="118" text-anchor="middle" font-family="${fuente}" font-size="17" font-weight="700" textLength="134" lengthAdjust="spacingAndGlyphs" fill="${colorTexto}">${NOMBRE_MARCA}</text>
<text x="75" y="136" text-anchor="middle" font-family="${fuente}" font-size="9" letter-spacing="3" fill="#d9a92e">${LEMA_MARCA.toUpperCase()}</text></svg>`;
}
