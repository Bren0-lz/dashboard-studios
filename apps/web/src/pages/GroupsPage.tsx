import { AlertCircle, ChevronDown, Clock3, TrendingDown, UserPlus, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import {
  dayPeriodLabels,
  dayPeriodOf,
  formatMoney,
  initials,
  occupancyTone,
  shortDate,
  slotLabel,
  weekdayLong,
  type DayPeriod,
  type ExternalGroupMember,
  type GroupDetailsResponse,
  type GroupRow,
  type GroupsResponse,
} from "@dash/shared";
import { BranchSelect } from "../components/Layout";
import { canOpenPatient, PatientModal, type PatientRef } from "../components/PatientModal";
import { EmptyState, ErrorBanner, Kpi, MemberOverdueMark, Notice, PageHeader, Skeleton } from "../components/ui";
import { usePanelFilter, withFilter } from "../lib/filters";
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
  const [filter] = usePanelFilter();
  const { session } = useSession();
  const groups = useRemote<GroupsResponse>(withFilter("/groups", filter));
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
  const canEnroll = session.can.enroll || session.can.sellPlan;
  const columns = 6 + (showOverdue ? 1 : 0) + (canEnroll ? 1 : 0);
  const total = (pick: (group: GroupRow) => number) => rows.reduce((sum, group) => sum + pick(group), 0);
  // Turmas com a lista de matriculados aberta logo abaixo da linha.
  const [expanded, setExpanded] = useState<string[]>([]);
  const toggleMembers = (groupId: string) => setExpanded((current) => (current.includes(groupId) ? current.filter((item) => item !== groupId) : [...current, groupId]));
  // Ficha do cliente (PT8), aberta pelo nome na lista de matriculados; fechar volta à mesma tabela e filtros.
  const [patient, setPatient] = useState<PatientRef | null>(null);
  const selectMember = canOpenPatient(session.can) ? (member: ExternalGroupMember) => setPatient({ id: member.patientId, name: member.patientName }) : undefined;

  return (
    <>
      <PageHeader title="Onde tenho vaga para vender?" subtitle="Turmas ordenadas pela maior receita parada" actions={<BranchSelect />} />
      {groups.error ? <ErrorBanner message={groups.error} onRetry={groups.reload} /> : null}
      {!data && groups.loading ? <Skeleton rows={8} /> : null}
      {flow.ui}
      {patient ? <PatientModal patient={patient} onClose={() => setPatient(null)} /> : null}
      {data ? (
        <>
          <section className="kpi-grid kpi-grid-compact">
            <Kpi label="Vagas para vender" value={String(data.totals.freeSeats)} detail={`em ${data.totals.groups} turmas`} icon={<Users size={18} />} />
            <Kpi label="Receita parada" value={formatMoney(data.totals.idleRevenueInCents)} detail="por mês" tone="warn" icon={<TrendingDown size={18} />} iconTone="warn" />
            <Kpi
              label="Faturamento atual"
              value={formatMoney(data.totals.monthlyRevenueInCents)}
              detail={`potencial ${formatMoney(data.totals.potentialMonthlyRevenueInCents)}`}
              icon={<Wallet size={18} />}
              iconTone="good"
            />
            <Kpi label="Espera nas turmas" value={String(data.totals.waitlistCount)} detail="pessoas aguardando vaga" icon={<Clock3 size={18} />} iconTone="info" />
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
                {/* Larguras fixas (`table-layout: fixed` + `colgroup`): abrir a lista de matriculados não mexe nas colunas. */}
                <table className={["data-table groups-table", showOverdue ? "with-overdue" : "", canEnroll ? "with-actions" : ""].filter(Boolean).join(" ")} aria-label="Turmas">
                  <colgroup>
                    <col className="col-group" />
                    <col className="col-schedule" />
                    <col className="col-enrolled" />
                    <col className="col-free" />
                    {showOverdue ? <col className="col-overdue" /> : null}
                    <col className="col-money" />
                    <col className="col-money" />
                    {canEnroll ? <col className="col-actions" /> : null}
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">Turma</th>
                      <th scope="col">Horários</th>
                      <th scope="col" className="num">
                        Matriculados
                      </th>
                      <th scope="col" className="num">
                        Vagas disponíveis
                      </th>
                      {showOverdue ? (
                        <th scope="col" className="num">
                          Inadimplentes
                        </th>
                      ) : null}
                      <th scope="col" className="num">
                        Faturamento atual
                      </th>
                      <th scope="col" className="num">
                        Potencial (turma cheia)
                      </th>
                      {canEnroll ? <th scope="col" aria-label="Ações" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((group) => (
                      <GroupTableRow
                        key={group.id}
                        group={group}
                        showOverdue={showOverdue}
                        canEnroll={canEnroll}
                        columns={columns}
                        open={expanded.includes(group.id)}
                        onToggle={() => toggleMembers(group.id)}
                        onOpen={() => flow.open(group.id)}
                        onEnroll={() => flow.enroll(group)}
                        onSelectMember={selectMember}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      <td data-label="Horários" />
                      <td data-label="Matriculados" className="num">
                        {total((group) => group.enrolled)} de {total((group) => group.capacity)}
                      </td>
                      <td data-label="Vagas disponíveis" className="num">
                        {total((group) => group.freeSeats)}
                      </td>
                      {showOverdue ? (
                        <td data-label="Inadimplentes" className="num">
                          {total((group) => group.overdueMembers)}
                        </td>
                      ) : null}
                      <td data-label="Faturamento atual" className="num">
                        {formatMoney(total((group) => group.monthlyRevenueInCents))}
                      </td>
                      <td data-label="Potencial (turma cheia)" className="num">
                        {formatMoney(total((group) => group.potentialMonthlyRevenueInCents))}
                      </td>
                      {canEnroll ? <td className="cell-actions" /> : null}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {rows.length > 0 ? (
              <p className="groups-table-note muted">
                Valores por mês. O faturamento atual soma, para cada matriculado, o valor por sessão do plano ativo que cobre o serviço da turma multiplicado pelos encontros do mês
                (horários semanais × 4). O potencial acrescenta as vagas disponíveis pelo valor médio dos matriculados com plano (sem nenhum, pelo preço avulso do serviço).
              </p>
            ) : null}
          </section>
          {!data.features.overdue && session.can.seeFinance ? (
            <Notice tone="warning">O CRM ainda não informa a inadimplência por turma; a coluna aparece depois da atualização do CRM.</Notice>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function GroupTableRow({
  group,
  showOverdue,
  canEnroll,
  columns,
  open,
  onToggle,
  onOpen,
  onEnroll,
  onSelectMember,
}: {
  group: GroupRow;
  showOverdue: boolean;
  canEnroll: boolean;
  columns: number;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onEnroll: () => void;
  onSelectMember?: ((member: ExternalGroupMember) => void) | undefined;
}) {
  const membersId = `turma-${group.id}-matriculados`;
  return (
    <>
      <tr>
        <th scope="row" data-label="Turma">
          <button type="button" className="row-title" onClick={onOpen}>
            {group.name}
          </button>
          <span className="muted cell-sub">{group.professionalName}</span>
        </th>
        <td data-label="Horários" className="groups-table-schedule">
          {group.weeklySlots.length ? group.weeklySlots.map(slotLabel).join(", ") : "Horários ainda não definidos"}
        </td>
        <td data-label="Matriculados" className="num">
          <button
            type="button"
            className="members-toggle"
            aria-expanded={open}
            aria-controls={membersId}
            aria-label={`${open ? "Ocultar" : "Ver"} matriculados de ${group.name}: ${group.enrolled} de ${group.capacity}`}
            onClick={onToggle}
          >
            <span className="members-toggle-count">
              {group.enrolled} de {group.capacity}
              <ChevronDown size={16} aria-hidden />
            </span>
            <span className={`occupancy-track tone-${occupancyTone(group.occupancyPercent)}`} aria-hidden>
              <span className="occupancy-fill" style={{ "--fill": `${Math.min(100, group.occupancyPercent)}%` } as React.CSSProperties} />
            </span>
          </button>
        </td>
        <td data-label="Vagas disponíveis" className="num">
          {group.freeSeats}
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
        <td data-label="Faturamento atual" className="num">
          {formatMoney(group.monthlyRevenueInCents)}
        </td>
        <td data-label="Potencial (turma cheia)" className="num">
          {formatMoney(group.potentialMonthlyRevenueInCents)}
        </td>
        {canEnroll ? (
          <td className="cell-actions">
            <button type="button" className={group.freeSeats > 0 ? "primary-button small" : "secondary-button small"} onClick={onEnroll}>
              <UserPlus size={16} aria-hidden /> {group.freeSeats > 0 ? "Inscrever" : "Espera"}
            </button>
          </td>
        ) : null}
      </tr>
      {/* Linha própria abaixo da turma, ocupando todas as colunas: as células da turma não mudam. */}
      {open ? (
        <tr id={membersId} className="members-row">
          <td colSpan={columns}>
            <GroupMembers group={group} showOverdue={showOverdue} onSelect={onSelectMember} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function MemberCardContent({ member, showOverdue }: { member: ExternalGroupMember; showOverdue: boolean }) {
  return (
    <>
      <span className="avatar" aria-hidden>
        {initials(member.patientName)}
      </span>
      <strong>{member.patientName}</strong>
      <small className="muted">
        Desde {shortDate(member.startsOn)} · {member.monthlyInCents === null ? "Sem plano ativo" : `${formatMoney(member.monthlyInCents)}/mês`}
      </small>
      {showOverdue && member.overdue ? <MemberOverdueMark overdue={member.overdue} /> : null}
    </>
  );
}

/**
 * Matriculados da turma, carregados só quando a linha é aberta. Com `finance.view`, quem tem parcela
 * vencida aparece marcado como inadimplente. Com `onSelect` (quem tem `patients.view` ou `finance.view`),
 * o card inteiro de cada aluno é um botão que abre a ficha do cliente (PT8); sem ele, é só texto.
 */
function GroupMembers({ group, showOverdue, onSelect }: { group: Pick<GroupRow, "id" | "name">; showOverdue: boolean; onSelect?: ((member: ExternalGroupMember) => void) | undefined }) {
  const details = useRemote<GroupDetailsResponse>(`/groups/${group.id}`);
  if (details.error && !details.data) return <ErrorBanner message={details.error} onRetry={details.reload} />;
  if (!details.data) return <Skeleton rows={1} />;
  const members = details.data.members.filter((member) => member.status === "active");
  if (members.length === 0) return <p className="muted members-empty">Nenhum cliente matriculado.</p>;
  return (
    <ul className="members-list" aria-label={`Matriculados de ${group.name}`}>
      {members.map((member) => (
        <li key={member.enrollmentId} className={showOverdue && member.overdue ? "is-overdue" : undefined}>
          {onSelect ? (
            // O card inteiro abre a ficha (não só o nome); o nome acessível é o do aluno.
            <button type="button" className="member-card" onClick={() => onSelect(member)} aria-label={member.patientName} title="Ver ficha do cliente">
              <MemberCardContent member={member} showOverdue={showOverdue} />
            </button>
          ) : (
            <div className="member-card">
              <MemberCardContent member={member} showOverdue={showOverdue} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
