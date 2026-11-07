import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatMoneyShort, isFilterActive, lineKeyLabels, lineKeys, shortDate, type DailySales, type PanelFilter } from "@dash/shared";

const colors = { studio: "#2f6fb5", aesthetics: "#c2477f", other: "#7d857f", total: "#26705f" };
const seriesLabel = (name: unknown) => (name === "total" ? "Seleção" : (lineKeyLabels[name as keyof typeof lineKeyLabels] ?? String(name)));

/**
 * Vendas por dia. Sem filtro: uma barra por linha, lado a lado (o plano com serviços de duas linhas
 * entra inteiro nas duas, então empilhar somaria a venda duas vezes). Com filtro: uma barra só, com
 * o total da seleção (cada venda uma vez).
 */
export function DailySalesChart({ data, filter }: { data: DailySales[]; filter: PanelFilter }) {
  const filtered = isFilterActive(filter);
  const series = filtered ? (["total"] as const) : lineKeys;
  const color = (key: (typeof series)[number]) => (key === "total" && filter.services.length === 0 && filter.line !== "all" ? colors[filter.line] : colors[key]);
  return (
    <div className="chart" aria-label="Gráfico de vendas por dia">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e5e2da" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(8, 10)} tick={{ fontSize: 12, fill: "#748079" }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(value: number) => formatMoneyShort(value)} tick={{ fontSize: 12, fill: "#748079" }} tickLine={false} axisLine={false} width={84} />
          <Tooltip formatter={(value, name) => [formatMoney(Number(value)), seriesLabel(name)]} labelFormatter={(label) => shortDate(String(label))} cursor={{ fill: "rgba(24,79,67,0.06)" }} />
          {filtered ? null : <Legend formatter={(value: string) => seriesLabel(value)} wrapperStyle={{ fontSize: 13 }} />}
          {series.map((key) => (
            <Bar key={key} dataKey={key} fill={color(key)} isAnimationActive={false} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
