"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { euros, mesLegible } from "@/lib/dominio/formato";

export interface PuntoMes { mes: string; gasto: number; litros: number }

export default function GraficoCombustible({ datos }: { datos: PuntoMes[] }) {
  if (datos.length === 0) return <p className="text-slate-400">Sin datos para el gráfico.</p>;
  const d = datos.map((x) => ({ ...x, etiqueta: mesLegible(x.mes) }));
  return (
    <div role="img" aria-label="Gasto en combustible por mes; los valores están en la tabla inferior" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={d} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#334155" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="etiqueta" tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={{ stroke: "#475569" }} tickLine={false} />
          <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => euros(v)} width={90} />
          <Tooltip cursor={{ fill: "#94a3b8", fillOpacity: 0.12 }}
            contentStyle={{ background: "#0f172a", border: "1px solid #475569", borderRadius: 8, color: "#e2e8f0" }}
            labelStyle={{ color: "#e2e8f0" }} itemStyle={{ color: "#e2e8f0" }}
            formatter={(v) => [euros(Number(v)), "Gasto"]} />
          <Bar dataKey="gasto" name="Gasto" fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
