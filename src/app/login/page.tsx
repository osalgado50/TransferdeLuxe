import { FormularioLogin } from "./formulario";

const CUENTAS = [
  "central@transferdeluxe.test",
  "conductor1@transferdeluxe.test",
  "conductor2@transferdeluxe.test",
  "conductor3@transferdeluxe.test",
];

export default async function Login({ searchParams }: { searchParams: Promise<{ destino?: string }> }) {
  const { destino } = await searchParams;
  const mostrarClave = process.env.NEXT_PUBLIC_MODO_DEMO === "true";
  const clave = mostrarClave ? process.env.DEMO_PASSWORD : undefined;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-center text-2xl font-semibold text-amber-400">Acceso a TransferdeLuxe</h1>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <FormularioLogin destino={destino ?? ""} />
        </div>
        <aside className="rounded-2xl border border-slate-800 p-4 text-sm text-slate-400">
          <h2 className="mb-2 font-medium text-slate-200">Cuentas de demo</h2>
          <ul className="space-y-1 font-mono text-xs">
            {CUENTAS.map((c) => <li key={c}>{c}</li>)}
          </ul>
          {clave && <p className="mt-2">Contraseña: <span className="font-mono text-amber-300">{clave}</span></p>}
        </aside>
      </div>
    </main>
  );
}
