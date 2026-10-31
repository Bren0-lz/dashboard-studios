import { AlertCircle, Clock3 } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addDays,
  monthEnd,
  monthStart,
  occupancyHeatmap,
  occupancyTone,
  todayInClinic,
  weekdayLong,
  weekdayOf,
  weekdayShort,
  type GroupRow,
  type GroupsResponse,
} from "@dash/shared";
import { EmptyState, ErrorBanner, PageHeader, Skeleton } from "../components/ui";
import { useLineFilter, withLine } from "../lib/filters";
import { useGroupFlow } from "../lib/useGroupFlow";
import { useRemote } from "../lib/useRemote";

type View = "semana" | "mes" | "calor";
const weekOrder = [1, 2, 3, 4, 5, 6, 0];

interface Block {
  group: GroupRow;
  weekday: number;
  startTime: string;
  endTime: string;
}

export function CalendarPage() {
  const [line] = useLineFilter();
  const [params, setParams] = useSearchParams();
  const view = (["semana", "mes", "calor"].includes(params.get("vista") ?? "") ? params.get("vista") : "semana") as View;
  const groups = useRemote<GroupsResponse>(withLine("/groups", line));
  const flow = useGroupFlow(groups.data?.features.planSale ?? false, groups.reload);
  const active = useMemo(() => (groups.data?.groups ?? []).filter((group) => group.active), [groups.data]);
  const blocks = useMemo(
    () =>
      active
        .flatMap((group) => group.weeklySlots.map((slot) => ({ group, ...slot })))
        .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.group.name.localeCompare(b.group.name, "pt-BR")),
    [active],
  );
  const setView = (next: View) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        copy.set("vista", next);
        return copy;
      },
      { replace: true },
    );

  return (
    <>
      <PageHeader
        title="Quais horários estão vazios?"
        subtitle="Verde = cheia · amarelo = parcial · vermelho = vazia. Borda azul = Studio, rosa = Estética."
        actions={
          <div className="segmented" role="group" aria-label="Visão do calendário">
            {(
              [
                ["semana", "Semana"],
                ["mes", "Mês"],
                ["calor", "Mapa de calor"],
              ] as [View, string][]
            ).map(([value, label]) => (
              <button key={value} type="button" className={view === value ? "active" : ""} aria-pressed={view === value} onClick={() => setView(value)}>
                {label}
              </button>
            ))}
          </div>
        }
      />
      {groups.error ? <ErrorBanner message={groups.error} onRetry={groups.reload} /> : null}
      {!groups.data && groups.loading ? <Skeleton rows={8} /> : null}
      {flow.ui}
      {groups.data && blocks.length === 0 ? (
        <section className="panel">
          <EmptyState title="Nenhuma turma com horário" hint="As turmas ativas do CRM aparecem aqui pelo horário fixo." />
        </section>
      ) : null}
      {groups.data && blocks.length > 0 ? (
        <section className="panel">
          {view === "semana" ? <WeekView blocks={blocks} onOpen={flow.open} /> : null}
          {view === "mes" ? <MonthView blocks={blocks} onOpen={flow.open} /> : null}
          {view === "calor" ? <HeatmapView groups={active} /> : null}
        </section>
      ) : null}
    </>
  );
}

function BlockCard({ block, onOpen, compact = false }: { block: Block; onOpen: (id: string) => void; compact?: boolean }) {
  const { group } = block;
  return (
    <button
      type="button"
      className={`cal-block tone-${occupancyTone(group.occupancyPercent)} line-${group.businessLine}${compact ? " compact" : ""}`}
      onClick={() => onOpen(group.id)}
      title={`${group.name} · ${block.startTime}–${block.endTime} · ${group.enrolled}/${group.capacity}`}
    >
      <span className="cal-block-name">{group.name}</span>
      <span className="cal-block-meta">
        {compact ? null : <span>{block.startTime}</span>}
        <span>
          {group.enrolled}/{group.capacity}
        </span>
        {group.waitlistCount > 0 ? (
          <span className="icon-count" aria-label={`${group.waitlistCount} na espera`}>
            <Clock3 size={12} aria-hidden />
            {group.waitlistCount}
          </span>
        ) : null}
        {group.overdueMembers > 0 ? (
          <span className="icon-count text-bad" aria-label={`${group.overdueMembers} inadimplentes`}>
            <AlertCircle size={12} aria-hidden />
            {group.overdueMembers}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function WeekView({ blocks, onOpen }: { blocks: Block[]; onOpen: (id: string) => void }) {
  const hours = [...new Set(blocks.map((block) => Number(block.startTime.slice(0, 2))))].sort((a, b) => a - b);
  const days = weekOrder.filter((day) => day !== 0 || blocks.some((block) => block.weekday === 0));
  return (
    <>
      <div className="week-grid" role="grid" aria-label="Grade semanal" data-days={days.length}>
        <div className="week-corner" />
        {days.map((day) => (
          <div key={day} className="week-day" role="columnheader">
            {weekdayShort[day]}
          </div>
        ))}
        {hours.map((hour) => (
          <div key={hour} className="week-row" role="row">
            <div className="week-hour" role="rowheader">
              {String(hour).padStart(2, "0")}h
            </div>
            {days.map((day) => (
              <div key={day} className="week-cell" role="gridcell">
                {blocks
                  .filter((block) => block.weekday === day && Number(block.startTime.slice(0, 2)) === hour)
                  .map((block) => (
                    <BlockCard key={`${block.group.id}-${block.weekday}-${block.startTime}`} block={block} onOpen={onOpen} />
                  ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Celular: lista por dia. */}
      <div className="day-list">
        {days.map((day) => {
          const own = blocks.filter((block) => block.weekday === day);
          if (own.length === 0) return null;
          return (
            <div key={day} className="day-list-group">
              <h3>{weekdayLong[day]}</h3>
              {own.map((block) => (
                <BlockCard key={`${block.group.id}-${block.startTime}`} block={block} onOpen={onOpen} />
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

function MonthView({ blocks, onOpen }: { blocks: Block[]; onOpen: (id: string) => void }) {
  const today = todayInClinic();
  const month = today.slice(0, 7);
  const first = monthStart(month);
  const last = monthEnd(month);
  const lead = (weekdayOf(first) + 6) % 7;
  const days: (string | null)[] = [...Array.from({ length: lead }, () => null)];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return (
    <div className="month-grid">
      {weekOrder.map((day) => (
        <div key={day} className="month-head">
          {weekdayShort[day]}
        </div>
      ))}
      {days.map((day, index) =>
        day ? (
          <div key={day} className={`month-cell${day === today ? " today" : ""}${day < today ? " past" : ""}`}>
            <span className="month-date">{Number(day.slice(8, 10))}</span>
            {blocks
              .filter((block) => block.weekday === weekdayOf(day))
              .map((block) => (
                <BlockCard key={`${block.group.id}-${block.startTime}`} block={block} onOpen={onOpen} compact />
              ))}
          </div>
        ) : (
          <div key={`empty-${index}`} className="month-cell empty" />
        ),
      )}
    </div>
  );
}

function HeatmapView({ groups }: { groups: GroupRow[] }) {
  const cells = occupancyHeatmap(groups);
  const hours = [...new Set(cells.map((cell) => cell.hour))].sort((a, b) => a - b);
  const days = weekOrder.filter((day) => day !== 0 || cells.some((cell) => cell.weekday === 0));
  return (
    <div className="panel-body">
      <p className="panel-context">Ocupação média por dia e horário. Vermelho com fila zero: divulgue. Verde com espera: abra turma nova.</p>
      <div className="table-wrap">
        <table className="heatmap">
          <thead>
            <tr>
              <th />
              {days.map((day) => (
                <th key={day}>{weekdayShort[day]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((hour) => (
              <tr key={hour}>
                <th>{String(hour).padStart(2, "0")}h</th>
                {days.map((day) => {
                  const cell = cells.find((item) => item.weekday === day && item.hour === hour);
                  if (!cell) return <td key={day} className="heat-empty" />;
                  return (
                    <td key={day} className={`heat tone-${occupancyTone(cell.occupancyPercent)}`} title={`${cell.groups} turma(s) · ${cell.freeSeats} vaga(s) · ${cell.waitlist} na espera`}>
                      <strong>{cell.occupancyPercent}%</strong>
                      <span>{cell.waitlist > 0 ? `${cell.waitlist} na espera` : `${cell.freeSeats} vagas`}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
