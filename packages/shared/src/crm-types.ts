/**
 * Tipos da API externa do CRM (`/api/external/v1`), copiados de
 * `crm-studios/packages/contracts/src/integrations/external.ts` e dos contratos das rotas
 * repassadas. O pacote `@crm/contracts` não é publicado; `crm-schemas.ts` valida as respostas
 * e o teste de contrato acusa quando o CRM muda algum formato.
 *
 * Campos marcados com "fase 0" ainda dependem dos PRs do CRM (linha de negócio, inadimplência,
 * login como usuário). Eles são opcionais: sem eles o dashboard funciona com o que houver.
 */

export type BusinessLine = "studio" | "aesthetics";

/**
 * PX5: serviço de uma venda ou de um atraso, com a linha do cadastro (inclusive de serviço
 * inativo). `businessLine: null` = sem classificação ("Outros" no painel).
 */
export interface ServiceLineRef {
  id: string;
  name: string;
  businessLine: BusinessLine | null;
}

export interface GroupWeeklySlot {
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  startTime: string;
  endTime: string;
}

/**
 * Filial que o usuário pode escolher (`GET /branches` do CRM). Ainda não existe na API externa:
 * sem ela o seletor de filial some e o painel mostra a rede toda.
 */
export interface CrmBranch {
  id: string;
  name: string;
  active: boolean;
  isDefault: boolean;
}

export type GroupEnrollmentStatus = "active" | "waitlisted" | "cancelled";

/** Fase 0 (3.2): atraso do inscrito. Só vem para quem tem `finance.view`. */
export interface MemberOverdue {
  amountInCents: number;
  installments: number;
  oldestDueDate: string;
  daysOverdue: number;
}

export interface ExternalGroupRow {
  id: string;
  branchId?: string;
  name: string;
  active: boolean;
  serviceId: string;
  serviceName: string;
  professionalId: string;
  professionalName: string;
  roomId: string;
  roomName: string;
  schedule: string;
  weeklySlots: GroupWeeklySlot[];
  capacity: number;
  enrolled: number;
  freeSeats: number;
  waitlistCount: number;
  occupancyPercent: number;
  sessionsPerMonth: number;
  monthlyRevenueInCents: number;
  potentialMonthlyRevenueInCents: number;
  /** Fase 0 (3.1); PX3: `null` = serviço sem classificação ("Outros"). Ausente (CRM antigo) = Studio. */
  businessLine?: BusinessLine | null;
  /** Fase 0 (3.2). */
  overdueMembers?: number;
  /** Fase 0 (3.2). */
  overdueInCents?: number;
  /**
   * PX4: nomes dos inscritos ativos (sem a espera), na ordem de inscrição; só nomes, sem depender de
   * `patients.view`. Sem o campo (CRM antigo), o cartão da turma fica sem as bolinhas.
   */
  memberNames?: string[];
}

export interface ExternalGroupsTotals {
  groups: number;
  capacity: number;
  enrolled: number;
  freeSeats: number;
  waitlistCount: number;
  occupancyPercent: number;
  monthlyRevenueInCents: number;
  potentialMonthlyRevenueInCents: number;
}

export interface ExternalGroupsOverview {
  referenceDate: string;
  totals: ExternalGroupsTotals;
  groups: ExternalGroupRow[];
}

export interface ExternalGroupMember {
  enrollmentId: string;
  patientId: string;
  patientName: string;
  /** Contato (`phone`, `whatsapp`, `email`): só para quem tem `patients.view` no CRM. */
  phone?: string;
  whatsapp?: string;
  email?: string;
  status: GroupEnrollmentStatus;
  queuePosition?: number;
  startsOn: string;
  monthlyInCents: number | null;
  /** Fase 0 (3.2). */
  overdue?: MemberOverdue;
}

export interface ExternalGroupDetails extends ExternalGroupRow {
  members: ExternalGroupMember[];
  waitlist: ExternalGroupMember[];
}

export interface ExternalPatientSummary {
  id: string;
  fullName: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  tags: string[];
  activePlans: { id: string; name: string; validUntil?: string }[];
  activeGroups: {
    groupId: string;
    groupName: string;
    status: GroupEnrollmentStatus;
  }[];
}

/** Fase 0 (3.2): `GET /overdue`. */
export interface ExternalOverdueRow {
  patientId: string;
  patientName: string;
  phone?: string;
  groups: { groupId: string; groupName: string; full?: boolean; waitlistCount?: number }[];
  amountInCents: number;
  installments: number;
  oldestDueDate: string;
  daysOverdue: number;
  band?: OverdueBand;
  /** CRM antes da PX5 (o painel deduzia a linha pela turma do cliente). */
  businessLine?: BusinessLine | null;
  /**
   * PX5: serviços de onde vêm as parcelas vencidas (plano, serviço da comanda). Ausente = CRM
   * antigo; vazio junto com `productLines` = atraso sem vínculo (só aparece em "Tudo").
   */
  services?: ServiceLineRef[];
  /** PX5: linhas dos produtos das parcelas vencidas (`null` = Outros). */
  productLines?: (BusinessLine | null)[];
  lastContactAt?: string;
}

export interface ExternalOverdueReport {
  referenceDate: string;
  rows: ExternalOverdueRow[];
}

export type OverdueBand = "1-7" | "8-30" | "31-60" | "60+";

export interface Service {
  id: string;
  name: string;
  active: boolean;
  priceInCents?: number;
  durationMinutes?: number;
  /** Fase 0 (3.1); PX3: `null` = sem classificação. */
  businessLine?: BusinessLine | null;
}

export interface Professional {
  id: string;
  fullName: string;
  active: boolean;
  color?: string;
}

export type WaitlistStatus = "waiting" | "contacted" | "served" | "cancelled";

export interface WaitlistEntry {
  id: string;
  branchId?: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  kind: "service" | "product";
  serviceId: string | null;
  productId: string | null;
  itemName: string;
  status: WaitlistStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface SaleMovement {
  id: string;
  sourceId: string;
  sourceType: "plan" | "product" | "service";
  kind: "sale" | "cancellation";
  occurredAt: string;
  patientId: string;
  patientName: string;
  itemName: string;
  quantity: number;
  amountInCents: number;
  receivableId?: string;
  customerDiscountInCents?: number;
  /**
   * PX5: linha do produto, só em venda de produto (`null` = Outros). Num CRM antigo podia vir em
   * qualquer venda (fase 0).
   */
  businessLine?: BusinessLine | null;
  /** PX5: serviço da venda (serviço) ou todos os serviços do plano; vazio em produto. Ausente = CRM antigo. */
  services?: ServiceLineRef[];
  /** Profissional da venda, quando o CRM informar. */
  professionalName?: string;
}

export interface SalesReportPeriod {
  from: string;
  to: string;
  grossSalesInCents: number;
  cancelledSalesInCents: number;
  netSalesInCents: number;
  /** Clientes que compraram no período. */
  buyers: number;
  /** Contas a receber das vendas do período (sem as canceladas). */
  payment: { paidInCents: number; openInCents: number; overdueInCents: number };
  /** Descontos do cliente nas vendas (planos e produtos) do período. */
  customerDiscountInCents?: number;
  /** Descontos dados na baixa das cobranças das vendas do período. */
  settlementDiscountInCents?: number;
}

export interface SalesReport {
  month: string;
  generatedAt: string;
  current: SalesReportPeriod;
  previousComparable: SalesReportPeriod;
  changeInCents: number;
  changePercent: number | null;
  sales: SaleMovement[];
}

export interface SalesPeriodReport {
  from: string;
  to: string;
  generatedAt: string;
  summary: SalesReportPeriod;
  sales: SaleMovement[];
}

export interface FinancialSummary {
  openInCents: number;
  overdueInCents: number;
  paidThisMonthInCents: number;
}

export interface Lead {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  source: string;
  interest: string;
  notes?: string;
  stage: string;
  lostReason?: string;
  convertedPatientId?: string;
  createdAt: string;
  updatedAt: string;
  responsibleName?: string;
  openTasks: number;
  overdueTasks: number;
  lastContactAt?: string;
}

export interface LeadStagePage {
  stage: string;
  total: number;
  overdue: number;
  leads: Lead[];
}

export interface LeadBoard {
  columns: LeadStagePage[];
}

export interface LeadStageConfig {
  stage: string;
  label: string;
  kind: "open" | "won" | "lost";
}

export interface LeadRate {
  name: string;
  leads: number;
  won: number;
  lost: number;
  conversionRate: number;
}

export interface LeadInsights {
  total: number;
  open: number;
  won: number;
  lost: number;
  conversionRate: number;
  openTasks: number;
  overdueTasks: number;
  withoutContact: number;
  sources: LeadRate[];
  contactMethods: LeadRate[];
  lostReasons: { name: string; leads: number }[];
}

export interface PatientPlanSummary {
  id: string;
  name: string;
  status: string;
  validFrom: string;
  validUntil?: string;
  totalValueInCents: number;
}

/** Fase 0 (3.4): resumo do usuário devolvido por `POST /auth/login`. */
export interface CrmUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  modules: string[];
  permissions: string[];
}

export interface CrmLoginResult {
  token: string;
  expiresAt?: string;
  user: CrmUser;
}

export interface ExternalApiIndex {
  version: "v1";
  clinic: { id: string; name: string };
  key: { id: string; name: string; scopes: string[] };
  endpoints: { method: string; path: string; scope: string; description: string }[];
}

export type PlanKind = "single" | "fixed_package" | "recurring" | "custom";
export type PlanType = "single" | "monthly" | "quarterly" | "semiannual" | "annual" | "promotional";

/** Modelo de plano (`GET /plan-templates`; rota ainda não exposta na API externa — fase 0). */
export interface PlanTemplate {
  id: string;
  name: string;
  active: boolean;
  totalValueInCents: number;
  services: { serviceId: string; totalSessions: number; totalValueInCents: number; sessionsPerWeek?: number | null }[];
  planType?: PlanType | null;
  kind?: PlanKind | null;
  maxInstallments?: number | null;
}
