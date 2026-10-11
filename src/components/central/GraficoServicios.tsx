"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function GraficoServicios({ datos }: { datos: { dia: string; servicios: number }[] }) {
  if (datos.every((d) => d.servicios === 0)) return <p className="text-slate-400">Sin servicios completados este mes.</p>;
  return (
    <div role="img" aria-label="Servicios completados por día del mes; los totales están en las tablas" className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#334155" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="dia" tick={{ fill: "#cbd5e1", fontSize: 11 }} axisLine={{ stroke: "#475569" }} tickLine={false} interval={1} />
          <YAxis allowDecimals={false} tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
          <Tooltip cursor={{ fill: "#94a3b8", fillOpacity: 0.12 }}
            contentStyle={{ background: "#0f172a", border: "1px solid #475569", borderRadius: 8, color: "#e2e8f0" }}
            labelStyle={{ color: "#e2e8f0" }} itemStyle={{ color: "#e2e8f0" }} labelFormatter={(d) => `Día ${d}`}
            formatter={(v) => [String(v), "Servicios"]} />
          <Bar dataKey="servicios" fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
