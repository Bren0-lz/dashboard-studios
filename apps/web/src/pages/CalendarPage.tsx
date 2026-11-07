import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addDays,
  initials,
  monthEnd,
  monthStart,
  occupancyHeatmap,
  occupancyTone,
  parseIsoDate,
  plural,
  todayInClinic,
  weekStart,
  weekdayOf,
  weekdayShort,
  type GroupRow,
  type GroupsResponse,
} from "@dash/shared";
import { MemberAvatars } from "../components/MemberAvatars";
import { EmptyState, ErrorBanner, Modal, PageHeader, Skeleton } from "../components/ui";
import { usePanelFilter, withFilter } from "../lib/filters";
import { useGroupFlow } from "../lib/useGroupFlow";
import { useRemote } from "../lib/useRemote";

/**
 * Calendário no mesmo formato da Agenda do CRM (Dia, Semana e Mês). As turmas se repetem pelo
 * horário fixo semanal; a bolinha tem a cor do profissional e o fundo, a cor da ocupação.
 */
type View = "dia" | "semana" | "mes" | "calor";
type DayLayout = "grade" | "lista";

const views: [View, string][] = [
  ["dia", "Dia"],
  ["semana", "Semana"],
  ["mes", "Mês"],
  ["calor", "Mapa de calor"],
];
const weekOrder = [1, 2, 3, 4, 5, 6, 0];
// Mesma paleta das cores de nota da agenda do CRM (sem cinza e amarelo, de pouco contraste).
const professionalPalette = ["#276749", "#2563eb", "#7c3aed", "#db2777", "#0d9488", "#ea580c", "#dc2626"];
const occupancyLegend = [
  { tone: "green", label: "Cheia" },
  { tone: "yellow", label: "Parcial" },
  { tone: "red", label: "Vazia" },
] as const;

interface Session {
  key: string;
  group: GroupRow;
  date: string;
  startTime: string;
  endTime: string;
}

// Datas são dias puros (aaaa-mm-dd), formatadas em UTC.
const dayTitle = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long" });
const modalTitle = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const monthTitle = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });
const shortDay = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short" });
const fullDay = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

function monthName(iso: string, style: "long" | "short") {
  return parseIsoDate(iso).toLocaleDateString("pt-BR", { timeZone: "UTC", month: style });
}

/** "19 – 25 de outubro", "28 de set. – 4 de out." ou com o ano quando a semana o atravessa (igual ao CRM). */
export function weekRangeLabel(start: string, end: string) {
  const day = (iso: string) => Number(iso.slice(8, 10));
  if (start.slice(0, 4) !== end.slice(0, 4))
    return `${day(start)} de ${monthName(start, "short")} de ${start.slice(0, 4)} – ${day(end)} de ${monthName(end, "short")} de ${end.slice(0, 4)}`;
  if (start.slice(0, 7) !== end.slice(0, 7)) return `${day(start)} de ${monthName(start, "short")} – ${day(end)} de ${monthName(end, "short")}`;
  return `${day(start)} – ${day(end)} de ${monthName(start, "long")}`;
}

function minutesOf(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function colorStyle(color: string | undefined): CSSProperties | undefined {
  return color ? ({ "--pro-color": color } as CSSProperties) : undefined;
}

function toneClass(group: GroupRow) {
  return `occ-${occupancyTone(group.occupancyPercent)}`;
}

function seatsLabel(group: GroupRow) {
  return `${group.enrolled}/${group.capacity} alunos${group.waitlistCount > 0 ? ` · ${group.waitlistCount} na espera` : ""}`;
}

/** Bolinhas dos alunos nos cartões do calendário (só visuais: o cartão inteiro já abre a turma). */
function Members({ group, max, size = "sm" }: { group: GroupRow; max: number; size?: "sm" | "md" }) {
  const names = group.memberNames;
  if (!names) return null;
  if (names.length === 0) return <span className="calendar-members-empty">Nenhum aluno ainda</span>;
  return <MemberAvatars names={names} groupName={group.name} max={max} size={size} />;
}

export function CalendarPage() {
  const [filter] = usePanelFilter();
  const [params, setParams] = useSearchParams();
  const view = (views.some(([value]) => value === params.get("vista")) ? params.get("vista") : "semana") as View;
  const groups = useRemote<GroupsResponse>(withFilter("/groups", filter));
  const flow = useGroupFlow(groups.data?.features.planSale ?? false, groups.reload);
  const [selectedDate, setSelectedDate] = useState(todayInClinic);
  const [dayLayout, setDayLayout] = useState<DayLayout>("grade");
  const [professionalFilter, setProfessionalFilter] = useState("");
  const [eventsDay, setEventsDay] = useState<string | null>(null);
  const today = todayInClinic();

  const active = useMemo(() => (groups.data?.groups ?? []).filter((group) => group.active && group.weeklySlots.length > 0), [groups.data]);
  const professionals = useMemo(() => {
    const unique = new Map<string, string>();
    for (const group of active) unique.set(group.professionalId, group.professionalName);
    return [...unique]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((item, index) => ({ ...item, color: professionalPalette[index % professionalPalette.length]! }));
  }, [active]);
  const professionalColors = useMemo(() => new Map(professionals.map((item) => [item.id, item.color])), [professionals]);
  const shown = useMemo(() => (professionalFilter ? active.filter((group) => group.professionalId === professionalFilter) : active), [active, professionalFilter]);

  const sessionsOn = (date: string): Session[] => {
    const weekday = weekdayOf(date);
    return shown
      .flatMap((group) =>
        group.weeklySlots
          .filter((slot) => slot.weekday === weekday)
          .map((slot) => ({ key: `${group.id}-${date}-${slot.startTime}`, group, date, startTime: slot.startTime, endTime: slot.endTime })),
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.group.name.localeCompare(b.group.name, "pt-BR"));
  };

  const firstOfWeek = weekStart(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(firstOfWeek, index));
  const month = selectedDate.slice(0, 7);
  const firstOfMonth = monthStart(month);
  const monthGridStart = weekStart(firstOfMonth);
  const monthGridLength = Math.ceil(((weekOrder.indexOf(weekdayOf(firstOfMonth)) + Number(monthEnd(month).slice(8, 10))) / 7)) * 7;
  const monthDays = Array.from({ length: monthGridLength }, (_, index) => addDays(monthGridStart, index));

  const setView = (next: View) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        copy.set("vista", next);
        return copy;
      },
      { replace: true },
    );

  function moveDay(amount: number) {
    setSelectedDate((current) => {
      if (view !== "mes") return addDays(current, amount * (view === "semana" ? 7 : 1));
      const [year, monthNumber] = current.split("-").map(Number);
      const target = new Date(Date.UTC(year ?? 1970, (monthNumber ?? 1) - 1 + amount, 1)).toISOString().slice(0, 7);
      const lastDay = Number(monthEnd(target).slice(8, 10));
      return `${target}-${String(Math.min(Number(current.slice(8, 10)), lastDay)).padStart(2, "0")}`;
    });
  }

  const daySessions = sessionsOn(selectedDate);
  const showCalendar = view !== "calor";

  return (
    <>
      <PageHeader title="Quais horários estão vazios?" subtitle="Turmas pelo horário fixo, no mesmo formato da agenda do CRM. Fundo verde = cheia · amarelo = parcial · vermelho = vazia." />
      {groups.error ? <ErrorBanner message={groups.error} onRetry={groups.reload} /> : null}
      {flow.ui}
      <section className="panel agenda-panel">
        <div className="agenda-toolbar">
          {showCalendar ? (
            <div className="date-navigator">
              <span className="agenda-calendar-icon" aria-hidden="true">
                <CalendarDays size={22} />
              </span>
              <button type="button" className="icon-button" onClick={() => moveDay(-1)} aria-label={view === "mes" ? "Mês anterior" : view === "semana" ? "Semana anterior" : "Dia anterior"}>
                <ChevronLeft size={19} />
              </button>
              <button type="button" className="date-button" onClick={() => setSelectedDate(todayInClinic())}>
                <strong>
                  {view === "mes" ? monthTitle.format(parseIsoDate(selectedDate)) : view === "semana" ? weekRangeLabel(firstOfWeek, weekDays[6]!) : dayTitle.format(parseIsoDate(selectedDate))}
                </strong>
                <small>
                  {view === "mes"
                    ? "Voltar para hoje"
                    : view === "semana"
                      ? `${shortDay.format(parseIsoDate(firstOfWeek))} — ${shortDay.format(parseIsoDate(weekDays[6]!))}`
                      : selectedDate === today
                        ? "Hoje"
                        : "Voltar para hoje"}
                </small>
              </button>
              <button type="button" className="icon-button" onClick={() => moveDay(1)} aria-label={view === "mes" ? "Próximo mês" : view === "semana" ? "Próxima semana" : "Próximo dia"}>
                <ChevronRight size={19} />
              </button>
            </div>
          ) : (
            <div className="agenda-heading">
              <strong>Ocupação média por dia e horário</strong>
              <small>Vermelho com fila zero: divulgue. Verde com espera: abra turma nova.</small>
            </div>
          )}
          <div className="agenda-toolbar-end">
            <div className="view-toggle" role="group" aria-label="Visualização do calendário">
              {views.map(([value, label]) => (
                <button key={value} type="button" className={`tab-button ${view === value ? "active" : ""}`} aria-pressed={view === value} onClick={() => setView(value)}>
                  {label}
                </button>
              ))}
            </div>
            <ul className="agenda-status-legend" aria-label="Legenda da ocupação">
              {occupancyLegend.map((item) => (
                <li key={item.tone}>
                  <i className={`appt-status-swatch occ-${item.tone}`} />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {professionals.length > 0 || (view === "dia" && groups.data) ? (
          <div className="agenda-professionals">
            {professionals.length > 0 ? (
              <>
                <span className="agenda-legend-label">Profissionais</span>
                <div className="legend" aria-label="Legenda dos profissionais">
                  {professionals.map((professional) => (
                    <span key={professional.id}>
                      <i className="pro-dot" style={colorStyle(professional.color)} aria-hidden="true" />
                      {professional.name.replace(/Dra?\. /, "")}
                    </span>
                  ))}
                </div>
                <label className="agenda-professional-filter">
                  Profissional
                  <select value={professionalFilter} onChange={(event) => setProfessionalFilter(event.target.value)}>
                    <option value="">Todos os profissionais</option>
                    {professionals.map((professional) => (
                      <option key={professional.id} value={professional.id}>
                        {professional.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {view === "dia" ? (
              <div className="view-toggle agenda-day-layout" role="group" aria-label="Formato do dia">
                <button type="button" className={`tab-button ${dayLayout === "grade" ? "active" : ""}`} aria-pressed={dayLayout === "grade"} onClick={() => setDayLayout("grade")}>
                  Grade
                </button>
                <button type="button" className={`tab-button ${dayLayout === "lista" ? "active" : ""}`} aria-pressed={dayLayout === "lista"} onClick={() => setDayLayout("lista")}>
                  Lista
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {!groups.data ? (
          groups.loading ? (
            <div className="agenda-loading">
              <Skeleton rows={8} label="Carregando turmas" />
            </div>
          ) : null
        ) : active.length === 0 ? (
          <EmptyState title="Nenhuma turma com horário" hint="As turmas ativas do CRM aparecem aqui pelo horário fixo." />
        ) : view === "calor" ? (
          <HeatmapView groups={shown} />
        ) : view === "mes" ? (
          <div className="month-agenda">
            <div className="month-weekdays" aria-hidden="true">
              {weekOrder.map((day) => (
                <span key={day}>{weekdayShort[day]}</span>
              ))}
            </div>
            <div className="month-grid">
              {monthDays.map((day) => {
                const sessions = sessionsOn(day);
                return (
                  <div
                    key={day}
                    className={`month-day ${day.slice(0, 7) !== month ? "outside" : ""} ${day === today ? "today" : ""} ${day === selectedDate ? "selected" : ""}`}
                    onClick={(event) => {
                      // Botões internos (turma, "ver todos") têm ação própria.
                      if (!(event.target as HTMLElement).closest("button")) setEventsDay(day);
                    }}
                  >
                    <button type="button" className="month-day-head" onClick={() => setEventsDay(day)} aria-label={`${fullDay.format(parseIsoDate(day))}: ${plural(sessions.length, "aula de turma", "aulas de turma")}`}>
                      <strong>{Number(day.slice(8, 10))}</strong>
                      {sessions.length > 0 ? <small>{plural(sessions.length, "aula", "aulas")}</small> : null}
                    </button>
                    <span className="month-day-events">
                      {sessions.slice(0, 2).map((session) => (
                        <button
                          type="button"
                          key={session.key}
                          className={`month-group ${toneClass(session.group)}`}
                          style={colorStyle(professionalColors.get(session.group.professionalId))}
                          title={`${session.group.name} · ${session.group.professionalName} · ${session.group.roomName} · ${seatsLabel(session.group)}`}
                          onClick={() => flow.open(session.group.id)}
                        >
                          <span className="month-event-time">
                            <i className="pro-dot" aria-hidden="true" />
                            <time>
                              {session.startTime}–{session.endTime}
                            </time>
                          </span>
                          <span className="month-event-name group-name">{session.group.name}</span>
                        </button>
                      ))}
                      {sessions.length > 2 ? (
                        <button type="button" className="month-more" onClick={() => setEventsDay(day)}>
                          +{sessions.length - 2} {sessions.length - 2 === 1 ? "evento" : "eventos"}
                        </button>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : view === "semana" ? (
          <div className="week-agenda" role="region" aria-label="Agenda da semana">
            {weekDays.map((day) => {
              const sessions = sessionsOn(day);
              return (
                <section key={day}>
                  <header className={day === today ? "today" : ""}>
                    <span>{weekdayShort[weekdayOf(day)]}</span>
                    <strong>{Number(day.slice(8, 10))}</strong>
                  </header>
                  <div>
                    {sessions.map((session) => (
                      <WeekCard key={session.key} session={session} color={professionalColors.get(session.group.professionalId)} onOpen={flow.open} />
                    ))}
                    {sessions.length === 0 ? <span className="week-empty">Livre</span> : null}
                  </div>
                </section>
              );
            })}
          </div>
        ) : dayLayout === "grade" ? (
          <div className="day-agenda">
            <DayScheduleGrid
              sessions={daySessions}
              professionals={professionalFilter ? professionals.filter((item) => item.id === professionalFilter) : professionals}
              onOpen={flow.open}
            />
          </div>
        ) : daySessions.length === 0 ? (
          <EmptyState title="Dia disponível" hint="Nenhuma turma tem aula nesta data." />
        ) : (
          <div className="day-agenda">
            <header className="agenda-day-heading">
              <h2>Programação do dia</h2>
              <span>{plural(daySessions.length, "evento", "eventos")}</span>
            </header>
            {daySessions.map((session) => (
              <DayCard key={session.key} session={session} color={professionalColors.get(session.group.professionalId)} onOpen={flow.open} />
            ))}
          </div>
        )}
      </section>
      {eventsDay ? (
        <DayEventsModal
          day={eventsDay}
          sessions={sessionsOn(eventsDay)}
          professionalColors={professionalColors}
          onClose={() => setEventsDay(null)}
          onOpen={(id) => {
            setEventsDay(null);
            flow.open(id);
          }}
          onOpenDay={() => {
            setSelectedDate(eventsDay);
            setEventsDay(null);
            setView("dia");
          }}
        />
      ) : null}
    </>
  );
}

function WeekCard({ session, color, onOpen }: { session: Session; color: string | undefined; onOpen: (id: string) => void }) {
  const { group } = session;
  return (
    <button
      type="button"
      className={`week-appointment group-class ${toneClass(group)}`}
      style={colorStyle(color)}
      aria-label={`${group.name}, ${session.startTime} a ${session.endTime}, ${seatsLabel(group)}`}
      onClick={() => onOpen(group.id)}
    >
      <time className="week-appointment-time">
        {session.startTime}–{session.endTime}
      </time>
      <strong className="group-name" title={group.name}>
        {group.name}
      </strong>
      <span className="week-appointment-meta">
        {group.professionalName} · {group.roomName}
      </span>
      <span className="week-appointment-foot">
        <Members group={group} max={4} />
        <span className="week-appointment-seats">
          {group.enrolled}/{group.capacity}
        </span>
      </span>
      {group.waitlistCount > 0 ? (
        <span className="week-appointment-waitlist">
          <Clock3 size={12} aria-hidden /> {group.waitlistCount} na espera
        </span>
      ) : null}
    </button>
  );
}

function DayCard({ session, color, onOpen }: { session: Session; color: string | undefined; onOpen: (id: string) => void }) {
  const { group } = session;
  return (
    <article className={`agenda-card group-class ${toneClass(group)}`} style={colorStyle(color)} aria-label={group.name}>
      <div className="agenda-time">
        <strong>{session.startTime}</strong>
        <span>{session.endTime}</span>
      </div>
      <div className="agenda-main">
        <div>
          <span className="service-name">
            <i className="pro-dot" aria-hidden="true" />
            {group.serviceName || "Aula em grupo"}
          </span>
          <h3 className="group-name" title={group.name}>
            {group.name}
          </h3>
          <p>
            {group.professionalName} · {group.roomName}
          </p>
          <div className="agenda-card-members">
            <Members group={group} max={8} size="md" />
            <span className="agenda-card-seats">{seatsLabel(group)}</span>
          </div>
        </div>
        <button type="button" className="secondary-button" onClick={() => onOpen(group.id)}>
          Abrir turma
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

const SLOT_MINUTES = 30;

interface Cluster {
  startSlot: number;
  span: number;
  sessions: Session[];
}

/** Agrupa aulas que se sobrepõem numa coluna e calcula as linhas que ocupam (igual ao CRM). */
function clustersFor(sessions: Session[], firstMinute: number, slots: number) {
  const clusters: Cluster[] = [];
  let current: { start: number; end: number; sessions: Session[] } | null = null;
  const close = () => {
    if (!current) return;
    const startSlot = Math.max(0, Math.floor((current.start - firstMinute) / SLOT_MINUTES));
    const endSlot = Math.min(slots, Math.max(startSlot + 1, Math.ceil((current.end - firstMinute) / SLOT_MINUTES)));
    clusters.push({ startSlot, span: endSlot - startSlot, sessions: current.sessions });
  };
  for (const session of [...sessions].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    const start = minutesOf(session.startTime);
    const end = Math.max(start + 1, minutesOf(session.endTime));
    if (current && start < current.end) {
      current.end = Math.max(current.end, end);
      current.sessions.push(session);
    } else {
      close();
      current = { start, end, sessions: [session] };
    }
  }
  close();
  return clusters;
}

/** Visão Dia em grade: linhas de 30 minutos e uma coluna por profissional, como no CRM. */
function DayScheduleGrid({ sessions, professionals, onOpen }: { sessions: Session[]; professionals: { id: string; name: string; color: string }[]; onOpen: (id: string) => void }) {
  // Das 7h às 21h, ampliado para caber o que estiver fora desse horário.
  const hours = sessions.flatMap((session) => [Math.floor(minutesOf(session.startTime) / 60), Math.ceil(minutesOf(session.endTime) / 60)]);
  const firstHour = Math.max(0, Math.min(7, ...hours));
  const lastHour = Math.min(24, Math.max(21, ...hours));
  const slots = ((lastHour - firstHour) * 60) / SLOT_MINUTES;
  const columnClusters = new Map(
    professionals.map((column) => [
      column.id,
      clustersFor(
        sessions.filter((session) => session.group.professionalId === column.id),
        firstHour * 60,
        slots,
      ),
    ]),
  );
  const slotLabel = (slot: number) => {
    const minutes = firstHour * 60 + slot * SLOT_MINUTES;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  };

  return (
    <div className="day-grid-scroll">
      {sessions.length === 0 ? (
        <p className="day-grid-empty">
          <strong>Dia disponível</strong> · nenhuma turma tem aula nesta data.
        </p>
      ) : null}
      <table className="day-grid" aria-label="Agenda do dia por profissional">
        <thead>
          <tr>
            <th scope="col" className="day-grid-time">
              <span className="sr-only">Horário</span>
            </th>
            {professionals.map((column) => (
              <th scope="col" key={column.id}>
                <span className="avatar pro-avatar" style={colorStyle(column.color)} aria-hidden="true">
                  {initials(column.name)}
                </span>
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: slots }, (_, slot) => (
            <tr key={slot} className={slot % 2 ? "half-hour" : undefined}>
              <th scope="row" className="day-grid-time">
                {slot % 2 === 0 ? slotLabel(slot) : ""}
              </th>
              {professionals.map((column) => {
                const clusters = columnClusters.get(column.id) ?? [];
                const cluster = clusters.find((item) => item.startSlot === slot);
                if (cluster)
                  return (
                    <td key={column.id} rowSpan={cluster.span} className="day-grid-busy">
                      {cluster.sessions.map((session) => (
                        <button
                          type="button"
                          key={session.key}
                          className={`day-grid-event day-grid-group ${toneClass(session.group)}`}
                          aria-label={`${session.group.name}, ${session.startTime} a ${session.endTime}`}
                          onClick={() => onOpen(session.group.id)}
                        >
                          <time>
                            {session.startTime}–{session.endTime}
                          </time>
                          <strong className="group-name" title={session.group.name}>
                            {session.group.name}
                          </strong>
                          <span>{session.group.roomName}</span>
                          <span className="day-grid-event-foot">
                            <Members group={session.group} max={4} />
                            <span>
                              {session.group.enrolled}/{session.group.capacity}
                            </span>
                          </span>
                        </button>
                      ))}
                    </td>
                  );
                if (clusters.some((item) => slot > item.startSlot && slot < item.startSlot + item.span)) return null;
                return <td key={column.id} className="day-grid-free" />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayEventsModal({
  day,
  sessions,
  professionalColors,
  onClose,
  onOpen,
  onOpenDay,
}: {
  day: string;
  sessions: Session[];
  professionalColors: Map<string, string>;
  onClose: () => void;
  onOpen: (id: string) => void;
  onOpenDay: () => void;
}) {
  const title = modalTitle.format(parseIsoDate(day));
  return (
    <Modal title={title.charAt(0).toUpperCase() + title.slice(1)} onClose={onClose}>
      <div className="day-events">
        <p className="panel-context">{sessions.length === 0 ? "Nenhum evento neste dia." : `${plural(sessions.length, "evento", "eventos")} neste dia.`}</p>
        {sessions.length > 0 ? (
          <ul className="day-events-list">
            {sessions.map((session) => (
              <li key={session.key}>
                <button type="button" className={`day-event group ${toneClass(session.group)}`} onClick={() => onOpen(session.group.id)} aria-label={`Abrir ${session.group.name}`}>
                  <time>
                    {session.startTime}–{session.endTime}
                  </time>
                  <span>
                    <strong>
                      <i className="pro-dot" style={colorStyle(professionalColors.get(session.group.professionalId))} aria-hidden="true" />
                      {session.group.name}
                    </strong>
                    <small>
                      {session.group.professionalName} · {session.group.roomName} · {seatsLabel(session.group)}
                    </small>
                    <Members group={session.group} max={6} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onOpenDay}>
            Abrir dia no calendário
          </button>
        </div>
      </div>
    </Modal>
  );
}

function HeatmapView({ groups }: { groups: GroupRow[] }) {
  const cells = occupancyHeatmap(groups);
  const hours = [...new Set(cells.map((cell) => cell.hour))].sort((a, b) => a - b);
  const days = weekOrder.filter((day) => day !== 0 || cells.some((cell) => cell.weekday === 0));
  return (
    <div className="panel-body heatmap-body">
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
