import { randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
  addDays,
  monthStart,
  parseLineFilter,
  planValidUntil,
  todayInClinic,
  type BranchesResponse,
  type CancelEnrollmentResult,
  type EnrollResult,
  type GroupDetailsResponse,
  type PlanType,
  type SessionInfo,
  lineOf,
} from "@dash/shared";
import { z, ZodError } from "zod";
import { TtlCache } from "./cache.js";
import type { Config } from "./config.js";
import { CrmClient, CrmError, type FetchLike } from "./crm-client.js";
import { CrmGateway } from "./gateway.js";
import { fileGoalsStore, type GoalsStore } from "./goals-store.js";
import { capabilitiesOf } from "./permissions.js";
import { SESSION_TTL_MS, SessionStore, type Session } from "./sessions.js";
import {
  goalFor,
  groupsScreen,
  leadsScreen,
  overdueScreen,
  overviewScreen,
  salesCsv,
  salesScreen,
  waitlistScreen,
  type ScreenContext,
} from "./services/screens.js";

export const SESSION_COOKIE = "dash_session";

export interface AppDeps {
  fetch?: FetchLike;
  goals?: GoalsStore;
  sessions?: SessionStore;
  /** Data de referência (testes); padrão: hoje no fuso da clínica. */
  today?: () => string;
}

declare module "fastify" {
  interface FastifyRequest {
    session?: Session;
  }
}

const isoDate = z.iso.date("Informe uma data válida (aaaa-mm-dd).");
const loginSchema = z.object({ email: z.email("Informe um e-mail válido.").trim().toLowerCase(), password: z.string().min(1, "Informe a senha.") });
const enrollSchema = z.object({ patientId: z.string().min(1, "Escolha o cliente.") });
const sellSchema = z.object({
  patientId: z.string().min(1, "Escolha o cliente."),
  planTemplateId: z.string().min(1, "Escolha o plano."),
  installments: z.number().int().min(1).max(36).default(1),
  firstDueDate: isoDate,
  paymentMethod: z.string().optional(),
});
const patientSchema = z.object({
  fullName: z.string().trim().min(3, "Informe o nome completo."),
  cpf: z.string().trim().min(11, "Informe o CPF."),
  phone: z.string().trim().min(10, "Informe o telefone com DDD."),
  email: z.email("Informe um e-mail válido.").optional().or(z.literal("")),
});
const waitlistCreateSchema = z.object({
  patientId: z.string().min(1, "Escolha o cliente."),
  serviceId: z.string().min(1, "Escolha o serviço."),
  notes: z.string().max(500).default(""),
});
const waitlistUpdateSchema = z.object({
  status: z.enum(["waiting", "contacted", "served", "cancelled"]).optional(),
  notes: z.string().max(500).optional(),
});
const goalsSchema = z.object({ studio: z.number().int().min(0), aesthetics: z.number().int().min(0) });
const leadStageSchema = z.object({ stage: z.string().min(1), lostReason: z.string().trim().max(500).optional() });
const leadContactSchema = z.object({
  channel: z.enum(["phone", "whatsapp", "email", "in_person", "note"]).default("whatsapp"),
  notes: z.string().trim().min(2, "Descreva o contato.").max(2000),
});
const leadConvertSchema = z.object({ cpf: z.string().trim().min(11, "Informe o CPF.") });
const periodQuery = z.object({ from: isoDate.optional(), to: isoDate.optional(), linha: z.string().optional() });

function sendError(reply: FastifyReply, status: number, code: string, message: string, details?: unknown) {
  return reply.status(status).send({ code, message, ...(details ? { details } : {}) });
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function buildApp(config: Config, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 256 * 1024 });
  const client = new CrmClient(config.crmApiUrl, config.crmApiKey, deps.fetch);
  const cache = new TtlCache(config.cacheTtlMs);
  const sessions = deps.sessions ?? new SessionStore();
  const goals = deps.goals ?? fileGoalsStore(config.goalsFile);
  const today = deps.today ?? (() => todayInClinic());

  await app.register(cookie, { secret: config.sessionSecret });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof CrmError) {
      if (error.status === 401 && request.session) {
        sessions.delete(request.session.id);
        reply.clearCookie(SESSION_COOKIE, { path: "/" });
      }
      return sendError(reply, error.status >= 500 ? 502 : error.status, error.code, error.message, error.status === 400 ? error.details : undefined);
    }
    if (error instanceof ZodError) return sendError(reply, 400, "validation", error.issues[0]?.message ?? "Dados inválidos.", error.issues);
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) return sendError(reply, status, "bad_request", "Requisição inválida.");
    request.log.error(error);
    return sendError(reply, 500, "internal", "Erro inesperado no servidor do dashboard.");
  });

  const cookieOptions = {
    path: "/",
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax" as const,
    signed: true,
    maxAge: SESSION_TTL_MS / 1000,
  };

  function readSession(request: FastifyRequest): Session | undefined {
    const raw = request.cookies[SESSION_COOKIE];
    if (!raw) return undefined;
    const unsigned = request.unsignCookie(raw);
    return unsigned.valid && unsigned.value ? sessions.get(unsigned.value) : undefined;
  }

  // Autenticação + CSRF em tudo de /api, menos login e saúde.
  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0] ?? "";
    if (!path.startsWith("/api/") || path === "/api/auth/login" || path === "/api/health") return;
    const session = readSession(request);
    if (!session) return sendError(reply, 401, "unauthenticated", "Entre com sua conta do CRM.");
    request.session = session;
    if (request.method !== "GET" && request.method !== "HEAD") {
      const token = request.headers["x-csrf-token"];
      if (typeof token !== "string" || !safeEqual(token, session.csrfToken))
        return sendError(reply, 403, "csrf", "Sessão desatualizada. Recarregue a página.");
    }
  });

  const gatewayOf = (request: FastifyRequest) => {
    const session = request.session!;
    const branch = request.headers["x-branch-id"];
    const branchId = typeof branch === "string" && branch.trim() ? branch.trim() : undefined;
    return new CrmGateway(client, cache, session.crmToken, session.user.id, branchId);
  };
  const ctxOf = (request: FastifyRequest): ScreenContext => ({
    gateway: gatewayOf(request),
    today: today(),
    clinicName: config.clinicName,
    pixKey: config.pixKey,
    seeFinance: capabilitiesOf(request.session!.user).seeFinance,
  });
  const lineOfQuery = (request: FastifyRequest) => parseLineFilter((request.query as Record<string, unknown>).linha);
  const sessionInfo = (session: Session): SessionInfo => ({
    user: { id: session.user.id, fullName: session.user.fullName, email: session.user.email },
    can: capabilitiesOf(session.user),
    clinicName: config.clinicName,
    ...(config.pixKey ? { pixKey: config.pixKey } : {}),
    crmWebUrl: config.crmWebUrl,
    csrfToken: session.csrfToken,
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  app.post("/api/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const previous = readSession(request);
    if (previous) sessions.delete(previous.id);
    const result = await CrmGateway.login(client, input.email, input.password).catch((error: unknown) => {
      if (error instanceof CrmError && error.status === 404)
        throw new CrmError(503, "login_unavailable", "O CRM ainda não aceita o login pelo painel de vendas. Peça a atualização do CRM (login de usuário na API externa).");
      throw error;
    });
    const session = sessions.create(result.token, result.user);
    reply.setCookie(SESSION_COOKIE, session.id, cookieOptions);
    return sessionInfo(session);
  });

  app.post("/api/auth/logout", async (request, reply) => {
    sessions.delete(request.session?.id);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/session", async (request) => sessionInfo(request.session!));

  app.get("/api/branches", async (request): Promise<BranchesResponse> => {
    const branches = await gatewayOf(request).branches();
    return {
      available: branches !== null,
      branches: (branches ?? [])
        .filter((branch) => branch.active)
        .map(({ id, name, isDefault }) => ({ id, name, isDefault }))
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, "pt-BR")),
    };
  });

  app.get("/api/overview", async (request) => overviewScreen(ctxOf(request), lineOfQuery(request), await goals.read()));

  app.get("/api/groups", async (request) => groupsScreen(ctxOf(request), lineOfQuery(request)));

  app.get("/api/groups/:id", async (request) => {
    const { id } = request.params as { id: string };
    const ctx = ctxOf(request);
    const details = await ctx.gateway.groupDetails(id);
    const strip = <T extends { overdue?: unknown }>(member: T): T => {
      if (ctx.seeFinance) return member;
      const { overdue: _overdue, ...rest } = member;
      return rest as T;
    };
    return {
      ...details,
      businessLine: lineOf(details),
      members: details.members.map(strip),
      waitlist: details.waitlist.map(strip),
    } satisfies GroupDetailsResponse;
  });

  app.post("/api/groups/:id/enroll", async (request): Promise<EnrollResult> => {
    const { id } = request.params as { id: string };
    const input = enrollSchema.parse(request.body);
    const enrollment = await gatewayOf(request).enroll(id, input.patientId);
    if (enrollment.status === "waitlisted")
      return {
        status: "waitlisted",
        ...(enrollment.queuePosition ? { queuePosition: enrollment.queuePosition } : {}),
        message: `Turma cheia: o cliente entrou na lista de espera${enrollment.queuePosition ? ` (posição ${enrollment.queuePosition})` : ""}.`,
      };
    return { status: "active", message: "Cliente inscrito na turma." };
  });

  app.post("/api/groups/:id/sell", async (request) => {
    const { id } = request.params as { id: string };
    const input = sellSchema.parse(request.body);
    const gateway = gatewayOf(request);
    const templates = (await gateway.planTemplates()) ?? [];
    const template = templates.find((item) => item.id === input.planTemplateId && item.active);
    if (!template) throw new CrmError(400, "plan_template", "Plano não encontrado ou inativo.");
    const validFrom = today();
    const validUntil = planValidUntil(validFrom, template.planType as PlanType | null | undefined);
    const result = (await gateway.write("POST", "/plans/purchases", {
      idempotencyKey: randomUUID(),
      groupId: id,
      plan: {
        planTemplateId: template.id,
        patientId: input.patientId,
        kind: template.kind ?? "recurring",
        name: template.name,
        services: template.services.map(({ serviceId, totalSessions, totalValueInCents }) => ({ serviceId, totalSessions, totalValueInCents })),
        validFrom,
        ...(validUntil ? { validUntil } : {}),
        totalValueInCents: template.totalValueInCents,
        installments: input.installments,
        firstDueDate: input.firstDueDate,
        ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
      },
    })) as { enrollment?: { status?: string; queuePosition?: number } };
    const waitlisted = result.enrollment?.status === "waitlisted";
    return {
      status: waitlisted ? "waitlisted" : "active",
      message: waitlisted ? "Plano vendido. A turma está cheia: o cliente entrou na lista de espera." : "Plano vendido e cliente inscrito na turma.",
    } satisfies EnrollResult;
  });

  app.post("/api/groups/:id/enrollments/:enrollmentId/cancel", async (request): Promise<CancelEnrollmentResult> => {
    const { id, enrollmentId } = request.params as { id: string; enrollmentId: string };
    const gateway = gatewayOf(request);
    const before = await gateway.groupDetailsFresh(id);
    await gateway.cancelEnrollment(enrollmentId);
    const after = await gateway.groupDetailsFresh(id);
    const waiting = new Set(before.waitlist.map((member) => member.enrollmentId));
    const promoted = after.members.find((member) => member.status === "active" && waiting.has(member.enrollmentId));
    return {
      message: promoted ? `Inscrição cancelada. ${promoted.patientName} saiu da espera e entrou na vaga.` : "Inscrição cancelada.",
      ...(promoted ? { promotedName: promoted.patientName } : {}),
    };
  });

  app.post("/api/groups/:id/waitlist/:enrollmentId/promote", async (request) => {
    const { id, enrollmentId } = request.params as { id: string; enrollmentId: string };
    try {
      await gatewayOf(request).promoteFromWaitlist(id, enrollmentId);
    } catch (error) {
      if (error instanceof CrmError && error.status === 404 && error.code === "http_404")
        throw new CrmError(501, "not_available", "O CRM ainda não oferece a promoção da lista de espera pelo dashboard.");
      throw error;
    }
    return { message: "Cliente promovido da lista de espera." };
  });

  app.get("/api/plan-templates", async (request) => {
    const templates = await gatewayOf(request).planTemplates();
    return { available: templates !== null, templates: (templates ?? []).filter((template) => template.active) };
  });

  app.get("/api/patients", async (request) => {
    const { search } = z.object({ search: z.string().trim().max(120).optional() }).parse(request.query);
    return gatewayOf(request).patients(search, 20);
  });

  app.post("/api/patients", async (request) => {
    const input = patientSchema.parse(request.body);
    return gatewayOf(request).write("POST", "/patients", { ...input, tags: [] });
  });

  app.get("/api/waitlist", async (request) => waitlistScreen(ctxOf(request), lineOfQuery(request)));

  app.post("/api/waitlist", async (request) => {
    const input = waitlistCreateSchema.parse(request.body);
    return gatewayOf(request).write("POST", "/waitlist", { ...input, kind: "service" });
  });

  app.patch("/api/waitlist/:id", async (request) => {
    const { id } = request.params as { id: string };
    return gatewayOf(request).write("PATCH", `/waitlist/${encodeURIComponent(id)}`, waitlistUpdateSchema.parse(request.body));
  });

  app.delete("/api/waitlist/:id", async (request) => {
    const { id } = request.params as { id: string };
    await gatewayOf(request).write("DELETE", `/waitlist/${encodeURIComponent(id)}`);
    return { ok: true };
  });

  /** Inscreve quem estava na espera numa turma com vaga e marca a entrada como atendida. */
  app.post("/api/waitlist/:id/enroll", async (request): Promise<EnrollResult> => {
    const { id } = request.params as { id: string };
    const { groupId, patientId } = z.object({ groupId: z.string().min(1), patientId: z.string().min(1) }).parse(request.body);
    const gateway = gatewayOf(request);
    const enrollment = await gateway.enroll(groupId, patientId);
    if (enrollment.status === "waitlisted")
      return { status: "waitlisted", message: "A vaga acabou de ser ocupada: o cliente entrou na espera da turma." };
    await gateway.write("PATCH", `/waitlist/${encodeURIComponent(id)}`, { status: "served" });
    return { status: "active", message: "Cliente inscrito e retirado da lista de espera." };
  });

  app.get("/api/overdue", async (request) => overdueScreen(ctxOf(request), lineOfQuery(request)));

  app.get("/api/leads", async (request) => {
    const { dias } = z.object({ dias: z.coerce.number().int().min(1).max(90).default(3) }).parse(request.query);
    return leadsScreen(ctxOf(request), dias);
  });

  app.patch("/api/leads/:id/stage", async (request) => {
    const { id } = request.params as { id: string };
    return gatewayOf(request).write("PATCH", `/leads/${encodeURIComponent(id)}/stage`, leadStageSchema.parse(request.body));
  });

  app.post("/api/leads/:id/contacts", async (request) => {
    const { id } = request.params as { id: string };
    const input = leadContactSchema.parse(request.body);
    return gatewayOf(request).write("POST", `/leads/${encodeURIComponent(id)}/contacts`, { ...input, direction: "outbound" });
  });

  app.post("/api/leads/:id/convert", async (request) => {
    const { id } = request.params as { id: string };
    return gatewayOf(request).write("POST", `/leads/${encodeURIComponent(id)}/convert`, leadConvertSchema.parse(request.body));
  });

  const salesRange = (request: FastifyRequest) => {
    const query = periodQuery.parse(request.query);
    const to = query.to ?? today();
    const from = query.from ?? monthStart(to.slice(0, 7));
    if (from > to) throw new CrmError(400, "validation", "A data inicial deve ser anterior à final.");
    if (addDays(from, 366) < to) throw new CrmError(400, "validation", "Escolha um período de até um ano.");
    return { from, to, line: parseLineFilter(query.linha) };
  };

  app.get("/api/sales", async (request) => {
    const { from, to, line } = salesRange(request);
    return salesScreen(ctxOf(request), from, to, line);
  });

  app.get("/api/sales.csv", async (request, reply) => {
    const { from, to, line } = salesRange(request);
    const report = await salesScreen(ctxOf(request), from, to, line);
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="vendas-${from}-a-${to}.csv"`);
    return salesCsv(report);
  });

  app.get("/api/goals", async (request) => {
    const current = await goals.read();
    return { ...current, total: goalFor(current, "all"), canEdit: request.session!.user.role === "admin" };
  });

  app.put("/api/goals", async (request, reply) => {
    if (request.session!.user.role !== "admin") return sendError(reply, 403, "forbidden", "Só administradores definem as metas.");
    return goals.write(goalsSchema.parse(request.body));
  });

  app.all("/api/*", async (_request, reply) => sendError(reply, 404, "not_found", "Rota não encontrada."));

  // Produção: o mesmo processo serve o site (SPA) — um só app Node na Hostinger.
  if (config.staticDir && existsSync(config.staticDir)) {
    await app.register(fastifyStatic, { root: config.staticDir });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/") && !request.url.startsWith("/assets/")) return reply.sendFile("index.html");
      return sendError(reply, 404, "not_found", "Rota não encontrada.");
    });
  }

  return app;
}
