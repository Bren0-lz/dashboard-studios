import { describe, expect, it } from "vitest";
import type { BranchesResponse, FiltersResponse, GroupDetailsResponse, GroupsResponse, LeadsResponse, OverdueResponse, OverviewResponse, SalesResponse, SessionInfo, WaitlistResponse } from "@dash/shared";
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
    // Turma de serviço inativo (fora de `/services`) entra pela linha que vem na própria turma.
    expect(studio.groups.map((group) => group.name)).toContain("Pilates Solo Sex 10h");
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

  it("repassa os nomes dos inscritos ativos que vêm na lista do CRM (PX4), sem ler cada turma", async () => {
    const { login, crmCalls } = await createHarness();
    const session = await login();
    crmCalls.length = 0;
    const response = await session.get("/api/groups");
    expect(response.statusCode).toBe(200);
    expect(crmCalls).toContain("GET /groups");
    expect(crmCalls.filter((call) => /^GET \/groups\/./.test(call))).toEqual([]);
    const groups = response.json() as GroupsResponse;
    const full = groups.groups.find((group) => group.name === "Pilates Ter/Qui 18h")!;
    const details = (await session.get(`/api/groups/${full.id}`)).json() as GroupDetailsResponse;
    expect(full.memberNames).toEqual(details.members.map((member) => member.patientName));
    expect(full.memberNames).not.toContain(details.waitlist[0]!.patientName);
    expect(groups.groups.every((group) => group.memberNames?.length === group.enrolled)).toBe(true);
    // A visão geral também não lê turma por turma.
    crmCalls.length = 0;
    expect((await session.get("/api/overview")).statusCode).toBe(200);
    expect(crmCalls.filter((call) => /^GET \/groups\/./.test(call))).toEqual([]);
  });

  it("com um CRM sem memberNames (antes da PX4), a tela de turmas responde sem as bolinhas", async () => {
    const { login } = await createHarness({ withoutMemberNames: true });
    const session = await login();
    const response = await session.get("/api/groups");
    expect(response.statusCode).toBe(200);
    const groups = response.json() as GroupsResponse;
    expect(groups.groups.length).toBeGreaterThan(0);
    expect(groups.groups.every((group) => group.memberNames === undefined)).toBe(true);
  });

  it("mostra o contato dos alunos (telefone e WhatsApp) só a quem tem patients.view", async () => {
    const { login } = await createHarness();
    const admin = await login();
    const groups = (await admin.get("/api/groups")).json() as GroupsResponse;
    const id = groups.groups.find((group) => group.name === "Dança Ter/Qui 19h")!.id;
    const seen = (await admin.get(`/api/groups/${id}`)).json() as GroupDetailsResponse;
    expect(seen.members.every((member) => member.phone)).toBe(true);
    expect(seen.members.some((member) => member.whatsapp && member.whatsapp !== member.phone)).toBe(true);

    const sales = await login("vendas@aryana.com");
    const hidden = (await sales.get(`/api/groups/${id}`)).json() as GroupDetailsResponse;
    expect(hidden.members.map((member) => member.patientName)).toEqual(seen.members.map((member) => member.patientName));
    for (const member of [...hidden.members, ...hidden.waitlist]) {
      expect(member).not.toHaveProperty("phone");
      expect(member).not.toHaveProperty("whatsapp");
      expect(member).not.toHaveProperty("email");
    }
  });

  it("depois de inscrever, o cartão e o detalhe da turma saem atualizados apesar do cache de 45 s", async () => {
    const { crm, login } = await createHarness();
    const session = await login();
    const before = (await session.get("/api/groups")).json() as GroupsResponse;
    const open = before.groups.find((group) => group.name === "Pilates Sáb 9h")!;
    await session.get(`/api/groups/${open.id}`);
    const patientId = "00000000-0000-4000-8000-540000000047";
    const enrolled = await session.send("POST", `/api/groups/${open.id}/enroll`, { patientId });
    expect(enrolled.json()).toMatchObject({ status: "active" });
    const after = ((await session.get("/api/groups")).json() as GroupsResponse).groups.find((group) => group.id === open.id)!;
    expect(after.enrolled).toBe(open.enrolled + 1);
    expect(after.freeSeats).toBe(open.freeSeats - 1);
    // Os nomes vêm da lista (já sem o cache velho), com quem acabou de entrar no fim.
    const newcomer = crm.state.patients.find((item) => item.id === patientId)!.fullName;
    expect(after.memberNames).toEqual([...open.memberNames!, newcomer]);
    const details = (await session.get(`/api/groups/${open.id}`)).json() as GroupDetailsResponse;
    expect(details.members.some((member) => member.patientId === patientId)).toBe(true);
  });

  it("na turma cheia, inscrever põe na espera com a posição vinda do CRM", async () => {
    const { login } = await createHarness();
    const session = await login();
    const groups = (await session.get("/api/groups")).json() as GroupsResponse;
    const full = groups.groups.find((group) => group.name === "Pilates Seg/Qua 19h")!;
    const result = await session.send("POST", `/api/groups/${full.id}/enroll`, { patientId: "00000000-0000-4000-8000-540000000047" });
    expect(result.json()).toEqual({ status: "waitlisted", queuePosition: 3, message: "Turma cheia: o cliente entrou na lista de espera (posição 3)." });
    const after = ((await session.get("/api/groups")).json() as GroupsResponse).groups.find((group) => group.id === full.id)!;
    expect(after.waitlistCount).toBe(full.waitlistCount + 1);
    expect(after.enrolled).toBe(full.enrolled);
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

  it("filtra pela turma do cartão (?turma=) com a mesma contagem do cartão", async () => {
    const { login } = await createHarness();
    const session = await login();
    const groups = (await session.get("/api/groups?linha=studio")).json() as GroupsResponse;
    const group = groups.groups.find((item) => item.name === "Pilates Ter/Qui 18h")!;
    expect(group.overdueMembers).toBeGreaterThan(0);
    const overdue = (await session.get(`/api/overdue?linha=aesthetics&turma=${group.id}`)).json() as OverdueResponse;
    expect(overdue.group).toEqual({ id: group.id, name: "Pilates Ter/Qui 18h" });
    expect(overdue.clients).toBe(group.overdueMembers);
    const rows = [...overdue.risk, ...overdue.bands.flatMap((band) => band.rows)];
    expect(rows.every((row) => row.groups.some((item) => item.groupId === group.id))).toBe(true);
    expect(overdue.totalInCents).toBe(group.overdueInCents);
  });

  it("sem acesso ao financeiro, os cartões não trazem os atrasos", async () => {
    const { login } = await createHarness();
    const session = await login("vendas@aryana.com");
    const groups = (await session.get("/api/groups")).json() as GroupsResponse;
    expect(groups.features.overdue).toBe(false);
    expect(groups.groups.every((group) => group.overdueMembers === 0 && group.overdueInCents === 0)).toBe(true);
    expect((await session.get("/api/overdue")).json()).toMatchObject({ available: false, clients: 0 });
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
    // O plano combinado (Pilates + Limpeza de pele, R$ 500) entra inteiro nas duas linhas.
    expect(sales.byLine.studio + sales.byLine.aesthetics + sales.byLine.other - 50_000).toBe(sales.summary.netSalesInCents);
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

describe("filiais", () => {
  const CENTRO = "00000000-0000-4000-8000-510000000001";
  const BARRA = "00000000-0000-4000-8000-510000000002";

  it("lista as filiais com a padrão primeiro e filtra as telas pela escolhida", async () => {
    const { app, login } = await createHarness();
    const session = await login();
    const list = (await session.get("/api/branches")).json() as BranchesResponse;
    expect(list).toEqual({
      available: true,
      branches: [
        { id: CENTRO, name: "Centro", isDefault: true },
        { id: BARRA, name: "Barra", isDefault: false },
      ],
    });
    const inBranch = (url: string, branch: string) => app.inject({ method: "GET", url, headers: { cookie: session.cookie, "x-branch-id": branch } });
    const all = (await session.get("/api/groups")).json() as GroupsResponse;
    const barra = (await (await inBranch("/api/groups", BARRA)).json()) as GroupsResponse;
    const centro = (await (await inBranch("/api/groups", CENTRO)).json()) as GroupsResponse;
    expect(barra.groups.map((group) => group.name).sort()).toEqual(["Dança Sex 15h", "Limpeza de pele Sáb 10h", "Pilates Sáb 9h"]);
    expect(barra.groups.length + centro.groups.length).toBe(all.groups.length);
    expect(barra.totals.capacity + centro.totals.capacity).toBe(all.totals.capacity);
    expect((await inBranch("/api/overview", BARRA)).statusCode).toBe(200);
    // O cache não mistura as filiais.
    expect(((await session.get("/api/groups")).json() as GroupsResponse).groups).toHaveLength(all.groups.length);
  });

  it("recusa filial que o usuário não acessa com a mensagem do CRM", async () => {
    const { app, login } = await createHarness();
    const session = await login();
    const response = await app.inject({ method: "GET", url: "/api/groups", headers: { cookie: session.cookie, "x-branch-id": "filial-inexistente" } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ message: "Seu usuário não tem acesso a esta filial." });
    // A lista continua disponível para trocar a filial salva.
    const list = await app.inject({ method: "GET", url: "/api/branches", headers: { cookie: session.cookie, "x-branch-id": "filial-inexistente" } });
    expect((list.json() as BranchesResponse).branches).toHaveLength(2);
  });

  it("sem a lista de filiais no CRM, avisa que não há seletor", async () => {
    const { login } = await createHarness({ withoutBranches: true });
    const session = await login();
    expect((await session.get("/api/branches")).json()).toEqual({ available: false, branches: [] });
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

describe("filtro por linha e por serviço (PT6)", () => {
  const svc = (n: number) => `00000000-0000-4000-8000-51${String(n).padStart(10, "0")}`;
  const PILATES = svc(1);
  const DANCA = svc(2);
  const PELE = svc(4);
  const AVALIACAO = svc(5);
  const SOLO = svc(6);
  const MONTH = "from=2026-10-01&to=2026-10-31";
  const overdueRows = (report: OverdueResponse) => [...report.risk, ...report.bands.flatMap((band) => band.rows)];

  it("lista os serviços ativos por linha e o inativo que ainda tem turma, marcado como inativo", async () => {
    const { login } = await createHarness();
    const session = await login();
    const filters = (await session.get("/api/filters")).json() as FiltersResponse;
    expect(filters.lines).toBe(true);
    expect(filters.services.map((item) => [item.name, item.line, item.active])).toEqual([
      ["Avaliação funcional", "other", true],
      ["Dançaterapia", "studio", true],
      ["Depilação a laser", "aesthetics", true],
      ["Limpeza de pele", "aesthetics", true],
      ["Pilates", "studio", true],
      ["Pilates Solo", "studio", false],
    ]);
  });

  it("filtra turmas e espera por um ou vários serviços", async () => {
    const { login } = await createHarness();
    const session = await login();
    const solo = (await session.get(`/api/groups?servicos=${SOLO}`)).json() as GroupsResponse;
    expect(solo.groups.map((group) => group.name)).toEqual(["Pilates Solo Sex 10h"]);
    const two = (await session.get(`/api/groups?servicos=${PILATES},${DANCA}`)).json() as GroupsResponse;
    expect(two.groups.map((group) => group.name).sort()).toEqual([
      "Dança Sex 15h",
      "Dança Ter/Qui 19h",
      "Pilates Seg/Qua 19h",
      "Pilates Seg/Qua 7h",
      "Pilates Sáb 9h",
      "Pilates Ter/Qui 18h",
    ]);
    expect(two.totals.groups).toBe(6);
    // Serviço de outra linha que a escolhida: nada.
    expect(((await session.get(`/api/groups?linha=aesthetics&servicos=${PILATES}`)).json() as GroupsResponse).groups).toEqual([]);
    expect(((await session.get("/api/groups?linha=other")).json() as GroupsResponse).groups).toEqual([]);
    const waitlist = (await session.get(`/api/waitlist?servicos=${PILATES}`)).json() as WaitlistResponse;
    expect(waitlist.rows).toHaveLength(3);
    expect(waitlist.rows.every((row) => row.serviceId === PILATES)).toBe(true);
    expect(waitlist.services).toEqual([{ id: PILATES, name: "Pilates" }]);
  });

  it("plano com dois serviços em duas linhas aparece nas duas, e a seleção conta a venda uma vez", async () => {
    const { login } = await createHarness();
    const session = await login();
    const get = async (query: string) => (await session.get(`/api/sales?${MONTH}&${query}`)).json() as SalesResponse;
    const combo = (report: SalesResponse) => report.sales.filter((sale) => sale.itemName === "Combo Pilates + Limpeza de pele");
    const studio = await get("linha=studio");
    const aesthetics = await get("linha=aesthetics");
    expect(combo(studio)).toHaveLength(1);
    expect(combo(aesthetics)).toHaveLength(1);
    expect(combo(aesthetics)[0]!.amountInCents).toBe(50_000);
    const pilates = await get(`servicos=${PILATES}`);
    const pele = await get(`servicos=${PELE}`);
    const both = await get(`servicos=${PILATES},${PELE}`);
    expect(combo(both)).toHaveLength(1);
    expect(both.summary.netSalesInCents).toBe(pilates.summary.netSalesInCents + pele.summary.netSalesInCents - 50_000);
    expect(both.summary.netSalesInCents).toBe(both.sales.reduce((sum, sale) => sum + (sale.kind === "sale" ? sale.amountInCents : -sale.amountInCents), 0));
    expect(both.daily.reduce((sum, day) => sum + day.total, 0)).toBe(both.summary.netSalesInCents);
    expect(both.partialLine).toBe(true);
    expect(both.saleServices).toBe(true);
    // "Tudo" inclui Estética e Outros.
    const all = await get("linha=all");
    expect(all.summary.netSalesInCents).toBeGreaterThan(studio.summary.netSalesInCents + aesthetics.summary.netSalesInCents - 50_000);
  });

  it("venda de produto entra pela linha do próprio produto, e não na escolha de serviços", async () => {
    const { login } = await createHarness();
    const session = await login();
    const items = async (query: string) => ((await session.get(`/api/sales?${MONTH}&${query}`)).json() as SalesResponse).sales.map((sale) => sale.itemName);
    const studio = await items("linha=studio");
    expect(studio).toContain("Meia antiderrapante");
    expect(studio).not.toContain("Óleo corporal");
    expect(await items("linha=aesthetics")).toContain("Óleo corporal");
    const other = await items("linha=other");
    expect(new Set(other)).toEqual(new Set(["Vale-presente", "Avaliação funcional"]));
    expect(await items(`servicos=${AVALIACAO}`)).toEqual(["Avaliação funcional"]);
    expect(await items(`servicos=${PILATES}`)).not.toContain("Meia antiderrapante");
    const csv = await session.get(`/api/sales.csv?${MONTH}&linha=studio`);
    expect(csv.body).toContain("Combo Pilates + Limpeza de pele;Plano;Studio, Estética");
  });

  it("inadimplência pelos serviços e produtos das parcelas; sem vínculo, só em Tudo", async () => {
    const { crm, login } = await createHarness();
    const session = await login();
    const names = async (query: string) => overdueRows((await session.get(`/api/overdue?${query}`)).json() as OverdueResponse).map((row) => row.patientName);
    const combo = crm.state.patients[44]!.fullName;
    const product = crm.state.patients[45]!.fullName;
    const unlinked = crm.state.patients[47]!.fullName;
    const all = await names("");
    const studio = await names("linha=studio");
    const aesthetics = await names("linha=aesthetics");
    const other = await names("linha=other");
    expect(all).toEqual(expect.arrayContaining([combo, product, unlinked]));
    expect(studio).toContain(combo);
    expect(aesthetics).toContain(combo);
    expect(other).toEqual([product]);
    for (const list of [studio, aesthetics, other]) expect(list).not.toContain(unlinked);
    expect(await names(`servicos=${PELE}`)).toContain(combo);
    expect(await names(`servicos=${PILATES},${PELE}`)).not.toContain(product);
    // A visão geral usa o mesmo filtro.
    const overview = (await session.get("/api/overview?linha=other")).json() as OverviewResponse;
    expect(overview.overdue).toMatchObject({ clients: 1, totalInCents: 10_000 });
    expect(overview.goal).toBeNull();
    const byService = (await session.get(`/api/overview?servicos=${PILATES}`)).json() as OverviewResponse;
    expect(byService.goal).toBeNull();
    expect(byService.features.saleServices).toBe(true);
    expect(byService.dailySales.reduce((sum, day) => sum + day.total, 0)).toBe(byService.sales.currentInCents);
  });

  it("com um CRM sem os campos da PX5, volta a deduzir pela turma e não quebra", async () => {
    const { crm, login } = await createHarness({ withoutLineDetails: true });
    const session = await login();
    const sales = (await session.get(`/api/sales?${MONTH}`)).json() as SalesResponse;
    expect(sales.saleServices).toBe(false);
    expect(sales.sales.every((sale) => sale.services === undefined)).toBe(true);
    // Sem `services`, cada venda conta só na linha que o CRM informa.
    expect(sales.byLine.studio + sales.byLine.aesthetics + sales.byLine.other).toBe(sales.summary.netSalesInCents);
    const studio = (await session.get(`/api/sales?${MONTH}&linha=studio`)).json() as SalesResponse;
    expect(studio.summary.netSalesInCents).toBe(sales.byLine.studio);
    const byService = (await session.get(`/api/sales?${MONTH}&servicos=${PILATES}`)).json() as SalesResponse;
    expect(byService.sales).toEqual([]);
    const overview = (await session.get(`/api/overview?servicos=${PILATES}`)).json() as OverviewResponse;
    expect(overview.features.saleServices).toBe(false);
    // Inadimplência: pela turma do cliente (o atraso sem turma volta a contar como Studio).
    const rows = (query: string) => session.get(`/api/overdue?${query}`).then((response) => overdueRows(response.json() as OverdueResponse));
    const unlinked = crm.state.patients[47]!.fullName;
    expect((await rows("linha=studio")).map((row) => row.patientName)).toContain(unlinked);
    const pilatesRows = await rows(`servicos=${PILATES}`);
    expect(pilatesRows.length).toBeGreaterThan(0);
    expect(pilatesRows.every((row) => row.groups.some((group) => group.groupName.startsWith("Pilates")))).toBe(true);
  });
});
