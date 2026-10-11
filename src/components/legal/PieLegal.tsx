import Link from "next/link";

export default function PieLegal({ className = "" }: { className?: string }) {
  return (
    <footer className={`text-center text-xs text-slate-500 ${className}`}>
      <Link href="/privacidad" className="hover:text-marca-claro">Privacidad</Link>
      <span className="mx-2">·</span>
      <Link href="/aviso-legal" className="hover:text-marca-claro">Aviso legal</Link>
    </footer>
  );
}
