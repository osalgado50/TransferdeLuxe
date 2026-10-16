import Link from "next/link";
import type { Idioma } from "@/lib/i18n/portada";

const TEXTOS: Record<Idioma, { privacidad: string; aviso: string }> = {
  es: { privacidad: "Privacidad", aviso: "Aviso legal" },
  ca: { privacidad: "Privacitat", aviso: "Avís legal" },
  en: { privacidad: "Privacy", aviso: "Legal notice" },
};

/** Enlaces a privacidad y aviso legal (en el idioma de la página; sin idioma, en castellano y sin parámetro). */
export default function PieLegal({ className = "", idioma }: { className?: string; idioma?: Idioma }) {
  const t = TEXTOS[idioma ?? "es"];
  const q = idioma ? `?lang=${idioma}` : "";
  return (
    <footer className={`text-center text-xs text-slate-500 ${className}`}>
      <Link href={`/privacidad${q}`} className="hover:text-marca-claro">{t.privacidad}</Link>
      <span className="mx-2">·</span>
      <Link href={`/aviso-legal${q}`} className="hover:text-marca-claro">{t.aviso}</Link>
    </footer>
  );
}
