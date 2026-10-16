/**
 * Fondo de la portada: atardecer en la Costa Dorada dibujado en SVG (sin fotos de terceros: nada de derechos de imagen).
 * Cielo de noche a dorado, sol sobre el mar, el Cap de Salou con su faro, el paseo con palmeras y un coche negro que
 * recorre la costa con los faros encendidos. Las animaciones (olas, brillo del sol en el agua, estrellas y el coche)
 * se paran con «reducir movimiento» del sistema (ver globals.css).
 */
export default function PaisajeCostaDorada({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#081426" />
          <stop offset="0.35" stopColor="#1d2a5a" />
          <stop offset="0.58" stopColor="#7a3f6e" />
          <stop offset="0.72" stopColor="#e2774a" />
          <stop offset="0.8" stopColor="#ffc46b" />
        </linearGradient>
        <radialGradient id="sol" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff4c2" />
          <stop offset="0.55" stopColor="#ffd27a" />
          <stop offset="1" stopColor="#ff9b4a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffcf7a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffcf7a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b4f8a" />
          <stop offset="0.4" stopColor="#1b2d5c" />
          <stop offset="1" stopColor="#0a1530" />
        </linearGradient>
        <linearGradient id="arena" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a3a" />
          <stop offset="1" stopColor="#120c18" />
        </linearGradient>
        <radialGradient id="faro" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6d0" />
          <stop offset="1" stopColor="#fff6d0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="luces" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff3c4" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff3c4" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Cielo y estrellas */}
      <rect width="1600" height="900" fill="url(#cielo)" />
      <g fill="#fff">
        {[[120, 70], [260, 140], [430, 60], [610, 120], [820, 50], [990, 110], [1180, 70], [1350, 130], [1500, 60], [700, 200], [350, 230], [1250, 220]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2 : 1.3} className="tvl-estrella" style={{ animationDelay: `${(i % 5) * 0.7}s` }} />
        ))}
      </g>

      {/* Sol poniéndose sobre el mar */}
      <circle cx="1080" cy="575" r="260" fill="url(#halo)" />
      <circle cx="1080" cy="585" r="95" fill="url(#sol)" />

      {/* Cap de Salou con el faro (izquierda) y la costa lejana (derecha) */}
      <path d="M0 520 C 120 470 220 455 330 480 C 420 500 470 540 560 560 L 640 600 L 0 600 Z" fill="#2a1d3d" />
      <path d="M0 555 C 140 520 260 515 380 545 C 450 562 520 585 600 600 L 0 600 Z" fill="#20162f" />
      <rect x="236" y="430" width="10" height="34" fill="#1a1226" />
      <polygon points="232,432 250,432 241,420" fill="#1a1226" />
      <circle cx="241" cy="428" r="26" fill="url(#faro)" className="tvl-faro" />
      <path d="M1180 600 C 1300 585 1420 575 1600 580 L 1600 600 Z" fill="#2a1d3d" />

      {/* Mar, reflejo del sol y olas */}
      <rect y="598" width="1600" height="302" fill="url(#mar)" />
      <g fill="#ffd98c" className="tvl-brillo">
        <rect x="1030" y="610" width="100" height="5" rx="2.5" />
        <rect x="1010" y="632" width="140" height="5" rx="2.5" opacity="0.8" />
        <rect x="1040" y="656" width="80" height="4" rx="2" opacity="0.7" />
        <rect x="995" y="682" width="170" height="4" rx="2" opacity="0.5" />
        <rect x="1050" y="710" width="60" height="3" rx="1.5" opacity="0.4" />
      </g>
      <g fill="none" stroke="#8fb0e6" strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round">
        <path className="tvl-ola" d="M-200 690 q 50 -12 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0" />
        <path className="tvl-ola tvl-ola-lenta" d="M-200 735 q 60 -14 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0" strokeOpacity="0.25" />
      </g>

      {/* Paseo marítimo: arena, carretera y el coche */}
      <path d="M0 790 C 300 770 600 772 900 782 C 1200 792 1400 788 1600 776 L 1600 900 L 0 900 Z" fill="url(#arena)" />
      <path d="M0 818 C 400 806 1000 812 1600 804" stroke="#5a4a6a" strokeWidth="3" strokeDasharray="22 18" fill="none" opacity="0.6" />
      <g className="tvl-coche">
        {/* Berlina negra de lujo con faros */}
        <polygon points="196,806 420,798 420,816 196,830" fill="url(#luces)" opacity="0.55" />
        <path d="M70 812 C 72 798 92 792 112 790 L 140 778 C 150 772 168 770 186 771 L 206 772 C 222 774 234 782 244 790 L 262 793 C 276 795 284 802 284 812 Z" fill="#05070d" />
        <path d="M146 780 L 160 774 C 170 771 182 771 192 772 L 204 774 L 214 786 L 142 788 Z" fill="#2c3d66" opacity="0.8" />
        <rect x="270" y="797" width="12" height="5" rx="2" fill="#fff3c4" />
        <rect x="70" y="800" width="8" height="5" rx="2" fill="#ff4d4d" opacity="0.9" />
        <circle cx="110" cy="814" r="11" fill="#0d0f16" stroke="#3a3f52" strokeWidth="3" />
        <circle cx="244" cy="814" r="11" fill="#0d0f16" stroke="#3a3f52" strokeWidth="3" />
      </g>

      {/* Palmeras del paseo (Salou) */}
      {[{ x: 90, s: 1.15 }, { x: 1480, s: 1 }, { x: 1360, s: 0.8 }].map((p, i) => (
        <g key={i} transform={`translate(${p.x} 900) scale(${p.s})`} fill="#0b0712">
          <path d="M-6 0 C -4 -120 0 -230 14 -330 L 24 -330 C 12 -230 8 -120 8 0 Z" />
          <path d="M18 -330 C -40 -360 -110 -350 -150 -310 C -100 -330 -50 -330 10 -318 Z" />
          <path d="M18 -330 C 70 -370 140 -360 180 -318 C 130 -340 80 -338 26 -318 Z" />
          <path d="M18 -332 C -10 -400 -70 -420 -110 -410 C -60 -395 -20 -370 12 -325 Z" />
          <path d="M20 -332 C 50 -400 110 -425 150 -415 C 100 -398 60 -372 26 -325 Z" />
          <path d="M18 -330 C 0 -300 -30 -250 -60 -230 C -28 -262 -6 -296 12 -322 Z" />
          <path d="M22 -330 C 46 -300 80 -258 110 -238 C 76 -266 50 -298 28 -322 Z" />
        </g>
      ))}
    </svg>
  );
}
