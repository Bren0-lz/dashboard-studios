/** Respostas do servidor do dashboard (BFF) para o navegador. */
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
  businessLine: BusinessLine;
  averageTicketInCents: number;
  /** Vagas livres × ticket médio: receita que falta vender. */
  idleRevenueInCents: number;
  overdueMembers: number;
  overdueInCents: number;
  /** Pessoas da lista de espera geral aguardando o serviço da turma. */
  serviceWaitlist: number;
  /** Nomes dos inscritos ativos (bolinhas do cartão). Só na tela de turmas; sem eles, o cartão não mostra as bolinhas. */
  memberNames?: string[];
}

export interface GroupsResponse {
  referenceDate: string;
  totals: ExternalGroupsTotals & { idleRevenueInCents: number; overdueMembers: number; overdueInCents: number };
  groups: GroupRow[];
  features: CrmFeatures;
}

export type GroupDetailsResponse = ExternalGroupDetails & { businessLine: BusinessLine };

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
  businessLine: BusinessLine;
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
  dailySales: { date: string; studio: number; aesthetics: number }[];
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
  /** Filtro por linha: recebido e atendidos não se separam por linha e ficam de fora. */
  partialLine: boolean;
  byLine: Record<BusinessLine, number>;
  topItems: SalesRankingItem[];
  byProfessional: SalesRankingItem[];
  daily: { date: string; studio: number; aesthetics: number }[];
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
