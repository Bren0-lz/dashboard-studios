import { AlertTriangle, ExternalLink } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  chargeMessage,
  formatMoney,
  formatPhone,
  overdueBandLabels,
  overdueTone,
  plural,
  shortDate,
  whatsappLink,
  type OverdueResponse,
  type OverdueRowView,
} from "@dash/shared";
import { EmptyState, ErrorBanner, Kpi, Notice, PageHeader, Skeleton, WhatsAppButton } from "../components/ui";
import { globalFilters, usePanelFilter, withFilter } from "../lib/filters";
import { useSession } from "../lib/session";
import { useRemote } from "../lib/useRemote";

export function OverduePage() {
  const [filter] = usePanelFilter();
  const { session } = useSession();
  const location = useLocation();
  const [params] = useSearchParams();
  // `?turma=`: aberta pelo "Pagamentos atrasados" do cartão da turma.
  const groupId = params.get("turma") ?? "";
  const path = withFilter(groupId ? `/overdue?turma=${encodeURIComponent(groupId)}` : "/overdue", filter);
  const overdue = useRemote<OverdueResponse>(session.can.seeFinance ? path : null);
  const data = overdue.data;

  if (!session.can.seeFinance)
    return (
      <>
        <PageHeader title="Quem preciso cobrar?" />
        <Notice tone="warning">Seu usuário do CRM não tem acesso ao financeiro. Peça a um administrador para liberar a inadimplência.</Notice>
      </>
    );

  return (
    <>
      <PageHeader title="Quem preciso cobrar?" subtitle={data?.available ? `Posição de ${shortDate(data.referenceDate)}` : undefined} />
      {overdue.error ? <ErrorBanner message={overdue.error} onRetry={overdue.reload} /> : null}
      {!data && overdue.loading ? <Skeleton rows={6} /> : null}
      {data?.group ? (
        <Notice>
          Só os clientes em atraso da turma <strong>{data.group.name}</strong>. <Link to={`/inadimplencia${globalFilters(location.search)}`}>Ver todos os atrasos</Link>
        </Notice>
      ) : null}
      {data && !data.available ? <Notice tone="warning">O CRM ainda não informa a inadimplência por cliente. A lista aparece depois da atualização do CRM.</Notice> : null}
      {data?.available ? (
        <>
          <section className="kpi-grid kpi-grid-compact">
            <Kpi label="Total em atraso" value={formatMoney(data.totalInCents)} detail={plural(data.clients, "cliente", "clientes")} tone={data.clients ? "bad" : "good"} />
            {data.bands.map((band) => (
              <Kpi key={band.band} label={overdueBandLabels[band.band]} value={formatMoney(band.totalInCents + data.risk.filter((row) => row.band === band.band).reduce((sum, row) => sum + row.amountInCents, 0))} detail={plural(band.rows.length + data.risk.filter((row) => row.band === band.band).length, "cliente", "clientes")} />
            ))}
          </section>
          {data.clients === 0 ? (
            <section className="panel">
              <EmptyState title="Ninguém em atraso" hint="Todos os pagamentos estão em dia. Ótimo trabalho!" />
            </section>
          ) : null}
          {data.risk.length > 0 ? (
            <section className="panel panel-risk">
              <div className="panel-head">
                <div>
                  <h2>
                    <AlertTriangle size={18} aria-hidden /> Atrasos em turmas cheias com espera
                  </h2>
                  <p className="panel-context">Cobre primeiro: a vaga pode ir para quem está na fila e paga.</p>
                </div>
              </div>
              <OverdueTable rows={data.risk} />
            </section>
          ) : null}
          {data.bands
            .filter((band) => band.rows.length > 0)
            .map((band) => (
              <section key={band.band} className="panel">
                <div className="panel-head">
                  <div>
                    <h2>{overdueBandLabels[band.band]}</h2>
                    <p className="panel-context">
                      {plural(band.rows.length, "cliente", "clientes")} · {formatMoney(band.totalInCents)}
                    </p>
                  </div>
                </div>
                <OverdueTable rows={band.rows} />
              </section>
            ))}
        </>
      ) : null}
    </>
  );
}

function OverdueTable({ rows }: { rows: OverdueRowView[] }) {
  const { session } = useSession();
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Turmas</th>
            <th className="num">Parcelas</th>
            <th className="num">Valor</th>
            <th className="num">Dias</th>
            <th>Último contato</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.patientId}>
              <td data-label="Cliente">
                <strong>{row.patientName}</strong>
                <span className="muted cell-sub">{formatPhone(row.phone)}</span>
              </td>
              <td data-label="Turmas">{row.groups.length ? row.groups.map((group) => group.groupName).join(", ") : <span className="muted">—</span>}</td>
              <td data-label="Parcelas" className="num">
                {row.installments}
              </td>
              <td data-label="Valor" className="num">
                <strong>{formatMoney(row.amountInCents)}</strong>
              </td>
              <td data-label="Dias" className="num">
                <span className={`overdue-badge tone-${overdueTone(row.daysOverdue)}`}>{plural(row.daysOverdue, "dia", "dias")}</span>
              </td>
              <td data-label="Último contato">{row.lastContactAt ? shortDate(row.lastContactAt) : <span className="muted">Sem registro</span>}</td>
              <td className="cell-actions">
                <WhatsAppButton
                  label="Cobrar"
                  href={whatsappLink(row.phone, chargeMessage({ patientName: row.patientName, amountInCents: row.amountInCents, oldestDueDate: row.oldestDueDate, clinicName: session.clinicName, pixKey: session.pixKey }))}
                />
                {session.crmWebUrl ? (
                  <a className="secondary-button small" href={`${session.crmWebUrl}/clientes/${row.patientId}`} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} aria-hidden /> Ver no CRM
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
