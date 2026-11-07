import { describe, expect, it } from "vitest";
import type { PatientDetailsResponse, PatientPaymentsResponse, SessionInfo } from "@dash/shared";
import { buildApp, SESSION_COOKIE } from "./app.js";
import { memoryGoalsStore } from "./goals-store.js";
import { buildMockCrm } from "./mock-crm/app.js";
import { API_KEY, createHarness, injectFetch, testConfig, TODAY } from "./test-support/harness.js";

/** 1ª aluna de Pilates Ter/Qui 18h: o histórico variado do CRM simulado. */
const PATIENT = "00000000-0000-4000-8000-540000000001";
const PELE = "00000000-0000-4000-8000-510000000004";
const id = (n: number) => `00000000-0000-4000-8000-58${String(n).padStart(10, "0")}`;

type Available<T> = Extract<T, { available: true }>;
const payments = async (session: { get: (url: string) => Promise<{ statusCode: number; json: () => unknown }> }, query = "") => {
  const response = await session.get(`/api/patients/${PATIENT}/payments${query ? `?${query}` : ""}`);
  expect(response.statusCode).toBe(200);
  return response.json() as Available<PatientPaymentsResponse>;
};

describe("ficha do cliente (PT8)", () => {
  it("com patients.view, traz os dados cadastrais, as turmas e os planos ativos", async () => {
    const { login, crmCalls } = await createHarness();
    const admin = await login();
    const response = await admin.get(`/api/patients/${PATIENT}`);
    expect(response.statusCode).toBe(200);
    const details = response.json() as Available<PatientDetailsResponse>;
    expect(details).toMatchObject({ available: true, id: PATIENT, fullName: "Maria Souza" });
    expect(details.record).toMatchObject({
      recordNumber: "000001",
      status: "active",
      cpf: expect.any(String),
      birthDate: "1988-04-12",
      emergencyContactName: "João Souza",
      city: "São Paulo",
      imageConsent: true,
      interests: ["Pilates", "Limpeza de pele"],
    });
    expect(details.record!.groups).toEqual([expect.objectContaining({ groupName: "Pilates Ter/Qui 18h", status: "active" })]);
    expect(details.record!.branches.map((branch) => branch.name)).toEqual(["Centro"]);
    expect(details.record!.activePlans.length).toBeGreaterThan(0);
    // Etiqueta automática do atraso: só porque o admin também vê o financeiro.
    expect(details.record!.tags).toContain("Pagamento atrasado");
    expect(crmCalls).toContain(`GET /patients/${PATIENT}`);
  });

  it("valida o id do cliente e repassa o 404 do CRM para cliente inexistente", async () => {
    const { login } = await createHarness();
    const admin = await login();
    expect((await admin.get("/api/patients/nao-e-um-id")).statusCode).toBe(400);
    expect((await admin.get("/api/patients/nao-e-um-id/payments")).statusCode).toBe(400);
    const missing = await admin.get("/api/patients/00000000-0000-4000-8000-549999999999");
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "PATIENT_NOT_FOUND" });
    expect((await admin.get("/api/patients/00000000-0000-4000-8000-549999999999/payments")).statusCode).toBe(404);
  });
});

describe("histórico de pagamentos (PT8)", () => {
  it("traz todas as origens e situações, do vencimento mais recente ao mais antigo, com os totais", async () => {
    const { login } = await createHarness();
    const history = await payments(await login());
    expect(history.available).toBe(true);
    expect(history.referenceDate).toBe(TODAY);
    const rows = history.payments;
    expect(new Set(rows.map((row) => row.origin))).toEqual(new Set(["plan", "tab", "sale", "manual"]));
    expect(new Set(rows.map((row) => row.status))).toEqual(new Set(["open", "overdue", "paid", "partially_paid", "cancelled"]));
    const dues = rows.map((row) => row.dueDate);
    expect(dues).toEqual([...dues].sort().reverse());

    // Baixa parcial: a comanda paga com o saldo em aberto, que herda a origem e os serviços.
    const partial = rows.find((row) => row.id === id(9100))!;
    expect(partial).toMatchObject({ status: "partially_paid", origin: "tab", balanceReceivableId: id(9101), paymentMethod: "card", paidInCents: 14_900 });
    expect(rows.find((row) => row.id === id(9101))).toMatchObject({ status: "open", origin: "tab", balanceOfReceivableId: id(9100), services: [expect.objectContaining({ id: PELE })] });
    // Estorno: venda cancelada e comanda que voltou a ficar em aberto.
    expect(rows.find((row) => row.id === id(9102))).toMatchObject({ status: "cancelled", origin: "sale", reversed: true, paidInCents: 0, reversals: [expect.objectContaining({ amountInCents: 3_500 })] });
    expect(rows.find((row) => row.id === id(9103))).toMatchObject({ status: "open", reversed: true, paidInCents: 0 });
    expect(rows.find((row) => row.id === id(9104))).toMatchObject({ origin: "manual", status: "paid", discountInCents: 800 });

    const sum = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((total, row) => total + pick(row), 0);
    expect(history.totals).toEqual({
      count: rows.length,
      amountInCents: sum((row) => row.amountInCents),
      paidInCents: sum((row) => row.paidInCents),
      openInCents: sum((row) => (row.status === "open" || row.status === "overdue" ? row.amountInCents : 0)),
      overdueInCents: sum((row) => (row.status === "overdue" ? row.amountInCents : 0)),
    });
    expect(history.totals.overdueInCents).toBeGreaterThan(0);
  });

  it("filtra por situação, origem, serviço, linha e período, repassando os filtros ao CRM", async () => {
    const { login, crmCalls } = await createHarness();
    const admin = await login();
    const ids = async (query: string) => (await payments(admin, query)).payments.map((row) => row.id).sort();

    expect(await ids("status=partially_paid")).toEqual([id(9100)]);
    expect(await ids("status=reversed")).toEqual([id(9102), id(9103)]);
    expect((await payments(admin, "status=overdue")).payments.every((row) => row.status === "overdue" && row.origin === "plan")).toBe(true);
    expect(await ids("origin=sale")).toEqual([id(9102)]);
    expect(await ids("origin=tab,manual")).toEqual([id(9100), id(9101), id(9103), id(9104)]);
    expect(await ids(`serviceId=${PELE}`)).toEqual([id(9100), id(9101)]);
    // "Outros": a comanda da avaliação funcional (serviço sem classificação). Lançamento manual não entra em linha nenhuma.
    expect(await ids("businessLine=other")).toEqual([id(9103)]);
    const studio = await payments(admin, "businessLine=studio");
    expect(studio.payments.filter((row) => row.origin !== "plan").map((row) => row.id)).toEqual([id(9102)]);
    expect(studio.payments.filter((row) => row.origin === "plan").length).toBe(3);

    // Período pelo vencimento e pelo pagamento (data das baixas).
    expect(await ids("dateField=due&from=2026-11-01&to=2026-11-30")).toEqual(expect.arrayContaining([id(9101), id(9103)]));
    expect((await payments(admin, "dateField=due&from=2026-11-01")).payments.every((row) => row.dueDate >= "2026-11-01")).toBe(true);
    expect(await ids("dateField=paid&from=2026-10-29&to=2026-10-30")).toEqual([id(9103)]);
    const filtered = await payments(admin, "status=paid,partially_paid&origin=tab");
    expect(filtered.totals).toMatchObject({ count: 1, amountInCents: 14_900, paidInCents: 14_900, openInCents: 0 });

    // O BFF repassa os filtros com os nomes da API do CRM.
    expect(crmCalls.filter((call) => call === `GET /patients/${PATIENT}/payments`).length).toBeGreaterThan(5);
  });

  it("recusa filtro inválido antes de chamar o CRM", async () => {
    const { login, crmCalls } = await createHarness();
    const admin = await login();
    for (const query of ["status=pago", "origin=loja", "businessLine=spa", "serviceId=123", "dateField=hoje", "from=31-10-2026", "from=2026-11-10&to=2026-11-01"]) {
      const response = await admin.get(`/api/patients/${PATIENT}/payments?${query}`);
      expect(response.statusCode, query).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation" });
    }
    expect(crmCalls.some((call) => call.includes("/payments"))).toBe(false);
  });
});

describe("permissões da ficha (iguais às do CRM)", () => {
  it("com as duas permissões, dados e histórico", async () => {
    const { login } = await createHarness();
    const admin = await login();
    expect((admin.response.json() as SessionInfo).can).toMatchObject({ seePatients: true, seeFinance: true });
    expect(((await admin.get(`/api/patients/${PATIENT}`)).json() as Available<PatientDetailsResponse>).record).toBeDefined();
    expect((await admin.get(`/api/patients/${PATIENT}/payments`)).statusCode).toBe(200);
  });

  it("só com patients.view: dados cadastrais, e o histórico recusado pelo CRM (403 FINANCE_ACCESS_DENIED)", async () => {
    const { login } = await createHarness();
    const session = await login("clientes@aryana.com");
    expect((session.response.json() as SessionInfo).can).toMatchObject({ seePatients: true, seeFinance: false });
    const details = (await session.get(`/api/patients/${PATIENT}`)).json() as Available<PatientDetailsResponse>;
    expect(details.record?.phone).toBeTruthy();
    // Sem Financeiro, a etiqueta automática do atraso não sai.
    expect(details.record?.tags).not.toContain("Pagamento atrasado");
    const denied = await session.get(`/api/patients/${PATIENT}/payments`);
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: "FINANCE_ACCESS_DENIED" });
  });

  it("só com finance.view: o nome sem os dados cadastrais, e o histórico", async () => {
    const { login } = await createHarness();
    const session = await login("financeiro@aryana.com");
    expect((session.response.json() as SessionInfo).can).toMatchObject({ seePatients: false, seeFinance: true });
    const details = (await session.get(`/api/patients/${PATIENT}`)).json();
    expect(details).toEqual({ available: true, id: PATIENT, fullName: "Maria Souza" });
    expect((await payments(session)).payments.length).toBeGreaterThan(0);
  });

  it("sem nenhuma das duas: só o nome, e o histórico recusado", async () => {
    const { login } = await createHarness();
    const session = await login("vendas@aryana.com");
    expect((session.response.json() as SessionInfo).can).toMatchObject({ seePatients: false, seeFinance: false });
    expect((await session.get(`/api/patients/${PATIENT}`)).json()).toEqual({ available: true, id: PATIENT, fullName: "Maria Souza" });
    expect((await session.get(`/api/patients/${PATIENT}/payments`)).statusCode).toBe(403);
  });

  it("o cache de 45 s é por usuário: quem não tem acesso não recebe a ficha lida por outro", async () => {
    const { login } = await createHarness();
    const admin = await login();
    const sales = await login("vendas@aryana.com");
    expect((await admin.get(`/api/patients/${PATIENT}/payments`)).statusCode).toBe(200);
    expect(((await admin.get(`/api/patients/${PATIENT}`)).json() as Available<PatientDetailsResponse>).record).toBeDefined();
    expect((await sales.get(`/api/patients/${PATIENT}/payments`)).statusCode).toBe(403);
    expect((await sales.get(`/api/patients/${PATIENT}`)).json()).not.toHaveProperty("record");
  });
});

describe("CRM sem a PX6 e erros", () => {
  it("sem as rotas no CRM, avisa que a ficha ainda não existe em vez de quebrar", async () => {
    const { login } = await createHarness({ withoutPatientRecord: true });
    const admin = await login();
    const details = await admin.get(`/api/patients/${PATIENT}`);
    expect(details.statusCode).toBe(200);
    expect(details.json()).toEqual({ available: false });
    const history = await admin.get(`/api/patients/${PATIENT}/payments?status=paid`);
    expect(history.statusCode).toBe(200);
    expect(history.json()).toEqual({ available: false });
  });

  it("falha do CRM vira 502 com a mensagem para a tela", async () => {
    const crm = buildMockCrm({ apiKey: API_KEY, today: TODAY });
    const forward = injectFetch(crm.app);
    const app = await buildApp(testConfig(), {
      fetch: (input, init) => (input.includes("/payments") ? Promise.resolve(new Response("{}", { status: 500 })) : forward(input, init)),
      goals: memoryGoalsStore({ studio: 0, aesthetics: 0 }),
      today: () => TODAY,
    });
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin@aryana.com", password: "senha123" } });
    const cookie = `${SESSION_COOKIE}=${login.cookies.find((item) => item.name === SESSION_COOKIE)!.value}`;
    const response = await app.inject({ method: "GET", url: `/api/patients/${PATIENT}/payments`, headers: { cookie } });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ message: "O CRM não conseguiu concluir a operação." });
  });
});
