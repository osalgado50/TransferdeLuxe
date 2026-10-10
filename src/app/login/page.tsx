import LogoTVL from "@/components/comun/LogoTVL";
import { CuentasDemo } from "@/components/login/CuentasDemo";
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
        <div className="flex justify-center"><LogoTVL alto={96} prioridad /></div>
        <h1 className="text-center text-2xl font-semibold text-marca-claro">Acceso a TransferdeLuxe</h1>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <FormularioLogin destino={destino ?? ""} />
        </div>
        <CuentasDemo cuentas={CUENTAS} clave={clave} />
      </div>
    </main>
  );
}
