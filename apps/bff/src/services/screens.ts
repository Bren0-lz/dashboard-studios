import {
  addDays,
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
  emptyPanelFilter,
  isFilterActive,
  lineKeyLabels,
  lineKeyOf,
  lineKeys,
  matchesFilter,
  monthEnd,
  monthStart,
  overdueBands,
  previousMonth,
  renewalMessage,
  saleTags,
  toOverdueView,
  uniqueLines,
  waitlistPosition,
  whatsappLink,
  type BusinessLine,
  type CrmFeatures,
  type DailySales,
  type ExternalGroupRow,
  type ExternalOverdueRow,
  type FilterTags,
  type FiltersResponse,
  type Goals,
  type GroupsResponse,
  type LeadsResponse,
  type LineFilter,
  type LineKey,
  type OverdueResponse,
  type OverdueRowView,
  type OverviewResponse,
  type PanelFilter,
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

/**
 * Linha de cada serviço: a do cadastro (`/services`, só os ativos) e, para serviço inativo que
 * ainda tem turma, a da turma. `legacy`: o CRM ainda não informa linha nenhuma (tudo é Studio).
 */
interface ServiceIndex {
  lines: Map<string, LineKey>;
  legacy: boolean;
}

function serviceIndex(services: readonly Service[], groups: readonly ExternalGroupRow[]): ServiceIndex {
  const lines = new Map(services.map((service) => [service.id, lineKeyOf(service.businessLine)] as const));
  for (const group of groups) if (!lines.has(group.serviceId)) lines.set(group.serviceId, lineKeyOf(group.businessLine));
  return { lines, legacy: !services.some((service) => service.businessLine !== undefined) && !groups.some((group) => group.businessLine !== undefined) };
}

const toBusinessLine = (line: LineKey | undefined): BusinessLine | null => (line === undefined || line === "other" ? null : line);

const groupTags = (group: ExternalGroupRow): FilterTags => ({ lines: [lineKeyOf(group.businessLine)], services: [group.serviceId] });

/** Espera: pelo serviço aguardado. Produto não tem linha na lista de espera: sem vínculo (só "Tudo"). */
function waitlistTags(entry: WaitlistEntry, index: ServiceIndex): FilterTags {
  const line = entry.serviceId ? index.lines.get(entry.serviceId) : undefined;
  if (index.legacy) return { lines: ["studio"], services: entry.serviceId ? [entry.serviceId] : [] };
  return { lines: line ? [line] : [], services: entry.serviceId ? [entry.serviceId] : [] };
}

/**
 * Atraso: pelos serviços e linhas de produto das parcelas (PX5). Sem esses campos (CRM antigo),
 * como antes: a linha informada pelo CRM ou a das turmas do cliente (sem turma, Studio).
 */
function overdueTags(row: ExternalOverdueRow, groups: ReadonlyMap<string, ExternalGroupRow>): FilterTags {
  if (row.services !== undefined)
    return {
      lines: uniqueLines([...row.services.map((item) => lineKeyOf(item.businessLine ?? null)), ...(row.productLines ?? []).map((line) => lineKeyOf(line))]),
      services: row.services.map((item) => item.id),
    };
  const known = row.groups.map((item) => groups.get(item.groupId)).filter((group): group is ExternalGroupRow => Boolean(group));
  const services = [...new Set(known.map((group) => group.serviceId))];
  if (row.businessLine !== undefined) return { lines: [lineKeyOf(row.businessLine)], services };
  if (row.groups.length === 0) return { lines: ["studio"], services };
  return { lines: uniqueLines(row.groups.map((item) => lineKeyOf(groups.get(item.groupId)?.businessLine))), services };
}

function features(groups: readonly ExternalGroupRow[], overdueAvailable: boolean, planSale: boolean): CrmFeatures {
  return { businessLine: groups.some((group) => group.businessLine !== undefined), overdue: overdueAvailable, planSale };
}

async function loadOverdue(ctx: ScreenContext, groups: readonly ExternalGroupRow[], filter: PanelFilter) {
  if (!ctx.seeFinance) return { available: false, rows: [] as OverdueRowView[], referenceDate: ctx.today };
  const report = await ctx.gateway.overdue();
  if (!report) return { available: false, rows: [] as OverdueRowView[], referenceDate: ctx.today };
  const byId = new Map(groups.map((group) => [group.id, group]));
  const rows = report.rows
    .filter((row) => matchesFilter(overdueTags(row, byId), filter))
    .map((row) => toOverdueView(row, groups))
    .sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || b.daysOverdue - a.daysOverdue);
  return { available: true, rows, referenceDate: report.referenceDate };
}

/** Os nomes das bolinhas do cartão (`memberNames`, PX4) vêm na própria lista do CRM: nenhuma leitura por turma. */
export async function groupsScreen(ctx: ScreenContext, filter: PanelFilter): Promise<GroupsResponse> {
  const [overview, waitlist, templates] = await Promise.all([ctx.gateway.groups(), ctx.gateway.waitlist(), ctx.gateway.planTemplates()]);
  const overdue = ctx.seeFinance ? await ctx.gateway.overdue() : null;
  const rows = enrichGroups(overview.groups.filter((group) => matchesFilter(groupTags(group), filter)), waitlist).map((row) =>
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

export async function waitlistScreen(ctx: ScreenContext, filter: PanelFilter): Promise<WaitlistResponse> {
  const [entries, overview, services] = await Promise.all([ctx.gateway.waitlist(), ctx.gateway.groups(), ctx.gateway.services()]);
  const index = serviceIndex(services, overview.groups);
  const rows = entries
    .filter(isActiveWaitlist)
    .filter((entry) => matchesFilter(waitlistTags(entry, index), filter))
    .map((entry) => ({
      ...entry,
      businessLine: toBusinessLine(waitlistTags(entry, index).lines[0]),
      position: waitlistPosition(entry, entries),
      waitingDays: Math.max(0, daysBetween(entry.createdAt.slice(0, 10), ctx.today)),
      compatibleGroups: compatibleGroups(entry, overview.groups),
    }))
    .sort((a, b) => b.compatibleGroups.length - a.compatibleGroups.length || b.waitingDays - a.waitingDays);
  return {
    rows,
    services: services.filter((service) => service.active && matchesFilter({ lines: [lineKeyOf(service.businessLine)], services: [service.id] }, filter)).map(({ id, name }) => ({ id, name })),
  };
}

/** `groupId`: só os clientes em atraso inscritos nessa turma (link do cartão da turma). */
export async function overdueScreen(ctx: ScreenContext, filter: PanelFilter, groupId?: string): Promise<OverdueResponse> {
  const overview = await ctx.gateway.groups();
  // A turma já define a linha e o serviço: o filtro do topo fica de fora (mesma contagem do cartão).
  const loaded = await loadOverdue(ctx, overview.groups, groupId ? emptyPanelFilter : filter);
  const { available, referenceDate } = loaded;
  const rows = groupId ? loaded.rows.filter((row) => row.groups.some((group) => group.groupId === groupId)) : loaded.rows;
  const groupName = groupId
    ? (overview.groups.find((group) => group.id === groupId)?.name ?? loaded.rows.flatMap((row) => row.groups).find((group) => group.groupId === groupId)?.groupName)
    : undefined;
  return {
    available,
    referenceDate,
    ...(groupId ? { group: { id: groupId, name: groupName ?? "Turma" } } : {}),
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

const salesOf = (sales: readonly SaleMovement[], filter: PanelFilter) => sales.filter((sale) => matchesFilter(saleTags(sale), filter));

/** Por dia: `total` conta a venda uma vez; cada linha dela recebe o valor inteiro. */
function dailySeries(sales: readonly SaleMovement[], from: string, to: string): DailySales[] {
  const days = new Map<string, DailySales>();
  for (let day = from; day <= to; day = addDays(day, 1)) days.set(day, { date: day, total: 0, studio: 0, aesthetics: 0, other: 0 });
  for (const sale of sales) {
    const day = days.get(sale.occurredAt.slice(0, 10));
    if (!day) continue;
    day.total += signed(sale);
    for (const line of saleTags(sale).lines) day[line] += signed(sale);
  }
  return [...days.values()];
}

/** Totais do período filtrados por linha/serviço, a partir das movimentações (cada venda uma vez). */
function periodForFilter(summary: SalesReportPeriod, sales: readonly SaleMovement[], filter: PanelFilter): SalesReportPeriod {
  if (!isFilterActive(filter)) return summary;
  const own = salesOf(sales, filter);
  const gross = own.filter((sale) => sale.kind === "sale").reduce((sum, sale) => sum + sale.amountInCents, 0);
  const cancelled = own.filter((sale) => sale.kind === "cancellation").reduce((sum, sale) => sum + Math.abs(sale.amountInCents), 0);
  const customerDiscount = own.filter((sale) => sale.kind === "sale").reduce((sum, sale) => sum + (sale.customerDiscountInCents ?? 0), 0);
  // O desconto na baixa, como o recebido, não se separa por linha: fica de fora.
  const { settlementDiscountInCents: _settlement, customerDiscountInCents: _customer, ...rest } = summary;
  void _settlement;
  void _customer;
  return {
    ...rest,
    grossSalesInCents: gross,
    cancelledSalesInCents: cancelled,
    netSalesInCents: gross - cancelled,
    buyers: new Set(own.filter((sale) => sale.kind === "sale").map((sale) => sale.patientId)).size,
    payment: { paidInCents: 0, openInCents: 0, overdueInCents: 0 },
    ...(customerDiscount ? { customerDiscountInCents: customerDiscount } : {}),
  };
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

/** O CRM informa os serviços de cada venda (PX5)? Sem vendas no período não dá para saber: sim. */
const hasSaleServices = (sales: readonly SaleMovement[]) => sales.every((sale) => sale.services !== undefined);

export async function salesScreen(ctx: ScreenContext, from: string, to: string, filter: PanelFilter): Promise<SalesResponse> {
  const length = daysBetween(from, to);
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -length);
  const [current, previous] = await Promise.all([ctx.gateway.salesPeriod(from, to), ctx.gateway.salesPeriod(previousFrom, previousTo)]);
  const sales = salesOf(current.sales, filter);
  const summary = periodForFilter(current.summary, current.sales, filter);
  const previousSummary = periodForFilter(previous.summary, previous.sales, filter);
  const salesCount = sales.filter((sale) => sale.kind === "sale").length;
  const byLine = Object.fromEntries(lineKeys.map((item) => [item, 0])) as Record<LineKey, number>;
  for (const sale of current.sales) for (const line of saleTags(sale).lines) byLine[line] += signed(sale);
  return {
    from,
    to,
    summary: { ...summary, salesCount, averageTicketInCents: salesCount > 0 ? Math.round(summary.grossSalesInCents / salesCount) : 0 },
    previous: { ...previousSummary, from: previousFrom, to: previousTo },
    changePercent: changePercent(summary.netSalesInCents, previousSummary.netSalesInCents),
    partialLine: isFilterActive(filter),
    saleServices: hasSaleServices([...current.sales, ...previous.sales]),
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
    sale.planKind === "single" ? "Plano avulso" : { plan: "Plano", product: "Produto", service: "Serviço (comanda antiga)" }[sale.sourceType],
    saleTags(sale)
      .lines.map((line) => lineKeyLabels[line])
      .join(", "),
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

/** Meta por linha; "Outros" e a escolha de serviços não têm meta. */
export function goalFor(goals: Goals, line: LineFilter, services: readonly string[] = []): number {
  if (services.length > 0 || line === "other") return 0;
  return line === "all" ? goals.studio + goals.aesthetics : goals[line];
}

/** `GET /api/filters`: serviços ativos do CRM e os inativos que ainda têm turma, por linha. */
export async function filtersScreen(ctx: ScreenContext): Promise<FiltersResponse> {
  const [services, overview] = await Promise.all([ctx.gateway.services(), ctx.gateway.groups()]);
  const options = new Map<string, FiltersResponse["services"][number]>();
  for (const service of services)
    if (service.active) options.set(service.id, { id: service.id, name: service.name, line: lineKeyOf(service.businessLine), active: true });
  for (const group of overview.groups)
    if (!options.has(group.serviceId))
      options.set(group.serviceId, { id: group.serviceId, name: group.serviceName, line: lineKeyOf(group.businessLine), active: false });
  return {
    lines: !serviceIndex(services, overview.groups).legacy,
    services: [...options.values()].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR")),
  };
}

export async function overviewScreen(ctx: ScreenContext, filter: PanelFilter, goals: Goals): Promise<OverviewResponse> {
  const month = ctx.today.slice(0, 7);
  const previous = previousMonth(month);
  const dayOfMonth = Number(ctx.today.slice(8, 10));
  const previousSameDay = [monthEnd(previous), `${previous}-${String(dayOfMonth).padStart(2, "0")}`].sort()[0]!;
  const [groupsView, overview, waitlist, services, current, previousPeriod, stages, board, insights, patients] = await Promise.all([
    groupsScreen(ctx, filter),
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
  const overdue = await loadOverdue(ctx, overview.groups, filter);
  const currentSummary = periodForFilter(current.summary, current.sales, filter);
  const previousSummary = periodForFilter(previousPeriod.summary, previousPeriod.sales, filter);
  const index = serviceIndex(services, overview.groups);
  const activeWaitlist = waitlist.filter((entry: WaitlistEntry) => isActiveWaitlist(entry) && matchesFilter(waitlistTags(entry, index), filter));
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
    features: { ...groupsView.features, saleServices: hasSaleServices([...current.sales, ...previousPeriod.sales]) },
    sales: {
      currentInCents: currentSummary.netSalesInCents,
      previousInCents: previousSummary.netSalesInCents,
      changePercent: changePercent(currentSummary.netSalesInCents, previousSummary.netSalesInCents),
      discounts: {
        customerInCents: currentSummary.customerDiscountInCents ?? 0,
        settlementInCents: currentSummary.settlementDiscountInCents ?? 0,
      },
    },
    goal: goalProgress(goalFor(goals, filter.line, filter.services), currentSummary.netSalesInCents, ctx.today),
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
    dailySales: dailySeries(salesOf(current.sales, filter), monthStart(month), ctx.today),
  };
}
