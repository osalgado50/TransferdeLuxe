"use client";
import { useActionState } from "react";
import { entrar } from "./actions";

export function FormularioLogin({ destino }: { destino: string }) {
  const [estado, accion, pendiente] = useActionState(entrar, {} as { error?: string });
  const campo = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-amber-400";
  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="destino" value={destino} />
      <div>
        <label htmlFor="email" className="text-sm text-slate-300">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" className={campo} />
      </div>
      <div>
        <label htmlFor="password" className="text-sm text-slate-300">Contraseña</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className={campo} />
      </div>
      {estado.error && <p role="alert" className="text-sm text-red-400">{estado.error}</p>}
      <button type="submit" disabled={pendiente} className="w-full rounded-lg bg-amber-400 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-60">
        Entrar
      </button>
    </form>
  );
}
