import { ArrowRight, Settings2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  formatMoney,
  formatPercent,
  plural,
  businessLineLabels,
  type Goals,
  type Opportunity,
  type OverviewResponse,
} from "@dash/shared";
import { DailySalesChart } from "../components/charts";
import { EmptyState, ErrorBanner, Kpi, Modal, Notice, PageHeader, Skeleton, WhatsAppButton } from "../components/ui";
import { useLineFilter, withLine } from "../lib/filters";
import { useAction } from "../lib/useAction";
import { useRemote } from "../lib/useRemote";

const kindLabels: Record<Opportunity["kind"], string> = {
  offer_seat: "Vaga",
  charge: "Cobrança",
  lead_stalled: "Lead",
  renew: "Renovação",
  open_group: "Turma nova",
  merge_group: "Turma vazia",
};

export function OverviewPage() {
  const [line] = useLineFilter();
  const navigate = useNavigate();
  const overview = useRemote<OverviewResponse>(withLine("/overview", line));
  const goals = useRemote<Goals & { canEdit: boolean }>("/goals");
  const [editingGoals, setEditingGoals] = useState(false);
  const go = (path: string) => navigate(withLine(path, line));
  const data = overview.data;

  return (
    <>
      <PageHeader title="Como estão as vendas hoje?" subtitle={data ? `Mês de ${monthLabel(data.month)}` : undefined} />
      {overview.error ? <ErrorBanner message={overview.error} onRetry={overview.reload} /> : null}
      {!data && overview.loading ? <Skeleton rows={6} /> : null}
      {data ? (
        <>
          <section className="kpi-grid">
            <Kpi
              label="Faturamento do mês"
              value={formatMoney(data.sales.currentInCents)}
              detail={
                data.sales.changePercent === null
                  ? "Sem vendas no mês anterior até hoje"
                  : `${data.sales.changePercent >= 0 ? "+" : ""}${formatPercent(data.sales.changePercent)} sobre o mês anterior`
              }
              tone={data.sales.changePercent !== null && data.sales.changePercent < 0 ? "bad" : undefined}
            >
              {data.goal ? (
                <div className="goal">
                  <div className="goal-track">
                    <div className="goal-fill" style={{ "--fill": `${Math.min(100, data.goal.percent)}%` } as React.CSSProperties} />
                  </div>
                  <span className="kpi-detail">
                    {formatPercent(data.goal.percent)} da meta de {formatMoney(data.goal.goalInCents)}
                    {data.goal.remainingInCents > 0
                      ? ` · faltam ${formatMoney(data.goal.perWorkingDayInCents)} por dia útil`
                      : " · meta batida"}
                  </span>
                </div>
              ) : null}
            </Kpi>
            <Kpi
              label="Receita parada"
              value={formatMoney(data.idleRevenueInCents)}
              detail={`${plural(data.freeSeats, "vaga livre", "vagas livres")} × ticket médio, por mês`}
              tone="warn"
              onClick={() => go("/turmas")}
            />
            <Kpi label="Ocupação das turmas" value={formatPercent(data.occupancyPercent)} detail="Inscritos ÷ capacidade" onClick={() => go("/calendario")} />
            {data.overdue.available ? (
              <Kpi
                label="Em atraso"
                value={formatMoney(data.overdue.totalInCents)}
                detail={plural(data.overdue.clients, "cliente para cobrar", "clientes para cobrar")}
                tone={data.overdue.clients > 0 ? "bad" : "good"}
                onClick={() => go("/inadimplencia")}
              />
            ) : null}
            <Kpi
              label="Lista de espera"
              value={plural(data.waitlist.waiting, "pessoa", "pessoas")}
              detail={data.waitlist.withSeat > 0 ? `${data.waitlist.withSeat} já com vaga compatível` : "Nenhuma com vaga agora"}
              tone={data.waitlist.withSeat > 0 ? "good" : undefined}
              onClick={() => go("/espera")}
            />
            {data.leads ? (
              <Kpi
                label="Leads abertos"
                value={String(data.leads.open)}
                detail={`Conversão de ${formatPercent(data.leads.conversionRate)} · ${data.leads.withoutContact} sem contato`}
              />
            ) : null}
          </section>

          <div className="overview-grid">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Oportunidades de hoje</h2>
                  <p className="panel-context">O que fazer primeiro para vender mais</p>
                </div>
              </div>
              {data.opportunities.length === 0 ? (
                <EmptyState title="Nada urgente agora" hint="Sem vagas com fila, atrasos ou leads parados. Aproveite para divulgar as turmas com vaga." />
              ) : (
                <ul className="opportunities">
                  {data.opportunities.map((item) => (
                    <li key={item.id} className={`opportunity kind-${item.kind}`}>
                      <span className="opportunity-kind">{kindLabels[item.kind]}</span>
                      <div className="opportunity-text">
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </div>
                      {item.action.whatsapp ? (
                        <WhatsAppButton href={item.action.whatsapp} label={item.action.label} />
                      ) : item.action.href ? (
                        <button type="button" className="secondary-button" onClick={() => go(item.action.href!)}>
                          {item.action.label} <ArrowRight size={16} aria-hidden />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Vendas por dia</h2>
                  <p className="panel-context">Vendas menos cancelamentos no mês</p>
                </div>
                {goals.data?.canEdit ? (
                  <button type="button" className="secondary-button" onClick={() => setEditingGoals(true)}>
                    <Settings2 size={16} aria-hidden /> Metas
                  </button>
                ) : null}
              </div>
              <div className="panel-body">
                <DailySalesChart data={data.dailySales} line={line} />
                {!data.goal && goals.data?.canEdit ? <Notice>Defina a meta do mês para acompanhar quanto falta por dia útil.</Notice> : null}
              </div>
            </section>
          </div>
          {!data.features.businessLine ? (
            <Notice tone="warning">O CRM ainda não informa a linha de negócio dos serviços: tudo aparece como Studio até a atualização do CRM.</Notice>
          ) : null}
        </>
      ) : null}
      {editingGoals && goals.data ? (
        <GoalsDialog
          goals={goals.data}
          onClose={() => setEditingGoals(false)}
          onSaved={() => {
            setEditingGoals(false);
            goals.reload();
            overview.reload();
          }}
        />
      ) : null}
    </>
  );
}

function monthLabel(month: string): string {
  const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${names[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;
}

function toCents(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  return Math.round((Number(normalized) || 0) * 100);
}

function GoalsDialog({ goals, onClose, onSaved }: { goals: Goals; onClose: () => void; onSaved: () => void }) {
  const [studio, setStudio] = useState(String(goals.studio / 100));
  const [aesthetics, setAesthetics] = useState(String(goals.aesthetics / 100));
  const action = useAction();
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const saved = await action.run("/goals", "PUT", { studio: toCents(studio), aesthetics: toCents(aesthetics) });
    if (saved) onSaved();
  }
  return (
    <Modal title="Metas mensais" onClose={onClose} busy={action.busy} size="sm">
      <form className="form" onSubmit={save}>
        <label className="field">
          <span>Meta {businessLineLabels.studio} (R$)</span>
          <input inputMode="decimal" value={studio} onChange={(event) => setStudio(event.target.value)} />
        </label>
        <label className="field">
          <span>Meta {businessLineLabels.aesthetics} (R$)</span>
          <input inputMode="decimal" value={aesthetics} onChange={(event) => setAesthetics(event.target.value)} />
        </label>
        {action.error ? <p className="form-error">{action.error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>
            Voltar
          </button>
          <button type="submit" className="primary-button" disabled={action.busy}>
            {action.busy ? "Salvando…" : "Salvar metas"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
