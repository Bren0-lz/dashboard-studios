import { Download } from "lucide-react";
import { useState } from "react";
import {
  addDays,
  businessLineLabels,
  formatMoney,
  formatPercent,
  monthStart,
  shortDate,
  todayInClinic,
  type SalesRankingItem,
  type SalesResponse,
} from "@dash/shared";
import { DailySalesChart } from "../components/charts";
import { EmptyState, ErrorBanner, Kpi, Notice, PageHeader, Skeleton } from "../components/ui";
import { useLineFilter, withLine } from "../lib/filters";
import { useRemote } from "../lib/useRemote";

export function SalesPage() {
  const [line] = useLineFilter();
  const today = todayInClinic();
  const [from, setFrom] = useState(monthStart(today.slice(0, 7)));
  const [to, setTo] = useState(today);
  const valid = Boolean(from && to && from <= to);
  const query = withLine(`/sales?from=${from}&to=${to}`, line);
  const sales = useRemote<SalesResponse>(valid ? query : null);
  const data = sales.data;

  const presets: [string, string, string][] = [
    ["Este mês", monthStart(today.slice(0, 7)), today],
    ["Últimos 7 dias", addDays(today, -6), today],
    ["Últimos 30 dias", addDays(today, -29), today],
  ];

  return (
    <>
      <PageHeader
        title="Quanto vendi e de quê?"
        actions={
          <a className="secondary-button" href={`/api${query.replace("/sales?", "/sales.csv?")}`} download>
            <Download size={16} aria-hidden /> Exportar CSV
          </a>
        }
      />
      <section className="panel">
        <div className="list-toolbar">
          {presets.map(([label, start, end], index) => (
            <button
              key={label}
              type="button"
              className={`chip${presets.findIndex(([, a, b]) => a === from && b === to) === index ? " active" : ""}`}
              onClick={() => {
                setFrom(start);
                setTo(end);
              }}
            >
              {label}
            </button>
          ))}
          <label className="inline-field">
            <span>De</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="inline-field">
            <span>Até</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
        {!valid ? <p className="form-error panel-body">A data inicial deve ser anterior à final.</p> : null}
      </section>
      {sales.error ? <ErrorBanner message={sales.error} onRetry={sales.reload} /> : null}
      {!data && sales.loading ? <Skeleton rows={6} /> : null}
      {data ? (
        <>
          <section className="kpi-grid">
            <Kpi
              label="Líquido"
              value={formatMoney(data.summary.netSalesInCents)}
              detail={data.changePercent === null ? `Sem vendas de ${shortDate(data.previous.from)} a ${shortDate(data.previous.to)}` : `${data.changePercent >= 0 ? "+" : ""}${formatPercent(data.changePercent)} sobre o período anterior`}
              tone={data.changePercent !== null && data.changePercent < 0 ? "bad" : undefined}
            />
            <Kpi label="Bruto" value={formatMoney(data.summary.grossSalesInCents)} detail={`${data.summary.salesCount} vendas`} />
            <Kpi label="Cancelado" value={formatMoney(data.summary.cancelledSalesInCents)} tone={data.summary.cancelledSalesInCents ? "bad" : undefined} />
            {!data.partialLine ? <Kpi label="Recebido" value={formatMoney(data.summary.receivedInCents)} detail={`${data.summary.attendedPatients} clientes atendidos`} /> : null}
            <Kpi label="Ticket médio" value={formatMoney(data.summary.averageTicketInCents)} />
            {line === "all" ? (
              <Kpi label="Studio × Estética" value={`${formatMoney(data.byLine.studio)}`} detail={`${businessLineLabels.aesthetics}: ${formatMoney(data.byLine.aesthetics)}`} />
            ) : null}
          </section>
          {data.partialLine ? <Notice>Recebido e clientes atendidos não se separam por linha; veja em “Tudo”.</Notice> : null}
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Vendas por dia</h2>
                <p className="panel-context">
                  {shortDate(data.from)} a {shortDate(data.to)}
                </p>
              </div>
            </div>
            <div className="panel-body">
              <DailySalesChart data={data.daily} line={line} />
            </div>
          </section>
          <div className="two-columns">
            <Ranking title="Planos e serviços mais vendidos" items={data.topItems} empty="Nenhuma venda no período." />
            <Ranking title="Vendas por profissional" items={data.byProfessional} empty="O CRM não informou o profissional das vendas deste período." />
          </div>
        </>
      ) : null}
    </>
  );
}

function Ranking({ title, items, empty }: { title: string; items: SalesRankingItem[]; empty: string }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      {items.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Qtd.</th>
                <th className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.name}>
                  <td data-label="Item">{item.name}</td>
                  <td data-label="Qtd." className="num">
                    {item.quantity}
                  </td>
                  <td data-label="Valor" className="num">
                    {formatMoney(item.amountInCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
