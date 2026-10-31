import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatMoneyShort, shortDate, type LineFilter } from "@dash/shared";

const colors = { studio: "#2f6fb5", aesthetics: "#c2477f" };

/** Vendas por dia, uma série para Studio e outra para Estética (empilhadas). */
export function DailySalesChart({ data, line }: { data: { date: string; studio: number; aesthetics: number }[]; line: LineFilter }) {
  const showStudio = line !== "aesthetics";
  const showAesthetics = line !== "studio";
  return (
    <div className="chart" aria-label="Gráfico de vendas por dia">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e5e2da" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(8, 10)} tick={{ fontSize: 12, fill: "#748079" }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(value: number) => formatMoneyShort(value)} tick={{ fontSize: 12, fill: "#748079" }} tickLine={false} axisLine={false} width={84} />
          <Tooltip
            formatter={(value, name) => [formatMoney(Number(value)), name === "studio" ? "Studio" : "Estética"]}
            labelFormatter={(label) => shortDate(String(label))}
            cursor={{ fill: "rgba(24,79,67,0.06)" }}
          />
          {line === "all" ? <Legend formatter={(value: string) => (value === "studio" ? "Studio" : "Estética")} wrapperStyle={{ fontSize: 13 }} /> : null}
          {showStudio ? <Bar dataKey="studio" stackId="sales" fill={colors.studio} isAnimationActive={false} radius={showAesthetics ? 0 : [4, 4, 0, 0]} /> : null}
          {showAesthetics ? <Bar dataKey="aesthetics" stackId="sales" fill={colors.aesthetics} isAnimationActive={false} radius={[4, 4, 0, 0]} /> : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
