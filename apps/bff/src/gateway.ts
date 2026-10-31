import {
  apiIndexSchema,
  enrollmentResultSchema,
  groupDetailsSchema,
  groupsOverviewSchema,
  leadBoardSchema,
  leadInsightsSchema,
  leadStagesSchema,
  loginResultSchema,
  overdueReportSchema,
  patientSummarySchema,
  planTemplatesSchema,
  professionalSchema,
  salesPeriodReportSchema,
  salesReportSchema,
  serviceSchema,
  waitlistEntrySchema,
  type ExternalApiIndex,
  type ExternalGroupDetails,
  type ExternalGroupsOverview,
  type ExternalOverdueReport,
  type ExternalPatientSummary,
  type CrmLoginResult,
  type LeadBoard,
  type LeadInsights,
  type LeadStageConfig,
  type PlanTemplate,
  type Professional,
  type SalesPeriodReport,
  type SalesReport,
  type Service,
  type WaitlistEntry,
} from "@dash/shared";
import { z } from "zod";
import type { TtlCache } from "./cache.js";
import { CrmClient, CrmError, type CrmRequest } from "./crm-client.js";

/** Leitura opcional: rota que o CRM ainda não tem (fase 0) ou que o usuário não pode ver vira `null`. */
async function optional<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof CrmError && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}

/** Acesso ao CRM em nome de um usuário, com cache curto nas leituras. */
export class CrmGateway {
  constructor(
    private readonly client: CrmClient,
    private readonly cache: TtlCache,
    private readonly userToken: string | undefined,
    private readonly cacheScope: string,
    private readonly branchId?: string,
  ) {}

  static login(client: CrmClient, email: string, password: string): Promise<CrmLoginResult> {
    return client.request({ method: "POST", path: "/auth/login", body: { email, password } }, loginResultSchema) as Promise<CrmLoginResult>;
  }

  private read<T>(path: string, schema: z.ZodType<unknown>, query?: CrmRequest["query"]): Promise<T> {
    const key = `${this.cacheScope}|${this.branchId ?? ""}|${path}|${JSON.stringify(query ?? {})}`;
    return this.cache.get(key, () =>
      this.client.request({ path, query, userToken: this.userToken, branchId: this.branchId }, schema),
    ) as Promise<T>;
  }

  /** Gravação: repassa ao CRM e invalida o cache (os dados mudam para todos). */
  async write<T = unknown>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown, schema?: z.ZodType<T>): Promise<T> {
    try {
      return await this.client.request({ method, path, body, userToken: this.userToken, branchId: this.branchId }, schema);
    } finally {
      this.cache.clear();
    }
  }

  index = () => this.read<ExternalApiIndex>("", apiIndexSchema);
  groups = () => this.read<ExternalGroupsOverview>("/groups", groupsOverviewSchema);
  groupDetails = (id: string) => this.read<ExternalGroupDetails>(`/groups/${encodeURIComponent(id)}`, groupDetailsSchema);
  /** Sem cache: usado para comparar antes/depois de uma gravação. */
  groupDetailsFresh = (id: string) =>
    this.client.request({ path: `/groups/${encodeURIComponent(id)}`, userToken: this.userToken, branchId: this.branchId }, groupDetailsSchema) as Promise<ExternalGroupDetails>;
  waitlist = () => this.read<WaitlistEntry[]>("/waitlist", z.array(waitlistEntrySchema));
  services = () => this.read<Service[]>("/services", z.array(serviceSchema));
  professionals = () => this.read<Professional[]>("/professionals", z.array(professionalSchema));
  overdue = () => optional(() => this.read<ExternalOverdueReport>("/overdue", overdueReportSchema));
  sales = (month: string) => this.read<SalesReport>("/sales", salesReportSchema, { month });
  salesPeriod = (from: string, to: string) => this.read<SalesPeriodReport>("/sales/period", salesPeriodReportSchema, { from, to });
  leadBoard = () => this.read<LeadBoard>("/leads/board", leadBoardSchema, { limit: 100 });
  leadStages = () => this.read<LeadStageConfig[]>("/leads/stages", leadStagesSchema);
  leadInsights = () => optional(() => this.read<LeadInsights>("/leads/insights", leadInsightsSchema));
  patients = (search: string | undefined, limit = 20) =>
    this.read<ExternalPatientSummary[]>("/patients", z.array(patientSummarySchema), { search, limit });
  planTemplates = () => optional(() => this.read<PlanTemplate[]>("/plan-templates", planTemplatesSchema));

  enroll = (groupId: string, patientId: string) =>
    this.write("POST", "/group-enrollments", { groupId, patientId }, enrollmentResultSchema);
  cancelEnrollment = (enrollmentId: string) => this.write("POST", `/group-enrollments/${encodeURIComponent(enrollmentId)}/cancel`);
  promoteFromWaitlist = (groupId: string, enrollmentId: string) =>
    this.write("POST", `/groups/${encodeURIComponent(groupId)}/waitlist/${encodeURIComponent(enrollmentId)}/promote`);
}
