import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "./App";
import { startServer } from "./test/server";

/** 1ª aluna de Pilates Ter/Qui 18h, com o histórico variado do CRM simulado. */
const NAME = "Maria Souza";
const GROUP = "Pilates Ter/Qui 18h";

type User = ReturnType<typeof userEvent.setup>;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

async function login(user: User, email = "admin@aryana.com") {
  await user.type(await screen.findByLabelText("E-mail"), email);
  await user.type(screen.getByLabelText("Senha"), "senha123");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

/** Abre a lista de matriculados da turma na tabela. */
async function openMembers(user: User) {
  const table = await screen.findByRole("table", { name: "Turmas" });
  const row = within(table).getByRole("button", { name: GROUP }).closest("tr")!;
  await user.click(within(row).getByRole("button", { name: new RegExp(`^Ver matriculados de ${GROUP.replace("/", "\\/")}`) }));
  return screen.findByRole("list", { name: `Matriculados de ${GROUP}` });
}

async function openPatientFromTable(user: User) {
  const members = await openMembers(user);
  await user.click(within(members).getByRole("button", { name: NAME }));
  return screen.findByRole("dialog", { name: NAME });
}

const historyRows = async (modal: HTMLElement) => {
  const table = await within(modal).findByRole("table", { name: "Histórico de pagamentos" });
  return within(table).getAllByRole("row").slice(1);
};

beforeEach(() => {
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => vi.unstubAllGlobals());

describe("ficha do cliente (PT8)", () => {
  it("abre a ficha pelo nome na lista de matriculados, com os dados do CRM e o histórico, e volta à mesma lista", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    await screen.findByRole("table", { name: "Turmas" });
    // Filtro da tabela escolhido antes de abrir a ficha: continua depois de fechar.
    await user.selectOptions(screen.getByRole("combobox", { name: "Dia da semana" }), "2");
    const modal = await openPatientFromTable(user);

    const record = within(modal).getByRole("region", { name: "Dados do cliente" });
    expect(await within(record).findByText("12/04/1988")).toBeInTheDocument();
    expect(record).toHaveTextContent("Contato de emergência");
    expect(record).toHaveTextContent("João Souza");
    expect(record).toHaveTextContent("(11) 98888-7777");
    expect(within(record).getByRole("list", { name: "Etiquetas" })).toHaveTextContent("Pagamento atrasado");
    expect(within(record).getByRole("list", { name: "Turmas do cliente" })).toHaveTextContent(GROUP);

    const rows = await historyRows(modal);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    const text = rows.map((row) => row.textContent ?? "").join("\n");
    for (const label of ["Plano", "Comanda", "Venda de produto", "Lançamento manual", "Paga", "Vencida", "Em aberto", "Parcialmente paga", "Cancelada", "Estornada"]) expect(text).toContain(label);
    // Valores alinhados à direita (coluna numérica).
    const valueCell = rows[0]!.querySelector('[data-label="Valor"]')!;
    expect(valueCell).toHaveClass("num");
    const totals = within(modal).getByLabelText("Totais do histórico");
    expect(totals).toHaveTextContent(`Cobranças${rows.length}`);

    await user.click(within(modal).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog", { name: NAME })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: `Matriculados de ${GROUP}` })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Dia da semana" })).toHaveValue("2");
  });

  it("o card inteiro do aluno abre a ficha: clicar na linha de data e valor, não só no nome", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    const members = await openMembers(user);
    const card = within(members).getByRole("button", { name: NAME });
    expect(card).toHaveClass("member-card");
    expect(card).toHaveAttribute("title", "Ver ficha do cliente");
    // A linha "Desde … · R$ …/mês" fica dentro do botão: clicar nela abre a ficha.
    const detail = within(card).getByText(/^Desde /);
    await user.click(detail);
    expect(await screen.findByRole("dialog", { name: NAME })).toBeInTheDocument();
  });

  it("filtra o histórico por situação, origem, serviço/linha e período, com os totais do filtro", async () => {
    const { calls } = await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    const modal = await openPatientFromTable(user);
    await historyRows(modal);
    const lastQuery = () => new URLSearchParams(calls.filter((call) => call.url.includes("/payments")).at(-1)!.url.split("?")[1] ?? "");
    const descriptions = async () => (await historyRows(modal)).map((row) => row.querySelector(".payment-description strong")!.textContent);

    await user.selectOptions(within(modal).getByRole("combobox", { name: "Situação" }), "partially_paid");
    await waitFor(() => expect(lastQuery().get("status")).toBe("partially_paid"));
    await waitFor(async () => expect(await descriptions()).toEqual(["Comanda — Limpeza de pele e Óleo corporal"]));
    expect(within(modal).getByLabelText("Totais do histórico")).toHaveTextContent("Cobranças1");

    await user.selectOptions(within(modal).getByRole("combobox", { name: "Situação" }), "reversed");
    await waitFor(async () => expect((await descriptions()).sort()).toEqual(["Comanda — Avaliação funcional", "Venda — Meia antiderrapante"]));

    await user.selectOptions(within(modal).getByRole("combobox", { name: "Origem" }), "sale");
    await waitFor(() => expect(lastQuery().get("origin")).toBe("sale"));
    await waitFor(async () => expect(await descriptions()).toEqual(["Venda — Meia antiderrapante"]));

    await user.click(within(modal).getByRole("button", { name: "Limpar filtros" }));
    await user.selectOptions(within(modal).getByRole("combobox", { name: "Serviço ou linha" }), "line:other");
    await waitFor(() => expect(lastQuery().get("businessLine")).toBe("other"));
    await waitFor(async () => expect(await descriptions()).toEqual(["Comanda — Avaliação funcional"]));

    const scope = within(modal).getByRole("combobox", { name: "Serviço ou linha" });
    const pele = within(scope).getByRole("option", { name: "Limpeza de pele" }) as HTMLOptionElement;
    await user.selectOptions(scope, pele.value);
    await waitFor(() => expect(lastQuery().get("serviceId")).toBe(pele.value.slice("service:".length)));
    await waitFor(async () => expect((await descriptions()).sort()).toEqual(["Comanda — Limpeza de pele e Óleo corporal", "Saldo — Comanda Limpeza de pele e Óleo corporal"]));

    await user.click(within(modal).getByRole("button", { name: "Limpar filtros" }));
    await user.selectOptions(within(modal).getByRole("combobox", { name: "Período pelo" }), "paid");
    fireEvent.change(within(modal).getByLabelText("De"), { target: { value: "2026-10-29" } });
    fireEvent.change(within(modal).getByLabelText("Até"), { target: { value: "2026-10-30" } });
    await waitFor(() => expect(Object.fromEntries(lastQuery())).toEqual({ dateField: "paid", from: "2026-10-29", to: "2026-10-30" }));
    await waitFor(async () => expect(await descriptions()).toEqual(["Comanda — Avaliação funcional"]));

    // Período invertido: avisa sem chamar o servidor.
    const before = calls.length;
    fireEvent.change(within(modal).getByLabelText("De"), { target: { value: "2026-11-15" } });
    expect(within(modal).getByText("A data inicial precisa ser anterior à final.")).toBeInTheDocument();
    expect(within(modal).queryByRole("table", { name: "Histórico de pagamentos" })).not.toBeInTheDocument();
    expect(calls.slice(before).some((call) => call.url.includes("/payments"))).toBe(false);

    // Sem nenhuma cobrança no filtro: estado vazio.
    await user.click(within(modal).getByRole("button", { name: "Limpar filtros" }));
    await user.selectOptions(within(modal).getByRole("combobox", { name: "Situação" }), "partially_paid");
    await user.selectOptions(within(modal).getByRole("combobox", { name: "Origem" }), "plan");
    expect(await within(modal).findByText("Nenhuma cobrança com esses filtros")).toBeInTheDocument();
    expect(within(modal).getByLabelText("Totais do histórico")).toHaveTextContent("Cobranças0");
  });

  it("abre a ficha pelo nome no modal da turma (cartões), sobre a turma; Esc fecha só a ficha", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    await user.click(await screen.findByRole("button", { name: "Cartões" }));
    await user.click(await screen.findByRole("button", { name: GROUP }));
    const groupModal = await screen.findByRole("dialog", { name: GROUP });
    await user.click(await within(groupModal).findByRole("button", { name: NAME }));
    const modal = await screen.findByRole("dialog", { name: NAME });
    expect(await within(modal).findByText("12/04/1988")).toBeInTheDocument();
    await historyRows(modal);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: NAME })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: GROUP })).toBeInTheDocument();
  });
});

describe("permissões da ficha (iguais às do CRM)", () => {
  it("só com patients.view: os dados cadastrais e um aviso no lugar do histórico", async () => {
    const { calls } = await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user, "clientes@aryana.com");
    const modal = await openPatientFromTable(user);
    expect(await within(modal).findByText("12/04/1988")).toBeInTheDocument();
    expect(within(modal).getByText("Sem acesso ao Financeiro no CRM: o histórico de pagamentos fica escondido.")).toBeInTheDocument();
    expect(within(modal).queryByRole("table", { name: "Histórico de pagamentos" })).not.toBeInTheDocument();
    expect(modal).not.toHaveTextContent("Pagamento atrasado");
    expect(calls.some((call) => call.url.includes("/payments"))).toBe(false);
  });

  it("só com finance.view: o histórico e um aviso no lugar dos dados cadastrais", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user, "financeiro@aryana.com");
    const modal = await openPatientFromTable(user);
    expect((await historyRows(modal)).length).toBeGreaterThan(0);
    expect(within(modal).getByText("Sem acesso a Clientes no CRM: os dados cadastrais e de contato ficam escondidos.")).toBeInTheDocument();
    expect(modal).not.toHaveTextContent("12/04/1988");
  });

  it("sem nenhuma das duas: o nome aparece, mas não é botão (nem na tabela, nem no modal da turma)", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user, "vendas@aryana.com");
    const members = await openMembers(user);
    expect(within(members).getByText(NAME)).toBeInTheDocument();
    expect(within(members).queryByRole("button")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: GROUP }));
    const groupModal = await screen.findByRole("dialog", { name: GROUP });
    expect(await within(groupModal).findByText(NAME)).toBeInTheDocument();
    expect(within(groupModal).queryByRole("button", { name: NAME })).not.toBeInTheDocument();
  });
});

describe("CRM sem a PX6 e erros", () => {
  it("com um CRM sem a ficha, avisa em vez de quebrar", async () => {
    await startServer({ withoutPatientRecord: true });
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    const modal = await openPatientFromTable(user);
    expect(await within(modal).findByText(/O CRM ainda não tem a ficha do cliente pelo painel/)).toBeInTheDocument();
    expect(within(modal).queryByRole("table")).not.toBeInTheDocument();
  });

  it("erro ao carregar o histórico mostra o aviso com nova tentativa", async () => {
    await startServer();
    const original = globalThis.fetch;
    let fail = true;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      fail && String(input).includes("/payments")
        ? Promise.resolve(new Response(JSON.stringify({ code: "http_500", message: "O CRM não conseguiu concluir a operação." }), { status: 502 }))
        : original(input, init),
    );
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    const modal = await openPatientFromTable(user);
    const history = within(modal).getByRole("region", { name: "Histórico de pagamentos" });
    expect(await within(history).findByText("O CRM não conseguiu concluir a operação.")).toBeInTheDocument();
    // Os dados cadastrais continuam aparecendo.
    expect(await within(modal).findByText("12/04/1988")).toBeInTheDocument();
    fail = false;
    await user.click(within(history).getByRole("button", { name: /Tentar de novo/ }));
    expect((await historyRows(modal)).length).toBeGreaterThan(0);
  });
});
