import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
  daysBetween,
  monthEnd,
  monthStart,
  overdueBand,
  previousMonth,
  todayInClinic,
  weekdayShort,
  type ExternalGroupDetails,
  type ExternalGroupMember,
  type ExternalGroupRow,
  type ExternalOverdueRow,
  type LeadInsights,
  type MemberOverdue,
  type SaleMovement,
  type SalesReportPeriod,
} from "@dash/shared";
import { createDemoState, type MockGroup, type MockState, type MockUser } from "./data.js";

/**
 * CRM simulado: a API externa `/api/external/v1` com dados de demonstração, já com o que a
 * fase 0 do planejamento acrescenta (linha de negócio, inadimplência, login como usuário e
 * promoção da espera). Serve para rodar o dashboard sem o CRM e para os testes.
 */
export interface MockCrmOptions {
  apiKey: string;
  today?: string;
  state?: MockState;
  /** Simula um CRM sem a fase 0 (sem login de usuário, linha de negócio nem /overdue). */
  withoutPhase0?: boolean;
  /** Simula o CRM de hoje, cuja API externa ainda não lista as filiais. */
  withoutBranches?: boolean;
}

const PREFIX = "/api/external/v1";

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.status(status).send({ code, message });
}

export function buildMockCrm(options: MockCrmOptions): { app: FastifyInstance; state: MockState } {
  const today = options.today ?? todayInClinic();
  const state = options.state ?? createDemoState(today);
  const phase0 = !options.withoutPhase0;
  const tokens = new Map<string, string>();
  const app = Fastify({ logger: false });

  const userOf = (request: FastifyRequest): MockUser => {
    const token = request.headers["x-crm-user-token"];
    const userId = typeof token === "string" ? tokens.get(token) : undefined;
    return state.users.find((user) => user.id === userId) ?? state.users[0]!;
  };
  /** Filial pedida no cabeçalho `X-Branch-Id` (mesma regra do CRM: sem ele, a rede toda). */
  const branchOf = (request: FastifyRequest): string | undefined => {
    const header = request.headers["x-branch-id"];
    return typeof header === "string" && header.trim() && header.trim() !== "all" ? header.trim() : undefined;
  };
  const can = (user: MockUser, permission: string) => user.role === "admin" || user.permissions.includes(permission);
  const seesFinance = (user: MockUser) => user.role === "admin" || user.modules.includes("finance");

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith(PREFIX)) return fail(reply, 404, "NOT_FOUND", "Rota não encontrada.");
    const header = request.headers.authorization;
    if (header !== `Bearer ${options.apiKey}`) return fail(reply, 401, "INVALID_API_KEY", "Chave de integração inválida ou revogada.");
    const token = request.headers["x-crm-user-token"];
    if (phase0 && typeof token === "string" && !tokens.has(token))
      return fail(reply, 401, "INVALID_USER_TOKEN", "Sessão do usuário expirada. Entre de novo.");
    const branch = branchOf(request);
    if (phase0 && branch && !state.branches.some((item) => item.id === branch && item.active))
      return fail(reply, 403, "BRANCH_ACCESS_DENIED", "Seu usuário não tem acesso a esta filial.");
  });

  const patient = (id: string) => state.patients.find((item) => item.id === id);
  const service = (id: string) => state.services.find((item) => item.id === id);
  const professional = (id: string) => state.professionals.find((item) => item.id === id);

  function overdueOf(patientId: string): MemberOverdue | undefined {
    const open = state.receivables.filter((item) => item.patientId === patientId && item.status === "open" && item.dueDate < today);
    if (open.length === 0) return undefined;
    const oldest = open.map((item) => item.dueDate).sort()[0]!;
    return { amountInCents: open.reduce((sum, item) => sum + item.amountInCents, 0), installments: open.length, oldestDueDate: oldest, daysOverdue: daysBetween(oldest, today) };
  }

  function monthlyOf(patientId: string, serviceId: string): number | null {
    const plan = state.plans.find((item) => item.patientId === patientId && item.serviceId === serviceId && item.status === "active");
    return plan ? plan.monthlyInCents : null;
  }

  function schedule(group: MockGroup): string {
    const days = group.weeklySlots.map((slot) => weekdayShort[slot.weekday]);
    const times = [...new Set(group.weeklySlots.map((slot) => slot.startTime))];
    return `${days.length > 1 ? `${days.slice(0, -1).join(", ")} e ${days.at(-1)}` : days[0]} às ${times.join(", ")}`;
  }

  function groupRow(group: MockGroup, user: MockUser): ExternalGroupRow {
    const members = state.enrollments.filter((item) => item.groupId === group.id && item.status === "active");
    const waiting = state.enrollments.filter((item) => item.groupId === group.id && item.status === "waitlisted");
    const svc = service(group.serviceId)!;
    const revenue = members.reduce((sum, item) => sum + (monthlyOf(item.patientId, group.serviceId) ?? 0), 0);
    const paying = members.filter((item) => monthlyOf(item.patientId, group.serviceId) !== null).length;
    const freeSeats = Math.max(0, group.capacity - members.length);
    const ticket = paying > 0 ? revenue / paying : svc.priceInCents * 4;
    const overdue = members.map((item) => overdueOf(item.patientId)).filter((item): item is MemberOverdue => Boolean(item));
    return {
      id: group.id,
      ...(phase0 ? { branchId: group.branchId } : {}),
      name: group.name,
      active: group.active,
      serviceId: svc.id,
      serviceName: svc.name,
      professionalId: group.professionalId,
      professionalName: professional(group.professionalId)?.fullName ?? "",
      roomId: group.roomId,
      roomName: state.rooms.find((room) => room.id === group.roomId)?.name ?? "",
      schedule: schedule(group),
      weeklySlots: group.weeklySlots,
      capacity: group.capacity,
      enrolled: members.length,
      freeSeats,
      waitlistCount: waiting.length,
      occupancyPercent: Math.round((members.length / group.capacity) * 100),
      sessionsPerMonth: group.weeklySlots.length * 4,
      monthlyRevenueInCents: revenue,
      potentialMonthlyRevenueInCents: Math.round(revenue + freeSeats * ticket),
      ...(phase0 ? { businessLine: svc.businessLine } : {}),
      ...(phase0 && seesFinance(user)
        ? { overdueMembers: overdue.length, overdueInCents: overdue.reduce((sum, item) => sum + item.amountInCents, 0) }
        : {}),
    };
  }

  function member(enrollment: MockState["enrollments"][number], group: MockGroup, user: MockUser, position?: number): ExternalGroupMember {
    const person = patient(enrollment.patientId)!;
    const overdue = phase0 && seesFinance(user) && enrollment.status === "active" ? overdueOf(person.id) : undefined;
    // Como no CRM (PX2): o contato só sai para quem tem `patients.view`; sem ela, só o nome.
    const contact = can(user, "patients.view")
      ? { phone: person.phone, ...(person.whatsapp ? { whatsapp: person.whatsapp } : {}), ...(person.email ? { email: person.email } : {}) }
      : {};
    return {
      enrollmentId: enrollment.id,
      patientId: person.id,
      patientName: person.fullName,
      ...contact,
      status: enrollment.status,
      ...(position ? { queuePosition: position } : {}),
      startsOn: enrollment.startsOn,
      monthlyInCents: enrollment.status === "active" ? monthlyOf(person.id, group.serviceId) : null,
      ...(overdue ? { overdue } : {}),
    };
  }

  /** Cancelar ou subir a capacidade promove o primeiro da espera (mesma regra do CRM em storage/memory e storage/mysql). */
  function promoteIfSeat(group: MockGroup) {
    const active = state.enrollments.filter((item) => item.groupId === group.id && item.status === "active").length;
    if (active >= group.capacity) return;
    const next = state.enrollments.filter((item) => item.groupId === group.id && item.status === "waitlisted").sort((a, b) => a.enrolledAt.localeCompare(b.enrolledAt))[0];
    if (next) next.status = "active";
  }

  function saleMovement(sale: MockState["sales"][number]): SaleMovement {
    return {
      id: sale.id,
      sourceId: sale.sourceId,
      sourceType: sale.sourceType,
      kind: sale.kind,
      occurredAt: sale.occurredAt,
      patientId: sale.patientId,
      patientName: patient(sale.patientId)?.fullName ?? "",
      itemName: sale.itemName,
      quantity: sale.quantity,
      amountInCents: sale.amountInCents,
      ...(sale.customerDiscountInCents ? { customerDiscountInCents: sale.customerDiscountInCents } : {}),
      ...(phase0 ? { businessLine: service(sale.serviceId)?.businessLine ?? "studio" } : {}),
      ...(sale.professionalId ? { professionalName: professional(sale.professionalId)?.fullName ?? "" } : {}),
    };
  }

  function period(from: string, to: string): { summary: SalesReportPeriod; sales: SaleMovement[] } {
    const sales = state.sales.filter((sale) => sale.occurredAt.slice(0, 10) >= from && sale.occurredAt.slice(0, 10) <= to);
    const gross = sales.filter((sale) => sale.kind === "sale").reduce((sum, sale) => sum + sale.amountInCents, 0);
    const cancelled = sales.filter((sale) => sale.kind === "cancellation").reduce((sum, sale) => sum + sale.amountInCents, 0);
    const received = state.receivables.filter((item) => item.paidAt && item.paidAt >= from && item.paidAt <= to).reduce((sum, item) => sum + item.amountInCents, 0);
    const buyers = new Set(sales.filter((sale) => sale.kind === "sale").map((sale) => sale.patientId)).size;
    const customerDiscount = sales.filter((sale) => sale.kind === "sale").reduce((sum, sale) => sum + (sale.customerDiscountInCents ?? 0), 0);
    const settlementDiscount = state.receivables
      .filter((item) => item.paidAt && item.paidAt >= from && item.paidAt <= to)
      .reduce((sum, item) => sum + (item.discountInCents ?? 0), 0);
    return {
      summary: {
        from,
        to,
        grossSalesInCents: gross,
        cancelledSalesInCents: cancelled,
        netSalesInCents: gross - cancelled,
        buyers,
        payment: { paidInCents: received, openInCents: 0, overdueInCents: 0 },
        ...(customerDiscount ? { customerDiscountInCents: customerDiscount } : {}),
        ...(settlementDiscount ? { settlementDiscountInCents: settlementDiscount } : {}),
      },
      sales: sales.map(saleMovement),
    };
  }

  const leadView = (lead: MockState["leads"][number]) => lead;

  // --- Índice e login ---------------------------------------------------------------------
  app.get(PREFIX, async () => ({
    version: "v1",
    clinic: state.clinic,
    key: { id: "mock-key", name: "Dashboard de vendas (simulado)", scopes: ["sales:read", "sales:write"] },
    endpoints: [{ method: "GET", path: "/external/v1/groups", scope: "sales:read", description: "Tabela de turmas." }],
  }));

  if (phase0)
    app.post(`${PREFIX}/auth/login`, async (request, reply) => {
      const body = (request.body ?? {}) as { email?: string; password?: string };
      const user = state.users.find((item) => item.email === body.email?.toLowerCase());
      if (!user || user.password !== body.password) return fail(reply, 401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
      const token = randomUUID();
      tokens.set(token, user.id);
      const { password: _password, ...summary } = user;
      return { token, expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString(), user: summary };
    });

  // --- Filiais (ainda não existe na API externa do CRM) -----------------------------------
  if (phase0 && !options.withoutBranches) app.get(`${PREFIX}/branches`, async () => state.branches);

  // --- Turmas ---------------------------------------------------------------------------
  app.get(`${PREFIX}/groups`, async (request) => {
    const user = userOf(request);
    const query = request.query as { includeInactive?: string; businessLine?: string };
    const branch = phase0 ? branchOf(request) : undefined;
    const rows = state.groups
      .filter((group) => group.active || query.includeInactive === "true")
      .filter((group) => !branch || group.branchId === branch)
      .map((group) => groupRow(group, user))
      .filter((row) => !query.businessLine || row.businessLine === query.businessLine);
    const sum = (pick: (row: ExternalGroupRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
    const capacity = sum((row) => row.capacity);
    const enrolled = sum((row) => row.enrolled);
    return {
      referenceDate: today,
      totals: {
        groups: rows.length,
        capacity,
        enrolled,
        freeSeats: sum((row) => row.freeSeats),
        waitlistCount: sum((row) => row.waitlistCount),
        occupancyPercent: capacity ? Math.round((enrolled / capacity) * 100) : 0,
        monthlyRevenueInCents: sum((row) => row.monthlyRevenueInCents),
        potentialMonthlyRevenueInCents: sum((row) => row.potentialMonthlyRevenueInCents),
      },
      groups: rows,
    };
  });

  app.get(`${PREFIX}/groups/:id`, async (request, reply) => {
    const user = userOf(request);
    const group = state.groups.find((item) => item.id === (request.params as { id: string }).id);
    if (!group) return fail(reply, 404, "GROUP_NOT_FOUND", "Turma não encontrada.");
    const enrollments = state.enrollments.filter((item) => item.groupId === group.id);
    const waiting = enrollments.filter((item) => item.status === "waitlisted").sort((a, b) => a.enrolledAt.localeCompare(b.enrolledAt));
    return {
      ...groupRow(group, user),
      members: enrollments.filter((item) => item.status === "active").map((item) => member(item, group, user)),
      waitlist: waiting.map((item, index) => member(item, group, user, index + 1)),
    } satisfies ExternalGroupDetails;
  });

  app.post(`${PREFIX}/group-enrollments`, async (request, reply) => {
    const user = userOf(request);
    if (!can(user, "groups.enroll")) return fail(reply, 403, "FORBIDDEN", "Você não tem permissão para matricular clientes.");
    const body = (request.body ?? {}) as { groupId?: string; patientId?: string };
    const group = state.groups.find((item) => item.id === body.groupId);
    if (!group || !body.patientId || !patient(body.patientId)) return fail(reply, 400, "VALIDATION", "Informe a turma e o cliente.");
    if (state.enrollments.some((item) => item.groupId === group.id && item.patientId === body.patientId && item.status !== "cancelled"))
      return fail(reply, 409, "ALREADY_ENROLLED", "O cliente já está nesta turma ou na espera dela.");
    const active = state.enrollments.filter((item) => item.groupId === group.id && item.status === "active").length;
    const status = active >= group.capacity ? "waitlisted" : "active";
    const enrollment = { id: randomUUID(), groupId: group.id, patientId: body.patientId, status, enrolledAt: new Date().toISOString(), startsOn: today } as const;
    state.enrollments.push({ ...enrollment });
    const queuePosition = status === "waitlisted" ? state.enrollments.filter((item) => item.groupId === group.id && item.status === "waitlisted").length : undefined;
    return reply.status(201).send({ ...enrollment, clinicId: state.clinic.id, patientName: patient(body.patientId)!.fullName, updatedAt: enrollment.enrolledAt, ...(queuePosition ? { queuePosition } : {}) });
  });

  app.post(`${PREFIX}/group-enrollments/:id/cancel`, async (request, reply) => {
    const user = userOf(request);
    if (!can(user, "groups.cancel_enrollment")) return fail(reply, 403, "FORBIDDEN", "Você não tem permissão para cancelar matrículas.");
    const enrollment = state.enrollments.find((item) => item.id === (request.params as { id: string }).id);
    if (!enrollment || enrollment.status === "cancelled") return fail(reply, 404, "ENROLLMENT_NOT_FOUND", "Matrícula não encontrada.");
    enrollment.status = "cancelled";
    promoteIfSeat(state.groups.find((item) => item.id === enrollment.groupId)!);
    return { ...enrollment };
  });

  if (phase0)
    app.post(`${PREFIX}/groups/:id/waitlist/:enrollmentId/promote`, async (request, reply) => {
      const user = userOf(request);
      if (!can(user, "groups.enroll")) return fail(reply, 403, "FORBIDDEN", "Você não tem permissão para matricular clientes.");
      const { id, enrollmentId } = request.params as { id: string; enrollmentId: string };
      const group = state.groups.find((item) => item.id === id);
      const enrollment = state.enrollments.find((item) => item.id === enrollmentId && item.groupId === id && item.status === "waitlisted");
      if (!group || !enrollment) return fail(reply, 404, "ENROLLMENT_NOT_FOUND", "Pessoa não encontrada na espera desta turma.");
      const active = state.enrollments.filter((item) => item.groupId === id && item.status === "active").length;
      if (active >= group.capacity) return fail(reply, 409, "GROUP_FULL", "A turma está cheia. Libere uma vaga ou aumente a capacidade.");
      enrollment.status = "active";
      return { ...enrollment };
    });

  // --- Clientes, catálogo e planos ------------------------------------------------------
  app.get(`${PREFIX}/patients`, async (request) => {
    const { search = "", limit = "20" } = request.query as { search?: string; limit?: string };
    const term = search.trim().toLowerCase();
    return state.patients
      .filter((item) => !term || item.fullName.toLowerCase().includes(term) || item.phone.includes(term.replace(/\D/g, "") || "§"))
      .slice(0, Math.min(100, Number(limit) || 20))
      .map((item) => ({
        id: item.id,
        fullName: item.fullName,
        phone: item.phone,
        ...(item.whatsapp ? { whatsapp: item.whatsapp } : {}),
        ...(item.email ? { email: item.email } : {}),
        tags: item.tags,
        activePlans: state.plans
          .filter((plan) => plan.patientId === item.id && plan.status === "active")
          .map((plan) => ({ id: plan.id, name: plan.name, ...(plan.validUntil ? { validUntil: plan.validUntil } : {}) })),
        activeGroups: state.enrollments
          .filter((enrollment) => enrollment.patientId === item.id && enrollment.status !== "cancelled")
          .map((enrollment) => ({ groupId: enrollment.groupId, groupName: state.groups.find((group) => group.id === enrollment.groupId)?.name ?? "", status: enrollment.status })),
      }));
  });

  app.post(`${PREFIX}/patients`, async (request, reply) => {
    const user = userOf(request);
    if (!can(user, "patients.create")) return fail(reply, 403, "FORBIDDEN", "Você não tem permissão para cadastrar clientes.");
    const body = (request.body ?? {}) as { fullName?: string; cpf?: string; phone?: string; email?: string };
    const cpf = (body.cpf ?? "").replace(/\D/g, "");
    if (!body.fullName || body.fullName.trim().length < 3 || cpf.length !== 11 || !body.phone)
      return fail(reply, 400, "VALIDATION", "Informe nome, CPF válido e telefone.");
    if (state.patients.some((item) => item.cpf === cpf)) return fail(reply, 409, "PATIENT_CPF_DUPLICATE", "Já existe um cliente com este CPF.");
    const created = { id: randomUUID(), fullName: body.fullName.trim(), cpf, phone: body.phone.replace(/\D/g, ""), ...(body.email ? { email: body.email } : {}), tags: [] };
    state.patients.push(created);
    return reply.status(201).send(created);
  });

  app.get(`${PREFIX}/services`, async () => state.services.map(({ businessLine, ...item }) => ({ ...item, clinicId: state.clinic.id, ...(phase0 ? { businessLine } : {}) })));
  app.get(`${PREFIX}/professionals`, async () => state.professionals);
  app.get(`${PREFIX}/plan-catalog`, async () => []);
  if (phase0) app.get(`${PREFIX}/plan-templates`, async () => state.planTemplates);

  app.post(`${PREFIX}/plans/purchases`, async (request, reply) => {
    const user = userOf(request);
    if (!can(user, "plans.purchase")) return fail(reply, 403, "FORBIDDEN", "Você não tem permissão para vender planos.");
    const body = (request.body ?? {}) as {
      groupId?: string;
      plan?: { planTemplateId?: string; patientId?: string; name?: string; services?: { serviceId: string }[]; validFrom?: string; validUntil?: string; totalValueInCents?: number; installments?: number; firstDueDate?: string };
    };
    const plan = body.plan;
    const template = state.planTemplates.find((item) => item.id === plan?.planTemplateId);
    if (!plan?.patientId || !template || !plan.validFrom || !plan.firstDueDate || !plan.installments) return fail(reply, 400, "VALIDATION", "Dados do plano incompletos.");
    const planId = randomUUID();
    const serviceId = template.services[0]!.serviceId;
    const months = template.planType === "quarterly" ? 3 : 1;
    state.plans.push({ id: planId, patientId: plan.patientId, serviceId, name: template.name, status: "active", validFrom: plan.validFrom, ...(plan.validUntil ? { validUntil: plan.validUntil } : {}), monthlyInCents: Math.round(template.totalValueInCents / months), totalValueInCents: template.totalValueInCents });
    for (let i = 0; i < plan.installments; i += 1)
      state.receivables.push({ id: randomUUID(), patientId: plan.patientId, planId, dueDate: plan.firstDueDate, amountInCents: Math.round(template.totalValueInCents / plan.installments), status: "open" });
    state.sales.push({ id: randomUUID(), sourceId: planId, sourceType: "plan", kind: "sale", occurredAt: new Date().toISOString(), patientId: plan.patientId, itemName: template.name, quantity: 1, amountInCents: template.totalValueInCents, serviceId });
    let enrollment;
    if (body.groupId) {
      const group = state.groups.find((item) => item.id === body.groupId);
      if (group) {
        const active = state.enrollments.filter((item) => item.groupId === group.id && item.status === "active").length;
        enrollment = { id: randomUUID(), groupId: group.id, patientId: plan.patientId, status: active >= group.capacity ? ("waitlisted" as const) : ("active" as const), enrolledAt: new Date().toISOString(), startsOn: plan.validFrom };
        state.enrollments.push(enrollment);
      }
    }
    return reply.status(201).send({ plan: { id: planId, name: template.name }, appointments: [], ...(enrollment ? { enrollment } : {}) });
  });

  // --- Lista de espera ------------------------------------------------------------------
  const waitlistView = (entry: MockState["waitlist"][number]) => {
    const person = patient(entry.patientId)!;
    return {
      id: entry.id,
      clinicId: state.clinic.id,
      patientId: person.id,
      patientName: person.fullName,
      patientPhone: person.phone,
      kind: "service" as const,
      serviceId: entry.serviceId,
      productId: null,
      itemName: service(entry.serviceId)?.name ?? "",
      status: entry.status,
      notes: entry.notes,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      resolvedAt: entry.resolvedAt,
    };
  };
  app.get(`${PREFIX}/waitlist`, async () => state.waitlist.map(waitlistView));
  app.post(`${PREFIX}/waitlist`, async (request, reply) => {
    if (!can(userOf(request), "waitlist.manage")) return fail(reply, 403, "FORBIDDEN", "Você não tem permissão para a lista de espera.");
    const body = (request.body ?? {}) as { patientId?: string; serviceId?: string; notes?: string };
    if (!body.patientId || !patient(body.patientId) || !body.serviceId || !service(body.serviceId)) return fail(reply, 400, "VALIDATION", "Informe o cliente e o serviço.");
    const now = new Date().toISOString();
    const entry = { id: randomUUID(), patientId: body.patientId, serviceId: body.serviceId, status: "waiting" as const, notes: body.notes ?? "", createdAt: now, updatedAt: now, resolvedAt: null };
    state.waitlist.push(entry);
    return reply.status(201).send(waitlistView(entry));
  });
  app.patch(`${PREFIX}/waitlist/:id`, async (request, reply) => {
    if (!can(userOf(request), "waitlist.manage")) return fail(reply, 403, "FORBIDDEN", "Você não tem permissão para a lista de espera.");
    const entry = state.waitlist.find((item) => item.id === (request.params as { id: string }).id);
    if (!entry) return fail(reply, 404, "WAITLIST_NOT_FOUND", "Entrada não encontrada.");
    const body = (request.body ?? {}) as { status?: MockState["waitlist"][number]["status"]; notes?: string };
    if (body.status) {
      entry.status = body.status;
      entry.resolvedAt = body.status === "served" || body.status === "cancelled" ? new Date().toISOString() : null;
    }
    if (body.notes !== undefined) entry.notes = body.notes;
    entry.updatedAt = new Date().toISOString();
    return waitlistView(entry);
  });
  app.delete(`${PREFIX}/waitlist/:id`, async (request, reply) => {
    if (!can(userOf(request), "waitlist.manage")) return fail(reply, 403, "FORBIDDEN", "Você não tem permissão para a lista de espera.");
    const index = state.waitlist.findIndex((item) => item.id === (request.params as { id: string }).id);
    if (index < 0) return fail(reply, 404, "WAITLIST_NOT_FOUND", "Entrada não encontrada.");
    state.waitlist.splice(index, 1);
    return reply.status(204).send();
  });

  // --- Inadimplência (fase 0) -----------------------------------------------------------
  if (phase0)
    app.get(`${PREFIX}/overdue`, async (request, reply) => {
      if (!seesFinance(userOf(request))) return fail(reply, 403, "FORBIDDEN", "Você não tem acesso ao financeiro.");
      const ids = [...new Set(state.receivables.filter((item) => item.status === "open" && item.dueDate < today).map((item) => item.patientId))];
      const rows: ExternalOverdueRow[] = ids.map((patientId) => {
        const overdue = overdueOf(patientId)!;
        const person = patient(patientId)!;
        const groups = state.enrollments
          .filter((item) => item.patientId === patientId && item.status === "active")
          .map((item) => {
            const group = state.groups.find((g) => g.id === item.groupId)!;
            const row = groupRow(group, state.users[0]!);
            return { groupId: group.id, groupName: group.name, full: row.freeSeats <= 0, waitlistCount: row.waitlistCount };
          });
        const firstGroup = state.groups.find((group) => group.id === groups[0]?.groupId);
        return {
          patientId,
          patientName: person.fullName,
          phone: person.phone,
          groups,
          ...overdue,
          band: overdueBand(overdue.daysOverdue) ?? "1-7",
          businessLine: firstGroup ? (service(firstGroup.serviceId)?.businessLine ?? "studio") : "studio",
          ...(state.chargeContacts[patientId] ? { lastContactAt: state.chargeContacts[patientId] } : {}),
        };
      });
      return { referenceDate: today, rows: rows.sort((a, b) => b.daysOverdue - a.daysOverdue) };
    });

  // --- Vendas e financeiro --------------------------------------------------------------
  app.get(`${PREFIX}/sales`, async (request) => {
    const month = (request.query as { month?: string }).month ?? today.slice(0, 7);
    const current = period(monthStart(month), monthEnd(month));
    const previous = period(monthStart(previousMonth(month)), monthEnd(previousMonth(month)));
    const change = current.summary.netSalesInCents - previous.summary.netSalesInCents;
    return {
      month,
      generatedAt: new Date().toISOString(),
      current: current.summary,
      previousComparable: previous.summary,
      changeInCents: change,
      changePercent: previous.summary.netSalesInCents ? Math.round((change / previous.summary.netSalesInCents) * 1000) / 10 : null,
      sales: current.sales,
      payments: [],
      patientsWithoutReturn: [],
    };
  });
  app.get(`${PREFIX}/sales/period`, async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string };
    if (!from || !to) return fail(reply, 400, "VALIDATION", "Informe o período.");
    const result = period(from, to);
    return { from, to, generatedAt: new Date().toISOString(), summary: result.summary, sales: result.sales, payments: [], patientsWithoutReturn: [], returnReference: { from, to } };
  });
  app.get(`${PREFIX}/finance/summary`, async () => {
    const open = state.receivables.filter((item) => item.status === "open");
    return {
      openInCents: open.reduce((sum, item) => sum + item.amountInCents, 0),
      overdueInCents: open.filter((item) => item.dueDate < today).reduce((sum, item) => sum + item.amountInCents, 0),
      paidThisMonthInCents: state.receivables.filter((item) => item.paidAt?.startsWith(today.slice(0, 7))).reduce((sum, item) => sum + item.amountInCents, 0),
      receivables: [],
    };
  });

  // --- Leads ----------------------------------------------------------------------------
  app.get(`${PREFIX}/leads/stages`, async () => state.leadStages);
  app.get(`${PREFIX}/leads/board`, async () => ({
    columns: state.leadStages.map((stage) => {
      const leads = state.leads.filter((lead) => lead.stage === stage.stage).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return { stage: stage.stage, total: leads.length, overdue: leads.filter((lead) => lead.overdueTasks > 0).length, leads: leads.map(leadView) };
    }),
  }));
  app.get(`${PREFIX}/leads/insights`, async () => {
    const won = state.leads.filter((lead) => lead.stage === "won").length;
    const lost = state.leads.filter((lead) => lead.stage === "lost").length;
    const rate = (items: typeof state.leads) => {
      const w = items.filter((lead) => lead.stage === "won").length;
      const l = items.filter((lead) => lead.stage === "lost").length;
      return { leads: items.length, won: w, lost: l, conversionRate: w + l ? Math.round((w / (w + l)) * 1000) / 10 : 0 };
    };
    const by = (key: "source" | "contactMethod") =>
      [...new Set(state.leads.map((lead) => lead[key] ?? ""))].filter(Boolean).map((name) => ({ name, ...rate(state.leads.filter((lead) => lead[key] === name)) }));
    const reasons = [...new Set(state.leads.map((lead) => lead.lostReason).filter(Boolean))] as string[];
    return {
      total: state.leads.length,
      open: state.leads.length - won - lost,
      won,
      lost,
      conversionRate: won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : 0,
      openTasks: state.leads.reduce((sum, lead) => sum + lead.openTasks, 0),
      overdueTasks: state.leads.reduce((sum, lead) => sum + lead.overdueTasks, 0),
      withoutContact: state.leads.filter((lead) => !lead.lastContactAt && lead.stage !== "won" && lead.stage !== "lost").length,
      sources: by("source"),
      contactMethods: by("contactMethod"),
      lostReasons: reasons.map((name) => ({ name, leads: state.leads.filter((lead) => lead.lostReason === name).length })),
    } satisfies LeadInsights;
  });
  app.patch(`${PREFIX}/leads/:id/stage`, async (request, reply) => {
    if (!can(userOf(request), "crm.stage")) return fail(reply, 403, "FORBIDDEN", "Você não tem permissão para mover leads.");
    const lead = state.leads.find((item) => item.id === (request.params as { id: string }).id);
    if (!lead) return fail(reply, 404, "LEAD_NOT_FOUND", "Lead não encontrado.");
    const body = (request.body ?? {}) as { stage?: string; lostReason?: string };
    if (!body.stage || !state.leadStages.some((stage) => stage.stage === body.stage)) return fail(reply, 400, "VALIDATION", "Etapa inválida.");
    if (body.stage === "won") return fail(reply, 400, "LEAD_WON_REQUIRES_CONVERSION", "Para ganhar o lead, converta-o em cliente.");
    if (body.stage === "lost" && !body.lostReason) return fail(reply, 400, "VALIDATION", "Informe o motivo da perda.");
    lead.stage = body.stage;
    if (body.lostReason) lead.lostReason = body.lostReason;
    lead.updatedAt = new Date().toISOString();
    return leadView(lead);
  });
  app.post(`${PREFIX}/leads/:id/contacts`, async (request, reply) => {
    if (!can(userOf(request), "crm.contacts_create")) return fail(reply, 403, "FORBIDDEN", "Você não tem permissão para registrar contatos.");
    const lead = state.leads.find((item) => item.id === (request.params as { id: string }).id);
    if (!lead) return fail(reply, 404, "LEAD_NOT_FOUND", "Lead não encontrado.");
    const now = new Date().toISOString();
    lead.lastContactAt = now;
    lead.updatedAt = now;
    return reply.status(201).send({ id: randomUUID(), leadId: lead.id, occurredAt: now, ...(request.body as object) });
  });
  app.post(`${PREFIX}/leads/:id/convert`, async (request, reply) => {
    if (!can(userOf(request), "crm.convert")) return fail(reply, 403, "FORBIDDEN", "Você não tem permissão para converter leads.");
    const lead = state.leads.find((item) => item.id === (request.params as { id: string }).id);
    if (!lead) return fail(reply, 404, "LEAD_NOT_FOUND", "Lead não encontrado.");
    const cpf = String((request.body as { cpf?: string } | undefined)?.cpf ?? "").replace(/\D/g, "");
    if (cpf.length !== 11) return fail(reply, 400, "VALIDATION", "Informe um CPF válido.");
    let person = state.patients.find((item) => item.cpf === cpf);
    const reusedExisting = Boolean(person);
    if (!person) {
      person = { id: randomUUID(), fullName: lead.fullName, phone: lead.phone, cpf, tags: [] };
      state.patients.push(person);
    }
    lead.stage = "won";
    lead.convertedPatientId = person.id;
    lead.updatedAt = new Date().toISOString();
    return { lead: leadView(lead), patient: person, reusedExisting };
  });

  return { app, state };
}
