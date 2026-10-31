import { AlertCircle, Clock3, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  dayPeriodLabels,
  dayPeriodOf,
  formatMoney,
  weekdayLong,
  type DayPeriod,
  type GroupRow,
  type GroupsResponse,
} from "@dash/shared";
import { EmptyState, ErrorBanner, Kpi, LinePill, Notice, OccupancyBar, PageHeader, Skeleton } from "../components/ui";
import { useLineFilter, withLine } from "../lib/filters";
import { useGroupFlow } from "../lib/useGroupFlow";
import { useRemote } from "../lib/useRemote";
import { useSession } from "../lib/session";

interface Filters {
  weekday: string;
  period: "" | DayPeriod;
  professional: string;
  onlyFree: boolean;
  onlyOverdue: boolean;
}

const emptyFilters: Filters = { weekday: "", period: "", professional: "", onlyFree: false, onlyOverdue: false };

export function GroupsPage() {
  const [line] = useLineFilter();
  const { session } = useSession();
  const groups = useRemote<GroupsResponse>(withLine("/groups", line));
  const flow = useGroupFlow(groups.data?.features.planSale ?? false, groups.reload);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const data = groups.data;

  const professionals = useMemo(() => [...new Map((data?.groups ?? []).map((group) => [group.professionalId, group.professionalName])).entries()], [data]);
  const rows = useMemo(
    () =>
      (data?.groups ?? []).filter(
        (group) =>
          (!filters.weekday || group.weeklySlots.some((slot) => String(slot.weekday) === filters.weekday)) &&
          (!filters.period || group.weeklySlots.some((slot) => dayPeriodOf(slot.startTime) === filters.period)) &&
          (!filters.professional || group.professionalId === filters.professional) &&
          (!filters.onlyFree || group.freeSeats > 0) &&
          (!filters.onlyOverdue || group.overdueMembers > 0),
      ),
    [data, filters],
  );
  const filtered = JSON.stringify(filters) !== JSON.stringify(emptyFilters);
  const showOverdue = Boolean(data?.features.overdue && session.can.seeFinance);

  return (
    <>
      <PageHeader title="Onde tenho vaga para vender?" subtitle="Turmas ordenadas pela maior receita parada" />
      {groups.error ? <ErrorBanner message={groups.error} onRetry={groups.reload} /> : null}
      {!data && groups.loading ? <Skeleton rows={8} /> : null}
      {flow.ui}
      {data ? (
        <>
          <section className="kpi-grid kpi-grid-compact">
            <Kpi label="Vagas para vender" value={String(data.totals.freeSeats)} detail={`em ${data.totals.groups} turmas`} />
            <Kpi label="Receita parada" value={formatMoney(data.totals.idleRevenueInCents)} detail="por mês" tone="warn" />
            <Kpi label="Faturamento atual" value={formatMoney(data.totals.monthlyRevenueInCents)} detail={`potencial ${formatMoney(data.totals.potentialMonthlyRevenueInCents)}`} />
            <Kpi label="Espera nas turmas" value={String(data.totals.waitlistCount)} detail="pessoas aguardando vaga" />
          </section>
          <section className="panel">
            <div className="list-toolbar">
              <select aria-label="Dia da semana" value={filters.weekday} onChange={(event) => setFilters({ ...filters, weekday: event.target.value })}>
                <option value="">Todos os dias</option>
                {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                  <option key={day} value={day}>
                    {weekdayLong[day]}
                  </option>
                ))}
              </select>
              <select aria-label="Período" value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value as Filters["period"] })}>
                <option value="">Manhã, tarde e noite</option>
                {(Object.keys(dayPeriodLabels) as DayPeriod[]).map((period) => (
                  <option key={period} value={period}>
                    {dayPeriodLabels[period]}
                  </option>
                ))}
              </select>
              <select aria-label="Profissional" value={filters.professional} onChange={(event) => setFilters({ ...filters, professional: event.target.value })}>
                <option value="">Todos os profissionais</option>
                {professionals.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <label className="checkbox-field">
                <input type="checkbox" checked={filters.onlyFree} onChange={(event) => setFilters({ ...filters, onlyFree: event.target.checked })} /> Só com vagas
              </label>
              {showOverdue ? (
                <label className="checkbox-field">
                  <input type="checkbox" checked={filters.onlyOverdue} onChange={(event) => setFilters({ ...filters, onlyOverdue: event.target.checked })} /> Só com inadimplentes
                </label>
              ) : null}
              {filtered ? (
                <button type="button" className="link-button" onClick={() => setFilters(emptyFilters)}>
                  Limpar filtros
                </button>
              ) : null}
            </div>
            {rows.length === 0 ? (
              <EmptyState
                title={filtered ? "Nenhuma turma com esses filtros" : "Nenhuma turma ativa"}
                hint={filtered ? "Limpe os filtros para ver todas as turmas." : "Cadastre as turmas no CRM para vender as vagas por aqui."}
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table groups-table">
                  <thead>
                    <tr>
                      <th>Turma</th>
                      <th>Linha</th>
                      <th>Horários</th>
                      <th>Profissional</th>
                      <th>Ocupação</th>
                      <th className="num">Vagas</th>
                      <th className="num">Espera</th>
                      {showOverdue ? <th className="num">Inadimplentes</th> : null}
                      <th className="num">Atual / potencial</th>
                      <th className="num">Parada</th>
                      <th aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((group) => (
                      <GroupTableRow key={group.id} group={group} showOverdue={showOverdue} canEnroll={session.can.enroll || session.can.sellPlan} onOpen={() => flow.open(group.id)} onEnroll={() => flow.enroll(group)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {!data.features.overdue && session.can.seeFinance ? (
            <Notice tone="warning">O CRM ainda não informa a inadimplência por turma; a coluna aparece depois da atualização do CRM.</Notice>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function GroupTableRow({ group, showOverdue, canEnroll, onOpen, onEnroll }: { group: GroupRow; showOverdue: boolean; canEnroll: boolean; onOpen: () => void; onEnroll: () => void }) {
  return (
    <tr className="clickable" onClick={onOpen}>
      <td data-label="Turma">
        <button type="button" className="row-title" onClick={onOpen}>
          {group.name}
        </button>
        <span className="muted cell-sub">{group.serviceName}</span>
      </td>
      <td data-label="Linha">
        <LinePill line={group.businessLine} />
      </td>
      <td data-label="Horários">{group.schedule}</td>
      <td data-label="Profissional">{group.professionalName}</td>
      <td data-label="Ocupação">
        <OccupancyBar enrolled={group.enrolled} capacity={group.capacity} percent={group.occupancyPercent} />
      </td>
      <td data-label="Vagas" className="num">
        <strong className={group.freeSeats > 0 ? "text-good" : "muted"}>{group.freeSeats}</strong>
      </td>
      <td data-label="Espera" className="num">
        {group.waitlistCount > 0 ? (
          <span className="icon-count" title="Pessoas na espera da turma">
            <Clock3 size={14} aria-hidden /> {group.waitlistCount}
          </span>
        ) : (
          <span className="muted">0</span>
        )}
      </td>
      {showOverdue ? (
        <td data-label="Inadimplentes" className="num">
          {group.overdueMembers > 0 ? (
            <span className="icon-count text-bad" title={`${group.overdueMembers} em atraso`}>
              <AlertCircle size={14} aria-hidden /> {group.overdueMembers} · {formatMoney(group.overdueInCents)}
            </span>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
      ) : null}
      <td data-label="Atual / potencial" className="num">
        {formatMoney(group.monthlyRevenueInCents)}
        <span className="muted cell-sub">de {formatMoney(group.potentialMonthlyRevenueInCents)}</span>
      </td>
      <td data-label="Parada" className="num">
        <strong className={group.idleRevenueInCents > 0 ? "text-warn" : "muted"}>{formatMoney(group.idleRevenueInCents)}</strong>
      </td>
      <td className="cell-actions" onClick={(event) => event.stopPropagation()}>
        {canEnroll ? (
          <button type="button" className={group.freeSeats > 0 ? "primary-button small" : "secondary-button small"} onClick={onEnroll}>
            <UserPlus size={16} aria-hidden /> {group.freeSeats > 0 ? "Inscrever" : "Espera"}
          </button>
        ) : null}
      </td>
    </tr>
  );
}
