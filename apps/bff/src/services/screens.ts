import {
  addDays,
  businessLines,
  buildOpportunities,
  chargeMessage,
  compatibleGroups,
  daysBetween,
  enrichGroups,
  expiringPlans,
  goalProgress,
  isActiveWaitlist,
  leadFollowUpMessage,
  leadIdleDays,
  lineOf,
  matchesLine,
  monthEnd,
  monthStart,
  overdueBands,
  previousMonth,
  renewalMessage,
  toOverdueView,
  waitlistPosition,
  whatsappLink,
  type BusinessLine,
  type CrmFeatures,
  type ExternalGroupRow,
  type Goals,
  type GroupsResponse,
  type LeadsResponse,
  type LineFilter,
  type OverdueResponse,
  type OverdueRowView,
  type OverviewResponse,
  type SaleMovement,
  type SalesRankingItem,
  type SalesReportPeriod,
  type SalesResponse,
  type Service,
  type WaitlistEntry,
  type WaitlistResponse,
} from "@dash/shared";
import type { CrmGateway } from "../gateway.js";

export interface ScreenContext {
  gateway: CrmGateway;
  today: string;
  clinicName: string;
  pixKey: string;
  seeFinance: boolean;
}

/** Linha do item da lista de espera: a do serviço aguardado (sem fase 0, Studio). */
function serviceLines(services: readonly Service[]): Map<string, BusinessLine> {
  return new Map(services.map((service) => [service.id, lineOf(service)]));
}

function features(groups: readonly ExternalGroupRow[], overdueAvailable: boolean, planSale: boolean): CrmFeatures {
  return { businessLine: groups.some((group) => group.businessLine !== undefined), overdue: overdueAvailable, planSale };
}

async function loadOverdue(ctx: ScreenContext, groups: readonly ExternalGroupRow[], line: LineFilter) {
  if (!ctx.seeFinance) return { available: false, rows: [] as OverdueRowView[], referenceDate: ctx.today };
  const report = await ctx.gateway.overdue();
  if (!report) return { available: false, rows: [] as OverdueRowView[], referenceDate: ctx.today };
  const lineGroups = new Map(groups.map((group) => [group.id, lineOf(group)]));
  const rows = report.rows
    .filter((row) => {
      if (line === "all") return true;
      if (row.businessLine) return row.businessLine === line;
      return row.groups.length === 0 ? line === "studio" : row.groups.some((group) => (lineGroups.get(group.groupId) ?? "studio") === line);
    })
    .map((row) => toOverdueView(row, groups))
    .sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || b.daysOverdue - a.daysOverdue);
  return { available: true, rows, referenceDate: report.referenceDate };
}

export async function groupsScreen(ctx: ScreenContext, line: LineFilter): Promise<GroupsResponse> {
  const [overview, waitlist, templates] = await Promise.all([ctx.gateway.groups(), ctx.gateway.waitlist(), ctx.gateway.planTemplates()]);
  const overdue = ctx.seeFinance ? await ctx.gateway.overdue() : null;
  const rows = enrichGroups(overview.groups.filter((group) => matchesLine(group, line)), waitlist).map((row) =>
    ctx.seeFinance ? row : { ...row, overdueMembers: 0, overdueInCents: 0 },
  );
  const sum = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const capacity = sum((row) => (row.active ? row.capacity : 0));
  const enrolled = sum((row) => (row.active ? row.enrolled : 0));
  return {
    referenceDate: overview.referenceDate,
    totals: {
      groups: rows.length,
      capacity,
      enrolled,
      freeSeats: sum((row) => Math.max(0, row.freeSeats)),
      waitlistCount: sum((row) => row.waitlistCount),
      occupancyPercent: capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0,
      monthlyRevenueInCents: sum((row) => row.monthlyRevenueInCents),
      potentialMonthlyRevenueInCents: sum((row) => row.potentialMonthlyRevenueInCents),
      idleRevenueInCents: sum((row) => row.idleRevenueInCents),
      overdueMembers: sum((row) => row.overdueMembers),
      overdueInCents: sum((row) => row.overdueInCents),
    },
    groups: rows,
    features: features(overview.groups, overdue !== null, templates !== null),
  };
}

export async function waitlistScreen(ctx: ScreenContext, line: LineFilter): Promise<WaitlistResponse> {
  const [entries, overview, services] = await Promise.all([ctx.gateway.waitlist(), ctx.gateway.groups(), ctx.gateway.services()]);
  const lines = serviceLines(services);
  const rows = entries
    .filter(isActiveWaitlist)
    .map((entry) => ({
      ...entry,
      businessLine: entry.serviceId ? (lines.get(entry.serviceId) ?? "studio") : ("studio" as BusinessLine),
      position: waitlistPosition(entry, entries),
      waitingDays: Math.max(0, daysBetween(entry.createdAt.slice(0, 10), ctx.today)),
      compatibleGroups: compatibleGroups(entry, overview.groups),
    }))
    .filter((row) => line === "all" || row.businessLine === line)
    .sort((a, b) => b.compatibleGroups.length - a.compatibleGroups.length || b.waitingDays - a.waitingDays);
  return {
    rows,
    services: services.filter((service) => service.active && matchesLine(service, line)).map(({ id, name }) => ({ id, name })),
  };
}

export async function overdueScreen(ctx: ScreenContext, line: LineFilter): Promise<OverdueResponse> {
  const overview = await ctx.gateway.groups();
  const { available, rows, referenceDate } = await loadOverdue(ctx, overview.groups, line);
  return {
    available,
    referenceDate,
    totalInCents: rows.reduce((sum, row) => sum + row.amountInCents, 0),
    clients: rows.length,
    risk: rows.filter((row) => row.atRisk),
    bands: overdueBands.map((band) => {
      const bandRows = rows.filter((row) => row.band === band && !row.atRisk);
      return { band, totalInCents: bandRows.reduce((sum, row) => sum + row.amountInCents, 0), rows: bandRows };
    }),
  };
}

const signed = (sale: SaleMovement) => (sale.kind === "cancellation" ? -Math.abs(sale.amountInCents) : sale.amountInCents);

function dailySeries(sales: readonly SaleMovement[], from: string, to: string) {
  const days = new Map<string, { date: string; studio: number; aesthetics: number }>();
  for (let day = from; day <= to; day = addDays(day, 1)) days.set(day, { date: day, studio: 0, aesthetics: 0 });
  for (const sale of sales) {
    const day = days.get(sale.occurredAt.slice(0, 10));
    if (day) day[lineOf(sale)] += signed(sale);
  }
  return [...days.values()];
}

/** Totais do período filtrados por linha, a partir das movimentações. */
function periodForLine(summary: SalesReportPeriod, sales: readonly SaleMovement[], line: LineFilter): SalesReportPeriod {
  if (line === "all") return summary;
  const own = sales.filter((sale) => matchesLine(sale, line));
  const gross = own.filter((sale) => sale.kind === "sale").reduce((sum, sale) => sum + sale.amountInCents, 0);
  const cancelled = own.filter((sale) => sale.kind === "cancellation").reduce((sum, sale) => sum + Math.abs(sale.amountInCents), 0);
  return { ...summary, grossSalesInCents: gross, cancelledSalesInCents: cancelled, netSalesInCents: gross - cancelled, receivedInCents: 0, attendedPatients: 0 };
}

function ranking(sales: readonly SaleMovement[], key: (sale: SaleMovement) => string | undefined): SalesRankingItem[] {
  const items = new Map<string, SalesRankingItem>();
  for (const sale of sales) {
    const name = key(sale);
    if (!name) continue;
    const item = items.get(name) ?? { name, quantity: 0, amountInCents: 0 };
    item.quantity += sale.kind === "sale" ? sale.quantity : -sale.quantity;
    item.amountInCents += signed(sale);
    items.set(name, item);
  }
  return [...items.values()].sort((a, b) => b.amountInCents - a.amountInCents).slice(0, 10);
}

function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export async function salesScreen(ctx: ScreenContext, from: string, to: string, line: LineFilter): Promise<SalesResponse> {
  const length = daysBetween(from, to);
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -length);
  const [current, previous] = await Promise.all([ctx.gateway.salesPeriod(from, to), ctx.gateway.salesPeriod(previousFrom, previousTo)]);
  const sales = current.sales.filter((sale) => matchesLine(sale, line));
  const summary = periodForLine(current.summary, current.sales, line);
  const previousSummary = periodForLine(previous.summary, previous.sales, line);
  const salesCount = sales.filter((sale) => sale.kind === "sale").length;
  const byLine = Object.fromEntries(businessLines.map((item) => [item, 0])) as Record<BusinessLine, number>;
  for (const sale of current.sales) byLine[lineOf(sale)] += signed(sale);
  return {
    from,
    to,
    summary: { ...summary, salesCount, averageTicketInCents: salesCount > 0 ? Math.round(summary.grossSalesInCents / salesCount) : 0 },
    previous: { ...previousSummary, from: previousFrom, to: previousTo },
    changePercent: changePercent(summary.netSalesInCents, previousSummary.netSalesInCents),
    partialLine: line !== "all",
    byLine,
    topItems: ranking(sales, (sale) => sale.itemName),
    byProfessional: ranking(sales, (sale) => sale.professionalName),
    daily: dailySeries(sales, from, to),
    sales: [...sales].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  };
}

export function salesCsv(report: SalesResponse): string {
  const escape = (value: string | number) => {
    const text = String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ["Data", "Tipo", "Cliente", "Item", "Origem", "Linha", "Quantidade", "Valor (R$)"];
  const rows = report.sales.map((sale) => [
    sale.occurredAt.slice(0, 10),
    sale.kind === "sale" ? "Venda" : "Cancelamento",
    sale.patientName,
    sale.itemName,
    { plan: "Plano", product: "Produto", service: "Serviço" }[sale.sourceType],
    lineOf(sale) === "studio" ? "Studio" : "Estética",
    sale.quantity,
    (signed(sale) / 100).toFixed(2).replace(".", ","),
  ]);
  // BOM + ponto e vírgula: abre certo no Excel em pt-BR.
  return `\ufeff${[header, ...rows].map((row) => row.map(escape).join(";")).join("\r\n")}\r\n`;
}

export async function leadsScreen(ctx: ScreenContext, staleDays: number): Promise<LeadsResponse> {
  const [stages, board, insights] = await Promise.all([ctx.gateway.leadStages(), ctx.gateway.leadBoard(), ctx.gateway.leadInsights()]);
  const columnsByStage = new Map(board.columns.map((column) => [column.stage, column]));
  return {
    stages,
    staleDays,
    insights,
    columns: stages.map((stage) => {
      const column = columnsByStage.get(stage.stage);
      return {
        stage: stage.stage,
        label: stage.label,
        kind: stage.kind,
        total: column?.total ?? 0,
        leads: (column?.leads ?? []).map((lead) => ({ ...lead, idleDays: leadIdleDays(lead, ctx.today) })),
      };
    }),
  };
}

export function goalFor(goals: Goals, line: LineFilter): number {
  return line === "all" ? goals.studio + goals.aesthetics : goals[line];
}

export async function overviewScreen(ctx: ScreenContext, line: LineFilter, goals: Goals): Promise<OverviewResponse> {
  const month = ctx.today.slice(0, 7);
  const previous = previousMonth(month);
  const dayOfMonth = Number(ctx.today.slice(8, 10));
  const previousSameDay = [monthEnd(previous), `${previous}-${String(dayOfMonth).padStart(2, "0")}`].sort()[0]!;
  const [groupsView, overview, waitlist, services, current, previousPeriod, stages, board, insights, patients] = await Promise.all([
    groupsScreen(ctx, line),
    ctx.gateway.groups(),
    ctx.gateway.waitlist(),
    ctx.gateway.services(),
    ctx.gateway.salesPeriod(monthStart(month), ctx.today),
    ctx.gateway.salesPeriod(monthStart(previous), previousSameDay),
    ctx.gateway.leadStages(),
    ctx.gateway.leadBoard(),
    ctx.gateway.leadInsights(),
    ctx.gateway.patients(undefined, 100),
  ]);
  const overdue = await loadOverdue(ctx, overview.groups, line);
  const currentSummary = periodForLine(current.summary, current.sales, line);
  const previousSummary = periodForLine(previousPeriod.summary, previousPeriod.sales, line);
  const lines = serviceLines(services);
  const activeWaitlist = waitlist.filter(
    (entry: WaitlistEntry) => isActiveWaitlist(entry) && (line === "all" || (entry.serviceId ? (lines.get(entry.serviceId) ?? "studio") : "studio") === line),
  );
  const withSeat = activeWaitlist.filter((entry) => compatibleGroups(entry, overview.groups).length > 0).length;
  const leads = board.columns.flatMap((column) => column.leads);
  const renewals = patients.flatMap((patient) =>
    expiringPlans(patient.activePlans, ctx.today).map((plan) => ({
      patientId: patient.id,
      patientName: patient.fullName,
      phone: patient.whatsapp ?? patient.phone,
      planName: plan.name,
      validUntil: plan.validUntil!,
    })),
  );
  const message = (kind: "charge" | "offer" | "renew" | "lead", c: Record<string, string>) => {
    if (kind === "charge")
      return chargeMessage({
        patientName: c.patientName ?? "",
        amountInCents: Number(c.amountInCents),
        oldestDueDate: c.oldestDueDate ?? ctx.today,
        clinicName: ctx.clinicName,
        pixKey: ctx.pixKey || undefined,
      });
    if (kind === "renew")
      return renewalMessage({ patientName: c.patientName ?? "", planName: c.planName ?? "", validUntil: c.validUntil ?? ctx.today, clinicName: ctx.clinicName });
    return leadFollowUpMessage({ leadName: c.leadName ?? "", interest: c.interest ?? "", clinicName: ctx.clinicName });
  };
  const opportunities = buildOpportunities({
    today: ctx.today,
    groups: groupsView.groups,
    waitlist: activeWaitlist,
    overdue: overdue.rows,
    leads,
    stages,
    renewals,
    links: {
      group: (id) => `/turmas?turma=${encodeURIComponent(id)}`,
      whatsapp: (phone, kind, context) => whatsappLink(phone, message(kind, context)) ?? undefined,
    },
  });
  return {
    month,
    today: ctx.today,
    features: groupsView.features,
    sales: {
      currentInCents: currentSummary.netSalesInCents,
      previousInCents: previousSummary.netSalesInCents,
      changePercent: changePercent(currentSummary.netSalesInCents, previousSummary.netSalesInCents),
    },
    goal: goalProgress(goalFor(goals, line), currentSummary.netSalesInCents, ctx.today),
    idleRevenueInCents: groupsView.totals.idleRevenueInCents,
    freeSeats: groupsView.totals.freeSeats,
    occupancyPercent: groupsView.totals.occupancyPercent,
    overdue: {
      available: overdue.available,
      totalInCents: overdue.rows.reduce((sum, row) => sum + row.amountInCents, 0),
      clients: overdue.rows.length,
    },
    waitlist: { waiting: activeWaitlist.length, withSeat },
    leads: insights ? { open: insights.open, conversionRate: insights.conversionRate, withoutContact: insights.withoutContact } : null,
    opportunities,
    dailySales: dailySeries(current.sales.filter((sale) => matchesLine(sale, line)), monthStart(month), ctx.today),
  };
}
