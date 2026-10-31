/**
 * Inteligência de faturamento (seção 5 do planejamento): regras simples e transparentes,
 * calculadas a partir dos dados da API do CRM.
 */
import { lineOf } from "./business-line.js";
import type {
  ExternalGroupRow,
  ExternalOverdueRow,
  Lead,
  LeadStageConfig,
  WaitlistEntry,
} from "./crm-types.js";
import { daysBetween, monthEnd, workingDaysBetween, addDays } from "./dates.js";
import type { CompatibleGroup, GoalProgress, GroupRow, HeatCell, Opportunity, OverdueRowView } from "./dashboard-types.js";
import { firstName, formatMoney, plural } from "./format.js";
import { overdueBand } from "./overdue.js";
import { dayPeriodLabels, dayPeriodOf, type DayPeriod } from "./occupancy.js";
import { weekdayLong } from "./format.js";

export const activeWaitlistStatuses = ["waiting", "contacted"] as const;

export function isActiveWaitlist(entry: Pick<WaitlistEntry, "status">): boolean {
  return (activeWaitlistStatuses as readonly string[]).includes(entry.status);
}

/** Ticket médio de toda a carteira das turmas (fallback para turma sem pagantes). */
export function portfolioTicket(groups: readonly ExternalGroupRow[]): number {
  const paying = groups.reduce((sum, group) => sum + group.monthlyRevenueInCents, 0);
  const enrolled = groups.filter((group) => group.monthlyRevenueInCents > 0).reduce((sum, group) => sum + group.enrolled, 0);
  return enrolled > 0 ? Math.round(paying / enrolled) : 0;
}

/** Regra 1 — receita parada = vagas livres × ticket médio da turma (ou da carteira). */
export function groupTicket(group: ExternalGroupRow, fallbackTicket: number): number {
  if (group.enrolled > 0 && group.monthlyRevenueInCents > 0) return Math.round(group.monthlyRevenueInCents / group.enrolled);
  return fallbackTicket;
}

export function idleRevenue(group: ExternalGroupRow, fallbackTicket: number): number {
  return Math.max(0, group.freeSeats) * groupTicket(group, fallbackTicket);
}

export function enrichGroups(groups: readonly ExternalGroupRow[], waitlist: readonly WaitlistEntry[]): GroupRow[] {
  const fallback = portfolioTicket(groups);
  const waitingByService = new Map<string, number>();
  for (const entry of waitlist)
    if (isActiveWaitlist(entry) && entry.serviceId)
      waitingByService.set(entry.serviceId, (waitingByService.get(entry.serviceId) ?? 0) + 1);
  return groups
    .map((group) => ({
      ...group,
      businessLine: lineOf(group),
      averageTicketInCents: groupTicket(group, fallback),
      idleRevenueInCents: idleRevenue(group, fallback),
      overdueMembers: group.overdueMembers ?? 0,
      overdueInCents: group.overdueInCents ?? 0,
      serviceWaitlist: waitingByService.get(group.serviceId) ?? 0,
    }))
    .sort((a, b) => b.idleRevenueInCents - a.idleRevenueInCents || a.name.localeCompare(b.name, "pt-BR"));
}

/** Regra 2 — espera × vaga: turmas ativas do mesmo serviço com vaga livre. */
export function compatibleGroups(entry: Pick<WaitlistEntry, "serviceId">, groups: readonly ExternalGroupRow[]): CompatibleGroup[] {
  if (!entry.serviceId) return [];
  return groups
    .filter((group) => group.active && group.serviceId === entry.serviceId && group.freeSeats > 0)
    .sort((a, b) => b.freeSeats - a.freeSeats)
    .map((group) => ({ id: group.id, name: group.name, schedule: group.schedule, freeSeats: group.freeSeats }));
}

/** Posição na fila do mesmo serviço/produto (1 = próxima), contando só quem ainda espera. */
export function waitlistPosition(entry: WaitlistEntry, entries: readonly WaitlistEntry[]): number | null {
  if (!isActiveWaitlist(entry)) return null;
  const key = (item: WaitlistEntry) => `${item.kind}:${item.serviceId ?? item.productId}`;
  const queue = entries
    .filter((item) => isActiveWaitlist(item) && key(item) === key(entry))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return queue.findIndex((item) => item.id === entry.id) + 1 || null;
}

/** Regra 3 — turma deficitária (ocupação atual abaixo de 40%). */
export function deficitGroups(groups: readonly ExternalGroupRow[]): ExternalGroupRow[] {
  return groups.filter((group) => group.active && group.capacity > 0 && group.occupancyPercent < 40);
}

/** Regra 4 — horário quente: no mesmo dia e período, turmas cheias e fila de 2+ pessoas. */
export interface HotSlot {
  weekday: number;
  period: DayPeriod;
  label: string;
  waitlist: number;
  groups: string[];
}

export function hotSlots(groups: readonly ExternalGroupRow[]): HotSlot[] {
  const slots = new Map<string, { weekday: number; period: DayPeriod; full: boolean; waitlist: number; groups: string[] }>();
  for (const group of groups) {
    if (!group.active) continue;
    for (const slot of group.weeklySlots) {
      const period = dayPeriodOf(slot.startTime);
      const key = `${slot.weekday}:${period}`;
      const current = slots.get(key) ?? { weekday: slot.weekday, period, full: true, waitlist: 0, groups: [] };
      current.full &&= group.freeSeats <= 0;
      if (!current.groups.includes(group.name)) {
        current.groups.push(group.name);
        current.waitlist += group.waitlistCount;
      }
      slots.set(key, current);
    }
  }
  return [...slots.values()]
    .filter((slot) => slot.full && slot.waitlist >= 2)
    .sort((a, b) => b.waitlist - a.waitlist)
    .map((slot) => ({
      weekday: slot.weekday,
      period: slot.period,
      label: `${weekdayLong[slot.weekday]} · ${dayPeriodLabels[slot.period].toLowerCase()}`,
      waitlist: slot.waitlist,
      groups: slot.groups,
    }));
}

/** Mapa de calor: ocupação média por dia da semana × hora de início. */
export function occupancyHeatmap(groups: readonly ExternalGroupRow[]): HeatCell[] {
  const cells = new Map<string, { weekday: number; hour: number; capacity: number; enrolled: number; groups: number; freeSeats: number; waitlist: number }>();
  for (const group of groups) {
    if (!group.active) continue;
    for (const slot of group.weeklySlots) {
      const hour = Number(slot.startTime.slice(0, 2));
      const key = `${slot.weekday}:${hour}`;
      const cell = cells.get(key) ?? { weekday: slot.weekday, hour, capacity: 0, enrolled: 0, groups: 0, freeSeats: 0, waitlist: 0 };
      cell.capacity += group.capacity;
      cell.enrolled += group.enrolled;
      cell.groups += 1;
      cell.freeSeats += Math.max(0, group.freeSeats);
      cell.waitlist += group.waitlistCount;
      cells.set(key, cell);
    }
  }
  return [...cells.values()].map(({ capacity, enrolled, ...cell }) => ({
    ...cell,
    occupancyPercent: capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0,
  }));
}

/** Regra 5 — atraso em turma cheia com fila esperando. */
export function overdueAtRisk(row: { groups: { full: boolean; waitlistCount: number }[] }): boolean {
  return row.groups.some((group) => group.full && group.waitlistCount > 0);
}

export function toOverdueView(row: ExternalOverdueRow, groups: readonly ExternalGroupRow[]): OverdueRowView {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const rowGroups = row.groups.map((item) => {
    const group = byId.get(item.groupId);
    return {
      groupId: item.groupId,
      groupName: item.groupName,
      full: item.full ?? (group ? group.freeSeats <= 0 : false),
      waitlistCount: item.waitlistCount ?? group?.waitlistCount ?? 0,
    };
  });
  return {
    patientId: row.patientId,
    patientName: row.patientName,
    ...(row.phone ? { phone: row.phone } : {}),
    groups: rowGroups,
    amountInCents: row.amountInCents,
    installments: row.installments,
    oldestDueDate: row.oldestDueDate,
    daysOverdue: row.daysOverdue,
    band: row.band ?? overdueBand(row.daysOverdue) ?? "1-7",
    ...(row.lastContactAt ? { lastContactAt: row.lastContactAt } : {}),
    atRisk: overdueAtRisk({ groups: rowGroups }),
  };
}

/** Regra 6 — planos que vencem em até `days` dias. */
export function expiringPlans<T extends { validUntil?: string | undefined }>(plans: readonly T[], today: string, days = 15): T[] {
  const limit = addDays(today, days);
  return plans.filter((plan) => plan.validUntil && plan.validUntil >= today && plan.validUntil <= limit);
}

/** Regra 7 — meta mensal: progresso e quanto falta por dia útil (seg–sáb) até o fim do mês. */
export function goalProgress(goalInCents: number, soldInCents: number, today: string): GoalProgress | null {
  if (goalInCents <= 0) return null;
  const remaining = Math.max(0, goalInCents - soldInCents);
  const workingDaysLeft = workingDaysBetween(today, monthEnd(today.slice(0, 7)));
  return {
    goalInCents,
    soldInCents,
    percent: Math.round((soldInCents / goalInCents) * 1000) / 10,
    remainingInCents: remaining,
    workingDaysLeft,
    perWorkingDayInCents: workingDaysLeft > 0 ? Math.ceil(remaining / workingDaysLeft) : remaining,
  };
}

/** Dias desde a última movimentação do lead (contato ou atualização). */
export function leadIdleDays(lead: Pick<Lead, "lastContactAt" | "updatedAt" | "createdAt">, today: string): number {
  const last = lead.lastContactAt ?? lead.updatedAt ?? lead.createdAt;
  return Math.max(0, daysBetween(last.slice(0, 10), today));
}

export interface OpportunityInput {
  today: string;
  groups: readonly GroupRow[];
  waitlist: readonly WaitlistEntry[];
  overdue: readonly OverdueRowView[];
  leads: readonly Lead[];
  stages: readonly LeadStageConfig[];
  renewals: readonly { patientId: string; patientName: string; phone?: string | undefined; planName: string; validUntil: string }[];
  links: {
    group: (id: string) => string;
    whatsapp: (phone: string | undefined, kind: "charge" | "offer" | "renew" | "lead", context: Record<string, string>) => string | undefined;
  };
  staleLeadDays?: number;
  limit?: number;
}

/** "Oportunidades de hoje": lista priorizada de ações (a maior receita/urgência primeiro). */
export function buildOpportunities(input: OpportunityInput): Opportunity[] {
  const result: Opportunity[] = [];
  const staleDays = input.staleLeadDays ?? 3;

  for (const group of input.groups) {
    if (!group.active || group.freeSeats <= 0) continue;
    const waiting = group.waitlistCount + group.serviceWaitlist;
    if (waiting <= 0) continue;
    result.push({
      id: `offer:${group.id}`,
      kind: "offer_seat",
      title: `${group.name} tem ${plural(group.freeSeats, "vaga", "vagas")} e ${plural(waiting, "pessoa", "pessoas")} na espera`,
      detail: `${group.schedule} · ${formatMoney(group.idleRevenueInCents)}/mês parados`,
      score: 1000 + group.idleRevenueInCents / 100,
      valueInCents: group.idleRevenueInCents,
      action: { label: "Oferecer vaga", href: input.links.group(group.id) },
    });
  }

  for (const row of input.overdue) {
    const whatsapp = input.links.whatsapp(row.phone, "charge", {
      patientName: row.patientName,
      amountInCents: String(row.amountInCents),
      oldestDueDate: row.oldestDueDate,
    });
    result.push({
      id: `charge:${row.patientId}`,
      kind: "charge",
      title: `${firstName(row.patientName)} está há ${plural(row.daysOverdue, "dia", "dias")} em atraso`,
      detail: `${formatMoney(row.amountInCents)}${row.atRisk ? " · turma cheia com fila" : ""}`,
      score: (row.atRisk ? 900 : 500) + row.amountInCents / 100 + row.daysOverdue,
      valueInCents: row.amountInCents,
      action: { label: "Cobrar no WhatsApp", ...(whatsapp ? { whatsapp } : {}) },
    });
  }

  const openStages = new Map(input.stages.filter((stage) => stage.kind === "open").map((stage) => [stage.stage, stage.label]));
  for (const lead of input.leads) {
    const label = openStages.get(lead.stage);
    if (!label) continue;
    const idle = leadIdleDays(lead, input.today);
    if (idle < staleDays) continue;
    const whatsapp = input.links.whatsapp(lead.phone, "lead", { leadName: lead.fullName, interest: lead.interest });
    result.push({
      id: `lead:${lead.id}`,
      kind: "lead_stalled",
      title: `Lead ${firstName(lead.fullName)} parado há ${plural(idle, "dia", "dias")} na etapa ${label}`,
      detail: `${lead.interest} · origem ${lead.source}`,
      score: 300 + idle * 10,
      action: { label: "Chamar no WhatsApp", ...(whatsapp ? { whatsapp } : {}) },
    });
  }

  for (const plan of input.renewals) {
    const days = daysBetween(input.today, plan.validUntil);
    const whatsapp = input.links.whatsapp(plan.phone, "renew", {
      patientName: plan.patientName,
      planName: plan.planName,
      validUntil: plan.validUntil,
    });
    result.push({
      id: `renew:${plan.patientId}:${plan.planName}`,
      kind: "renew",
      title: `Plano de ${firstName(plan.patientName)} vence em ${plural(days, "dia", "dias")}`,
      detail: plan.planName,
      score: 400 + (15 - days) * 10,
      action: { label: "Renovar agora", ...(whatsapp ? { whatsapp } : {}) },
    });
  }

  for (const slot of hotSlots(input.groups)) {
    result.push({
      id: `open:${slot.weekday}:${slot.period}`,
      kind: "open_group",
      title: `${slot.label}: turmas cheias e ${plural(slot.waitlist, "pessoa", "pessoas")} na espera`,
      detail: `Avalie abrir uma turma nova (${slot.groups.join(", ")})`,
      score: 200 + slot.waitlist * 10,
      action: { label: "Ver mapa de calor", href: "/calendario?vista=calor" },
    });
  }

  for (const group of deficitGroups(input.groups)) {
    result.push({
      id: `merge:${group.id}`,
      kind: "merge_group",
      title: `${group.name} está com ${group.occupancyPercent}% de ocupação`,
      detail: "Divulgue a turma, junte horários ou mude o horário",
      score: 100 + (40 - group.occupancyPercent),
      action: { label: "Ver turma", href: input.links.group(group.id) },
    });
  }

  return diversify(result, input.limit ?? 12, 4);
}

/** Mais urgentes primeiro, mas sem deixar um só tipo de ação tomar a lista inteira. */
function diversify(items: Opportunity[], limit: number, perKind: number): Opportunity[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const counts = new Map<string, number>();
  const picked: Opportunity[] = [];
  const rest: Opportunity[] = [];
  for (const item of sorted) {
    const count = counts.get(item.kind) ?? 0;
    if (count < perKind) {
      picked.push(item);
      counts.set(item.kind, count + 1);
    } else rest.push(item);
  }
  return [...picked, ...rest].slice(0, limit).sort((a, b) => b.score - a.score);
}
