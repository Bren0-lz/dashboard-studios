import { describe, expect, it } from "vitest";
import type { GroupDetailsResponse, GroupsResponse, LeadsResponse, OverdueResponse, OverviewResponse, SalesResponse, SessionInfo, WaitlistResponse } from "@dash/shared";
import { createHarness, API_KEY } from "./test-support/harness.js";

describe("sessão e segurança", () => {
  it("exige login e não expõe a chave nem o token do CRM", async () => {
    const { app, login } = await createHarness();
    expect((await app.inject({ method: "GET", url: "/api/groups" })).statusCode).toBe(401);
    const session = await login();
    expect(session.response.statusCode).toBe(200);
    const raw = session.response.cookies[0]!;
    expect(raw).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    expect(session.response.body).not.toContain(API_KEY);
    const info = session.response.json() as SessionInfo;
    expect(info.user.fullName).toBe("Aryana Mendes");
    expect(info.can.enroll).toBe(true);
    expect(JSON.stringify(info)).not.toMatch(/token"/);
  });

  it("recusa senha errada com a mensagem do CRM", async () => {
    const { login } = await createHarness();
    const session = await login("admin@aryana.com", "errada");
    expect(session.response.statusCode).toBe(401);
    expect(session.response.json()).toMatchObject({ message: "E-mail ou senha inválidos." });
  });

  it("exige o token CSRF nas gravações", async () => {
    const { app, login } = await createHarness();
    const session = await login();
    const response = await app.inject({ method: "PUT", url: "/api/goals", headers: { cookie: session.cookie }, payload: { studio: 1, aesthetics: 1 } });
    expect(response.statusCode).toBe(403);
    expect((await session.send("PUT", "/api/goals", { studio: 100, aesthetics: 50 })).statusCode).toBe(200);
  });

  it("encerra a sessão no logout", async () => {
    const { login } = await createHarness();
    const session = await login();
    await session.send("POST", "/api/auth/logout");
    expect((await session.get("/api/session")).statusCode).toBe(401);
  });

  it("esconde as ações sem permissão e o CRM recusa a inscrição (403)", async () => {
    const { login } = await createHarness();
    const session = await login("vendas@aryana.com");
    const info = session.response.json() as SessionInfo;
    expect(info.can).toMatchObject({ enroll: false, seeFinance: false, manageWaitlist: true });
    const groups = (await session.get("/api/groups")).json() as GroupsResponse;
    const target = groups.groups.find((group) => group.freeSeats > 0)!;
    const response = await session.send("POST", `/api/groups/${target.id}/enroll`, { patientId: "00000000-0000-4000-8000-540000000047" });
    expect(response.statusCode).toBe(403);
    expect(groups.groups.every((group) => group.overdueInCents === 0)).toBe(true);
    expect((await session.get("/api/overdue")).json()).toMatchObject({ available: false });
  });
});

describe("turmas", () => {
  it("ordena pela receita parada e filtra por linha", async () => {
    const { login } = await createHarness();
    const session = await login();
    const all = (await session.get("/api/groups")).json() as GroupsResponse;
    expect(all.features).toEqual({ businessLine: true, overdue: true, planSale: true });
    const idle = all.groups.map((group) => group.idleRevenueInCents);
    expect(idle).toEqual([...idle].sort((a, b) => b - a));
    const studio = (await session.get("/api/groups?linha=studio")).json() as GroupsResponse;
    const aesthetics = (await session.get("/api/groups?linha=aesthetics")).json() as GroupsResponse;
    expect(studio.groups.every((group) => group.businessLine === "studio")).toBe(true);
    expect(aesthetics.groups.map((group) => group.name).sort()).toEqual(["Laser Qua 14h", "Limpeza de pele Sáb 10h"]);
    expect(studio.groups.length + aesthetics.groups.length).toBe(all.groups.length);
    expect(all.totals.overdueMembers).toBeGreaterThan(0);
  });

  it("mostra inscritos com atraso", async () => {
    const { login } = await createHarness();
    const session = await login();
    const groups = (await session.get("/api/groups")).json() as GroupsResponse;
    const withOverdue = groups.groups.find((group) => group.overdueMembers > 0)!;
    const details = (await session.get(`/api/groups/${withOverdue.id}`)).json() as GroupDetailsResponse;
    expect(details.members.some((member) => member.overdue && member.overdue.daysOverdue > 0)).toBe(true);
  });

  it("inscreve em turma com vaga, manda para a espera quando cheia e promove ao remover", async () => {
    const { login } = await createHarness();
    const session = await login();
    const groups = (await session.get("/api/groups")).json() as GroupsResponse;
    const open = groups.groups.find((group) => group.name === "Pilates Sáb 9h")!;
    const full = groups.groups.find((group) => group.name === "Pilates Ter/Qui 18h")!;
    const patientId = "00000000-0000-4000-8000-540000000047";

    const enrolled = await session.send("POST", `/api/groups/${open.id}/enroll`, { patientId });
    expect(enrolled.json()).toMatchObject({ status: "active", message: "Cliente inscrito na turma." });

    const waitlisted = await session.send("POST", `/api/groups/${full.id}/enroll`, { patientId });
    expect(waitlisted.json()).toMatchObject({ status: "waitlisted", queuePosition: 4 });

    const details = (await session.get(`/api/groups/${full.id}`)).json() as GroupDetailsResponse;
    const first = details.waitlist[0]!;
    const cancel = await session.send("POST", `/api/groups/${full.id}/enrollments/${details.members[0]!.enrollmentId}/cancel`);
    expect(cancel.json()).toMatchObject({ promotedName: first.patientName });
    const after = (await session.get(`/api/groups/${full.id}`)).json() as GroupDetailsResponse;
    expect(after.members.some((member) => member.enrollmentId === first.enrollmentId)).toBe(true);
  });

  it("vende plano com turma", async () => {
    const { login } = await createHarness();
    const session = await login();
    const templates = (await session.get("/api/plan-templates")).json() as { available: boolean; templates: { id: string; name: string }[] };
    expect(templates.available).toBe(true);
    const groups = (await session.get("/api/groups")).json() as GroupsResponse;
    const open = groups.groups.find((group) => group.name === "Pilates Sáb 9h")!;
    const sold = await session.send("POST", `/api/groups/${open.id}/sell`, {
      patientId: "00000000-0000-4000-8000-540000000046",
      planTemplateId: templates.templates[0]!.id,
      installments: 1,
      firstDueDate: "2026-11-05",
    });
    expect(sold.json()).toMatchObject({ status: "active", message: "Plano vendido e cliente inscrito na turma." });
    const after = (await session.get("/api/groups")).json() as GroupsResponse;
    expect(after.groups.find((group) => group.id === open.id)!.enrolled).toBe(open.enrolled + 1);
  });
});

describe("lista de espera", () => {
  it("destaca quem já tem vaga compatível e inscreve tirando da espera", async () => {
    const { login } = await createHarness();
    const session = await login();
    const list = (await session.get("/api/waitlist")).json() as WaitlistResponse;
    const ready = list.rows.find((row) => row.compatibleGroups.length > 0)!;
    expect(list.rows[0]!.compatibleGroups.length).toBeGreaterThan(0);
    const response = await session.send("POST", `/api/waitlist/${ready.id}/enroll`, { groupId: ready.compatibleGroups[0]!.id, patientId: ready.patientId });
    expect(response.json()).toMatchObject({ status: "active" });
    const after = (await session.get("/api/waitlist")).json() as WaitlistResponse;
    expect(after.rows.some((row) => row.id === ready.id)).toBe(false);
  });

  it("filtra a espera pela linha do serviço", async () => {
    const { login } = await createHarness();
    const session = await login();
    const list = (await session.get("/api/waitlist?linha=aesthetics")).json() as WaitlistResponse;
    expect(list.rows.map((row) => row.itemName).sort()).toEqual(["Depilação a laser", "Limpeza de pele"]);
  });
});

describe("inadimplência", () => {
  it("agrupa por faixa e põe o risco (turma cheia com fila) primeiro", async () => {
    const { login } = await createHarness();
    const session = await login();
    const overdue = (await session.get("/api/overdue")).json() as OverdueResponse;
    expect(overdue.available).toBe(true);
    expect(overdue.clients).toBeGreaterThan(0);
    expect(overdue.bands.map((band) => band.band)).toEqual(["1-7", "8-30", "31-60", "60+"]);
    expect(overdue.risk.every((row) => row.atRisk)).toBe(true);
    const counted = overdue.risk.length + overdue.bands.reduce((sum, band) => sum + band.rows.length, 0);
    expect(counted).toBe(overdue.clients);
  });
});

describe("visão geral, vendas e leads", () => {
  it("monta os indicadores e as oportunidades do dia", async () => {
    const { login } = await createHarness();
    const session = await login();
    const overview = (await session.get("/api/overview")).json() as OverviewResponse;
    expect(overview.month).toBe("2026-10");
    expect(overview.goal?.goalInCents).toBe(2_800_000);
    // Descontos do cliente nas vendas do mês, vindos do CRM.
    expect(overview.sales.discounts.customerInCents).toBeGreaterThan(0);
    expect(overview.sales.discounts.customerInCents % 1_500).toBe(0);
    expect(overview.dailySales).toHaveLength(31);
    expect(overview.opportunities.length).toBeGreaterThan(0);
    expect(overview.opportunities[0]!.kind).toBe("offer_seat");
    expect(new Set(overview.opportunities.map((item) => item.kind))).toContain("lead_stalled");
    expect(overview.waitlist.withSeat).toBeGreaterThan(0);
  });

  it("separa Studio × Estética e exporta CSV", async () => {
    const { login } = await createHarness();
    const session = await login();
    const sales = (await session.get("/api/sales?from=2026-10-01&to=2026-10-31")).json() as SalesResponse;
    expect(sales.byLine.studio + sales.byLine.aesthetics).toBe(sales.summary.netSalesInCents);
    expect(sales.previous).toMatchObject({ from: "2026-08-31", to: "2026-09-30" });
    const studio = (await session.get("/api/sales?from=2026-10-01&to=2026-10-31&linha=studio")).json() as SalesResponse;
    expect(studio.summary.netSalesInCents).toBe(sales.byLine.studio);
    expect(studio.partialLine).toBe(true);
    const csv = await session.get("/api/sales.csv?from=2026-10-01&to=2026-10-31");
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body.split("\r\n")[0]).toContain("Data;Tipo;Cliente;Item");
  });

  it("valida o período de vendas", async () => {
    const { login } = await createHarness();
    const session = await login();
    expect((await session.get("/api/sales?from=2026-10-31&to=2026-10-01")).statusCode).toBe(400);
  });

  it("move lead, registra contato e converte", async () => {
    const { login } = await createHarness();
    const session = await login();
    const board = (await session.get("/api/leads")).json() as LeadsResponse;
    expect(board.columns.map((column) => column.label)).toEqual(["Novos", "Em contato", "Avaliação", "Proposta", "Ganhos", "Perdidos"]);
    const lead = board.columns[0]!.leads[0]!;
    expect((await session.send("PATCH", `/api/leads/${lead.id}/stage`, { stage: "contacted" })).statusCode).toBe(200);
    expect((await session.send("POST", `/api/leads/${lead.id}/contacts`, { channel: "whatsapp", notes: "Mandei os horários" })).statusCode).toBe(200);
    const converted = await session.send("POST", `/api/leads/${lead.id}/convert`, { cpf: "52998224725" });
    expect(converted.json()).toMatchObject({ lead: { stage: "won" } });
    const after = (await session.get("/api/leads")).json() as LeadsResponse;
    expect(after.columns.find((column) => column.stage === "won")!.leads.some((item) => item.id === lead.id)).toBe(true);
  });
});

describe("CRM sem a fase 0", () => {
  it("funciona com o que existe e avisa o que falta", async () => {
    const { login } = await createHarness({ withoutPhase0: true });
    const session = await login();
    expect(session.response.statusCode).toBe(502);
    expect(session.response.json()).toMatchObject({ code: "login_unavailable" });
  });
});
