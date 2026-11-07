/** Respostas do servidor do dashboard (BFF) para o navegador. */
import type { LineKey } from "./business-line.js";
import type {
  BusinessLine,
  ExternalGroupDetails,
  ExternalGroupRow,
  ExternalGroupsTotals,
  ExternalPatientSummary,
  Lead,
  LeadInsights,
  LeadStageConfig,
  OverdueBand,
  SaleMovement,
  SalesReportPeriod,
  Service,
  WaitlistEntry,
} from "./crm-types.js";

/** O que o usuário logado pode fazer (as ações sem permissão ficam escondidas). */
export interface Capabilities {
  enroll: boolean;
  cancelEnrollment: boolean;
  sellPlan: boolean;
  createPatient: boolean;
  manageWaitlist: boolean;
  /** Dados cadastrais e de contato dos clientes (`patients.view`): a ficha do cliente (PT8). */
  seePatients: boolean;
  seeFinance: boolean;
  moveLeads: boolean;
  contactLeads: boolean;
  convertLeads: boolean;
}

/** Recursos que dependem da fase 0 do CRM; `false` = o CRM ainda não oferece. */
export interface CrmFeatures {
  planSale: boolean;
  businessLine: boolean;
  overdue: boolean;
  /**
   * PX5: o CRM informa os serviços de cada venda (`SaleMovement.services`). `false` = CRM antigo:
   * com serviços escolhidos no filtro, as vendas ficam de fora. Só na visão geral e nas vendas.
   */
  saleServices?: boolean;
}

/** Serviço que aparece no filtro do topo (PT6). */
export interface FilterServiceOption {
  id: string;
  name: string;
  line: LineKey;
  /** `false`: serviço inativo no CRM que ainda tem turma (fica no filtro, marcado como inativo). */
  active: boolean;
}

/** `GET /api/filters`: serviços do filtro, agrupados por linha no topo. */
export interface FiltersResponse {
  /** `false` = o CRM ainda não informa a linha dos serviços (tudo conta como Studio). */
  lines: boolean;
  services: FilterServiceOption[];
}

/** Série diária de vendas: `total` conta cada venda uma vez; cada linha, as vendas dela (valor inteiro). */
export interface DailySales {
  date: string;
  total: number;
  studio: number;
  aesthetics: number;
  other: number;
}

/** `GET /api/branches`: filiais do usuário; `available: false` = o CRM ainda não informa. */
export interface BranchesResponse {
  available: boolean;
  branches: { id: string; name: string; isDefault: boolean }[];
}

export interface SessionInfo {
  user: { id: string; fullName: string; email: string };
  can: Capabilities;
  clinicName: string;
  pixKey?: string;
  crmWebUrl: string;
  csrfToken: string;
}

export interface CompatibleGroup {
  id: string;
  name: string;
  schedule: string;
  freeSeats: number;
}

export interface GroupRow extends ExternalGroupRow {
  /** `null` = serviço sem classificação ("Outros"). */
  businessLine: BusinessLine | null;
  averageTicketInCents: number;
  /** Vagas livres × ticket médio: receita que falta vender. */
  idleRevenueInCents: number;
  overdueMembers: number;
  overdueInCents: number;
  /** Pessoas da lista de espera geral aguardando o serviço da turma. */
  serviceWaitlist: number;
}

export interface GroupsResponse {
  referenceDate: string;
  totals: ExternalGroupsTotals & { idleRevenueInCents: number; overdueMembers: number; overdueInCents: number };
  groups: GroupRow[];
  features: CrmFeatures;
}

export type GroupDetailsResponse = ExternalGroupDetails & { businessLine: BusinessLine | null };

export interface EnrollResult {
  status: "active" | "waitlisted";
  queuePosition?: number;
  message: string;
}

export interface CancelEnrollmentResult {
  message: string;
  /** Quem saiu da espera e entrou na vaga, quando houver. */
  promotedName?: string;
}

export interface WaitlistRow extends WaitlistEntry {
  /** Linha do serviço aguardado; `null` = sem classificação ou sem serviço (produto). */
  businessLine: BusinessLine | null;
  position: number | null;
  waitingDays: number;
  compatibleGroups: CompatibleGroup[];
}

export interface WaitlistResponse {
  rows: WaitlistRow[];
  services: Pick<Service, "id" | "name">[];
}

export interface OverdueRowView {
  patientId: string;
  patientName: string;
  phone?: string;
  groups: { groupId: string; groupName: string; full: boolean; waitlistCount: number }[];
  amountInCents: number;
  installments: number;
  oldestDueDate: string;
  daysOverdue: number;
  band: OverdueBand;
  lastContactAt?: string;
  /** Atraso em turma cheia com fila: a vaga pode ir para quem paga. */
  atRisk: boolean;
}

export interface OverdueResponse {
  available: boolean;
  referenceDate: string;
  /** Lista filtrada pela turma (`?turma=`), aberta pelo cartão da turma. */
  group?: { id: string; name: string };
  totalInCents: number;
  clients: number;
  risk: OverdueRowView[];
  bands: { band: OverdueBand; totalInCents: number; rows: OverdueRowView[] }[];
}

export type OpportunityKind = "offer_seat" | "charge" | "lead_stalled" | "renew" | "open_group" | "merge_group";

export interface Opportunity {
  id: string;
  kind: OpportunityKind;
  title: string;
  detail: string;
  /** Maior = mais urgente / mais dinheiro. */
  score: number;
  valueInCents?: number;
  action: { label: string; href?: string; whatsapp?: string };
}

export interface GoalProgress {
  goalInCents: number;
  soldInCents: number;
  percent: number;
  remainingInCents: number;
  workingDaysLeft: number;
  perWorkingDayInCents: number;
}

export interface Goals {
  /** Meta mensal por linha, em centavos (0 = sem meta). */
  studio: number;
  aesthetics: number;
}

export interface OverviewResponse {
  month: string;
  today: string;
  features: CrmFeatures;
  sales: {
    currentInCents: number;
    previousInCents: number;
    changePercent: number | null;
    /** Descontos do mês: do cliente nas vendas e, sem filtro de linha, os dados na baixa. */
    discounts: { customerInCents: number; settlementInCents: number };
  };
  goal: GoalProgress | null;
  idleRevenueInCents: number;
  freeSeats: number;
  occupancyPercent: number;
  overdue: { available: boolean; totalInCents: number; clients: number };
  waitlist: { waiting: number; withSeat: number };
  leads: { open: number; conversionRate: number; withoutContact: number } | null;
  opportunities: Opportunity[];
  dailySales: DailySales[];
}

export interface SalesRankingItem {
  name: string;
  quantity: number;
  amountInCents: number;
}

export interface SalesResponse {
  from: string;
  to: string;
  summary: SalesReportPeriod & { averageTicketInCents: number; salesCount: number };
  previous: SalesReportPeriod & { from: string; to: string };
  changePercent: number | null;
  /** Filtro de linha ou serviço: recebido e atendidos não se separam por linha e ficam de fora. */
  partialLine: boolean;
  /** O CRM informa os serviços de cada venda (PX5); `false` = filtro por serviço não alcança as vendas. */
  saleServices: boolean;
  /** Por linha, sem o filtro; o plano com serviços de duas linhas entra nas duas (a soma pode passar do total). */
  byLine: Record<LineKey, number>;
  topItems: SalesRankingItem[];
  byProfessional: SalesRankingItem[];
  daily: DailySales[];
  sales: SaleMovement[];
}

export interface LeadsResponse {
  stages: LeadStageConfig[];
  columns: { stage: string; label: string; kind: LeadStageConfig["kind"]; total: number; leads: (Lead & { idleDays: number })[] }[];
  insights: LeadInsights | null;
  staleDays: number;
}

export type PatientSearchResult = ExternalPatientSummary;

export interface HeatCell {
  weekday: number;
  hour: number;
  groups: number;
  occupancyPercent: number;
  freeSeats: number;
  waitlist: number;
}
