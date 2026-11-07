import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "./App";
import styles from "./styles.css?raw";
import { startServer } from "./test/server";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

async function login(user: ReturnType<typeof userEvent.setup>, email = "admin@aryana.com") {
  await user.type(await screen.findByLabelText("E-mail"), email);
  await user.type(screen.getByLabelText("Senha"), "senha123");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

/** A tela de turmas abre na tabela (PT7); os testes dos cartões trocam a exibição. */
async function showCards(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Cartões" }));
}

beforeEach(() => {
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => vi.unstubAllGlobals());

describe("login e tela inicial", () => {
  it("entra com a conta do CRM e abre na tela de turmas", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/");
    await login(user, "admin@aryana.com");
    expect(await screen.findByRole("heading", { name: "Onde tenho vaga para vender?" })).toBeInTheDocument();
    expect(await screen.findByText("Receita parada")).toBeInTheDocument();
    const nav = screen.getByRole("navigation");
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Turmas", "Calendário", "Lista de espera"]);
  });

  it("leva o endereço antigo da inadimplência para as turmas, com os filtros", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/inadimplencia?linha=aesthetics");
    await login(user);
    expect(await screen.findByRole("heading", { name: "Onde tenho vaga para vender?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calendário" }).getAttribute("href")).toContain("linha=aesthetics");
  });

  it("mostra o erro de senha", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/");
    await user.type(await screen.findByLabelText("E-mail"), "admin@aryana.com");
    await user.type(screen.getByLabelText("Senha"), "errada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("E-mail ou senha inválidos.")).toBeInTheDocument();
  });
});

describe("turmas", () => {
  it("filtra Estética pela URL e inscreve um cliente em turma com vaga", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    await showCards(user);
    await screen.findByRole("heading", { name: "Onde tenho vaga para vender?" });
    await user.click(screen.getByRole("button", { name: "Estética" }));
    await waitFor(() => expect(screen.queryByText("Pilates Ter/Qui 18h")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Tudo" }));
    const card = await screen.findByRole("article", { name: "Pilates Sáb 9h" });
    expect(card).toHaveTextContent("2/8 · 6 vagas");
    await user.click(within(card).getByRole("button", { name: /Inscrever/ }));
    const dialog = await screen.findByRole("dialog", { name: "Inscrever em Pilates Sáb 9h" });
    await user.type(within(dialog).getByLabelText("Buscar cliente"), "Clara");
    await user.click(await within(dialog).findByRole("button", { name: /Clara/ }));
    await user.click(within(dialog).getByRole("button", { name: "Confirmar inscrição" }));
    expect(await screen.findByText("Cliente inscrito na turma.")).toBeInTheDocument();
    // O cache do servidor foi limpo na gravação: o cartão atualiza na hora.
    await waitFor(() => expect(screen.getByRole("article", { name: "Pilates Sáb 9h" })).toHaveTextContent("3/8 · 5 vagas"));
    expect(within(screen.getByRole("article", { name: "Pilates Sáb 9h" })).getAllByText(/^[A-ZÀ-Ú]{2}$/)).toHaveLength(3);
  });

  it("inscreve pela turma cheia e mostra a espera que vem do CRM", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    await showCards(user);
    const card = await screen.findByRole("article", { name: "Pilates Seg/Qua 19h" });
    expect(card).toHaveTextContent("6/6 · turma cheia");
    await user.click(within(card).getByRole("button", { name: /Espera/ }));
    const dialog = await screen.findByRole("dialog", { name: "Inscrever em Pilates Seg/Qua 19h" });
    await user.type(within(dialog).getByLabelText("Buscar cliente"), "Clara");
    await user.click(await within(dialog).findByRole("button", { name: /Clara/ }));
    await user.click(within(dialog).getByRole("button", { name: "Colocar na espera" }));
    expect(await screen.findByText(/^Turma cheia: o cliente entrou na lista de espera \(posição \d+\)\.$/)).toBeInTheDocument();
  });

  it("mostra os cartões com bolinhas de iniciais, +N e vagas", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    await showCards(user);
    const big = await screen.findByRole("article", { name: "Dança Ter/Qui 19h" });
    expect(big).toHaveTextContent("9/12 · 3 vagas");
    const stack = within(big).getByRole("button", { name: "Ver alunos de Dança Ter/Qui 19h" });
    expect(within(stack).getAllByText(/^[A-ZÀ-Ú]{2}$/)).toHaveLength(5);
    expect(within(stack).getByText("+4")).toBeInTheDocument();
    const small = screen.getByRole("article", { name: "Pilates Seg/Qua 7h" });
    expect(within(small).getAllByText(/^[A-ZÀ-Ú]{2}$/)).toHaveLength(5);
    expect(within(small).queryByText(/^\+\d+$/)).not.toBeInTheDocument();
    await user.click(stack);
    expect(await screen.findByRole("dialog", { name: "Dança Ter/Qui 19h" })).toBeInTheDocument();
  });

  it("com um CRM sem os nomes na lista, mostra os cartões sem bolinhas", async () => {
    await startServer({ withoutMemberNames: true });
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    await showCards(user);
    const card = await screen.findByRole("article", { name: "Dança Ter/Qui 19h" });
    expect(card).toHaveTextContent("9/12 · 3 vagas");
    expect(within(card).queryByRole("button", { name: /^Ver alunos de/ })).not.toBeInTheDocument();
    expect(within(card).queryByText(/^[A-ZÀ-Ú]{2}$/)).not.toBeInTheDocument();
  });

  it("abre o modal da turma, com os inadimplentes marcados, pelo \"Pagamentos atrasados\" do cartão", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    await showCards(user);
    const card = await screen.findByRole("article", { name: "Pilates Ter/Qui 18h" });
    const overdue = within(card).getByRole("button", { name: /Pagamentos atrasados: \d+ clientes? · R\$/ });
    const count = Number(/(\d+) clientes?/.exec(overdue.textContent ?? "")?.[1]);
    await user.click(overdue);
    const modal = await screen.findByRole("dialog", { name: "Pilates Ter/Qui 18h" });
    expect(await within(modal).findAllByText(/^Inadimplente · R\$ [\d.,]+ · há \d+ dias?$/)).toHaveLength(count);
  });

  it("abre o modal com os alunos, telefone e WhatsApp", async () => {
    const { crm } = await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    await user.click(await screen.findByRole("button", { name: "Dança Ter/Qui 19h" }));
    const modal = await screen.findByRole("dialog", { name: "Dança Ter/Qui 19h" });
    expect(modal).toHaveClass("modal");
    const group = crm.state.groups.find((item) => item.name === "Dança Ter/Qui 19h")!;
    const ids = crm.state.enrollments.filter((item) => item.groupId === group.id && item.status === "active").map((item) => item.patientId);
    const withWhatsapp = crm.state.patients.find((item) => ids.includes(item.id) && item.whatsapp)!;
    const item = (await within(modal).findByText(withWhatsapp.fullName)).closest("li")!;
    expect(item).toHaveTextContent(/\(11\) 9\d{4}-\d{4} · WhatsApp \(11\) 9\d{4}-\d{4}/);
    const link = within(item).getByRole("link", { name: `WhatsApp de ${withWhatsapp.fullName}` });
    expect(link.getAttribute("href")).toContain(`https://wa.me/55${withWhatsapp.whatsapp}`);
    expect(within(modal).getAllByRole("link", { name: /^WhatsApp de / })).toHaveLength(ids.length);
  });

  it("sem permissão de ver clientes, o modal mostra só os nomes, sem WhatsApp", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user, "vendas@aryana.com");
    await user.click(await screen.findByRole("button", { name: "Dança Ter/Qui 19h" }));
    const modal = await screen.findByRole("dialog", { name: "Dança Ter/Qui 19h" });
    expect(await within(modal).findAllByRole("listitem")).toHaveLength(9);
    expect(within(modal).queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(modal).not.toHaveTextContent(/\(11\)/);
  });

  it("abre o modal com selo de atraso e confirma a remoção explicando a promoção", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    await user.click(await screen.findByRole("button", { name: "Pilates Ter/Qui 18h" }));
    const drawer = await screen.findByRole("dialog", { name: "Pilates Ter/Qui 18h" });
    expect(await within(drawer).findAllByText(/^Inadimplente · R\$ [\d.,]+ · há \d+ dias?$/)).not.toHaveLength(0);
    const removeButtons = within(drawer).getAllByRole("button", { name: /^Remover .* da turma$/ });
    await user.click(removeButtons[0]!);
    const confirm = await screen.findByRole("dialog", { name: "Remover da turma" });
    expect(within(confirm).getByText(/entra automaticamente/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Remover da turma" }));
    expect(await within(drawer).findByText(/saiu da espera e entrou na vaga/)).toBeInTheDocument();
  });

  it("mostra a tabela no formato do CRM, com matriculados, totais e filtros", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    const table = await screen.findByRole("table", { name: "Turmas" });
    for (const header of ["Turma", "Horários", "Matriculados", "Vagas disponíveis", "Faturamento atual", "Potencial (turma cheia)"]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    const row = within(table).getByRole("button", { name: "Pilates Ter/Qui 18h" }).closest("tr")!;
    expect(row).toHaveTextContent("Terça · 18:00–19:00, Quinta · 18:00–19:00");
    const toggle = within(row).getByRole("button", { name: /^Ver matriculados de Pilates Ter\/Qui 18h: \d+ de 8$/ });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const members = await screen.findByRole("list", { name: "Matriculados de Pilates Ter/Qui 18h" });
    expect(within(members).getAllByRole("listitem")[0]).toHaveTextContent(/Desde \d{2} de .+ · (R\$|Sem plano ativo)/);

    const totalRow = () => within(table).getByRole("rowheader", { name: "Total" }).closest("tr")!;
    const before = totalRow().textContent;
    await user.selectOptions(screen.getByRole("combobox", { name: "Dia da semana" }), "6");
    expect(within(table).queryByRole("button", { name: "Pilates Ter/Qui 18h" })).not.toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Pilates Sáb 9h" })).toBeInTheDocument();
    expect(totalRow().textContent).not.toBe(before);
    expect(screen.getByText(/Valores por mês\. O faturamento atual soma/)).toBeInTheDocument();
  });

  it("esconde ações sem permissão", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user, "vendas@aryana.com");
    await screen.findByRole("button", { name: "Pilates Sáb 9h" });
    expect(screen.queryByRole("button", { name: /Inscrever/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Inadimplentes")).not.toBeInTheDocument();
  });
});

describe("tabela de turmas (PT7)", () => {
  const overdueMark = /^Inadimplente · R\$ [\d.,]+ · há \d+ dias?$/;
  const groupRowOf = (table: HTMLElement, name: string) => within(table).getByRole("button", { name }).closest("tr")!;
  const cellsOf = (row: HTMLElement) => [...row.children].map((cell) => `${cell.tagName}:${cell.getAttribute("data-label") ?? ""}`);

  it("abre na tabela por padrão, com os cartões na alternância", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    expect(await screen.findByRole("table", { name: "Turmas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tabela" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Cartões" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    await showCards(user);
    expect(await screen.findByRole("article", { name: "Pilates Ter/Qui 18h" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Turmas" })).not.toBeInTheDocument();
  });

  it("com finance.view, marca o inadimplente na lista de matriculados da tabela e no modal", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    const table = await screen.findByRole("table", { name: "Turmas" });
    const row = groupRowOf(table, "Pilates Ter/Qui 18h");
    const overdueCell = row.querySelector('[data-label="Inadimplentes"]')!;
    const count = Number(/^\s*(\d+) ·/.exec(overdueCell.textContent ?? "")?.[1]);
    expect(count).toBeGreaterThan(0);
    // Mesmo tom da coluna Inadimplentes: ícone + vermelho.
    expect(overdueCell.querySelector(".icon-count.text-bad svg")).not.toBeNull();

    await user.click(within(row).getByRole("button", { name: /^Ver matriculados de Pilates Ter\/Qui 18h/ }));
    const members = await screen.findByRole("list", { name: "Matriculados de Pilates Ter/Qui 18h" });
    const marks = within(members).getAllByText(overdueMark);
    expect(marks).toHaveLength(count);
    for (const mark of marks) {
      expect(mark).toHaveClass("icon-count", "text-bad");
      expect(mark.querySelector("svg")).not.toBeNull();
      expect(mark.closest("li")).toHaveClass("is-overdue");
    }
    const upToDate = within(members).getAllByRole("listitem").filter((item) => !item.classList.contains("is-overdue"));
    for (const item of upToDate) expect(item).not.toHaveTextContent("Inadimplente");
    // PT8: cada nome é um botão que abre a ficha do cliente.
    expect(within(members).getAllByRole("button")).toHaveLength(within(members).getAllByRole("listitem").length);

    await user.click(within(row).getByRole("button", { name: "Pilates Ter/Qui 18h" }));
    const modal = await screen.findByRole("dialog", { name: "Pilates Ter/Qui 18h" });
    expect(await within(modal).findAllByText(overdueMark)).toHaveLength(count);
  });

  it("sem finance.view, a lista de matriculados e o modal não mostram inadimplência", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user, "vendas@aryana.com");
    const table = await screen.findByRole("table", { name: "Turmas" });
    expect(within(table).queryByRole("columnheader", { name: "Inadimplentes" })).not.toBeInTheDocument();
    const row = groupRowOf(table, "Pilates Ter/Qui 18h");
    await user.click(within(row).getByRole("button", { name: /^Ver matriculados de Pilates Ter\/Qui 18h/ }));
    const members = await screen.findByRole("list", { name: "Matriculados de Pilates Ter/Qui 18h" });
    expect(within(members).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(members).not.toHaveTextContent("Inadimplente");
    expect(members.querySelector(".is-overdue")).toBeNull();

    await user.click(within(row).getByRole("button", { name: "Pilates Ter/Qui 18h" }));
    const modal = await screen.findByRole("dialog", { name: "Pilates Ter/Qui 18h" });
    expect(await within(modal).findAllByRole("listitem")).not.toHaveLength(0);
    expect(modal).not.toHaveTextContent("Inadimplente");
  });

  it("abrir a lista de matriculados não muda as colunas: larguras fixas e a lista numa linha própria", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    const table = await screen.findByRole("table", { name: "Turmas" });
    const headers = within(table).getAllByRole("columnheader");
    // Uma <col> por coluna, e a tabela com layout fixo (o conteúdo das linhas não muda as larguras).
    expect(table.querySelectorAll("colgroup > col")).toHaveLength(headers.length);
    expect(table).toHaveClass("groups-table", "with-overdue", "with-actions");
    expect(styles).toMatch(/\.groups-table \{[^}]*table-layout: fixed;/);

    const row = groupRowOf(table, "Pilates Ter/Qui 18h");
    const before = cellsOf(row);
    expect(before).toHaveLength(headers.length);
    const rowsBefore = table.querySelectorAll("tbody > tr").length;
    const toggle = within(row).getByRole("button", { name: /^Ver matriculados de Pilates Ter\/Qui 18h/ });
    await user.click(toggle);
    const members = await screen.findByRole("list", { name: "Matriculados de Pilates Ter/Qui 18h" });

    // A turma mantém as mesmas células, na mesma ordem; a lista vem na linha seguinte, ocupando todas as colunas.
    expect(cellsOf(groupRowOf(table, "Pilates Ter/Qui 18h"))).toEqual(before);
    expect(row).not.toContainElement(members);
    const membersRow = members.closest("tr")!;
    expect(row.nextElementSibling).toBe(membersRow);
    expect(membersRow.id).toBe(toggle.getAttribute("aria-controls"));
    expect(membersRow.children).toHaveLength(1);
    expect(membersRow.children[0]).toHaveAttribute("colspan", String(headers.length));
    expect(table.querySelectorAll("tbody > tr")).toHaveLength(rowsBefore + 1);
    expect(table.querySelectorAll("colgroup > col")).toHaveLength(headers.length);

    await user.click(toggle);
    await waitFor(() => expect(screen.queryByRole("list", { name: "Matriculados de Pilates Ter/Qui 18h" })).not.toBeInTheDocument());
    expect(table.querySelectorAll("tbody > tr")).toHaveLength(rowsBefore);
  });

  it("sem inadimplência nem inscrição, o colgroup acompanha as colunas que sobram", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user, "vendas@aryana.com");
    const table = await screen.findByRole("table", { name: "Turmas" });
    expect(table.querySelectorAll("colgroup > col")).toHaveLength(within(table).getAllByRole("columnheader").length);
    expect(table).not.toHaveClass("with-overdue");
    expect(table).not.toHaveClass("with-actions");
  });
});

describe("filiais", () => {
  it("filtra as turmas pela filial escolhida no topo e mantém a escolha ao trocar de tela", async () => {
    const { calls } = await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    expect(await screen.findByRole("button", { name: "Pilates Ter/Qui 18h" })).toBeInTheDocument();
    const select = await screen.findByLabelText("Filial");
    // No topo da tela de turmas, ao lado do título (e não duplicado na barra de cima).
    expect(screen.getByRole("heading", { name: "Onde tenho vaga para vender?" }).closest("header")).toContainElement(select);
    expect(screen.getAllByLabelText("Filial")).toHaveLength(1);
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Todas as filiais", "Centro", "Barra"]);
    await user.selectOptions(select, "Barra");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Pilates Ter/Qui 18h" })).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: "Pilates Sáb 9h" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Lista de espera" }));
    expect(await screen.findByRole("heading", { name: "Quem está pronto para comprar?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Filial")).toHaveDisplayValue("Barra");
    expect(calls.filter((call) => call.url === "/api/waitlist").map((call) => call.branch)).toEqual(["00000000-0000-4000-8000-510000000002"]);
  });

  it("esconde o seletor quando o CRM ainda não lista as filiais", async () => {
    await startServer({ withoutBranches: true });
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    expect(await screen.findByRole("button", { name: "Pilates Ter/Qui 18h" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Filial")).not.toBeInTheDocument();
  });
});

describe("espera e calendário", () => {
  it("destaca vaga compatível na lista de espera", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/espera");
    await login(user);
    expect((await screen.findAllByText(/Há vaga compatível agora/)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Oferecer vaga/ })[0]).toHaveAttribute("href", expect.stringContaining("https://wa.me/55"));
  });

  it("mostra o calendário no formato da agenda do CRM e o mapa de calor", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/calendario");
    await login(user);
    expect(await screen.findByRole("region", { name: "Agenda da semana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Semana" })).toHaveClass("active");
    await user.click(screen.getByRole("button", { name: "Mês" }));
    expect(await screen.findByText("Seg", { selector: ".month-weekdays span" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dia" }));
    expect(await screen.findByRole("table", { name: "Agenda do dia por profissional" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Lista" }));
    await user.click(screen.getByRole("button", { name: "Mapa de calor" }));
    expect(await screen.findByText(/Ocupação média por dia e horário/)).toBeInTheDocument();
  });
});

describe("filtro por linha e por serviço (PT6)", () => {
  const openServices = async (user: ReturnType<typeof userEvent.setup>) => user.click(await screen.findByText(/^Serviços/, { selector: "summary" }));

  it("filtra as turmas por vários serviços, marca o inativo e leva a escolha para as outras telas", async () => {
    const { calls } = await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    await showCards(user);
    expect(await screen.findByRole("article", { name: "Pilates Ter/Qui 18h" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Linha de negócio" })).toHaveTextContent("TudoStudioEstéticaOutros");
    await openServices(user);
    const menu = screen.getByRole("group", { name: "Serviços" });
    expect(within(menu).getByRole("group", { name: "Outros" })).toHaveTextContent("Avaliação funcional");
    await user.click(within(menu).getByRole("checkbox", { name: "Pilates Solo (inativo)" }));
    await user.click(within(menu).getByRole("checkbox", { name: "Dançaterapia" }));
    await waitFor(() => expect(screen.queryByRole("article", { name: "Pilates Ter/Qui 18h" })).not.toBeInTheDocument());
    expect(await screen.findByRole("article", { name: "Pilates Solo Sex 10h" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Dança Ter/Qui 19h" })).toBeInTheDocument();
    expect(screen.getByText("Serviços (2)", { selector: "summary" })).toBeInTheDocument();

    // A escolha vai na URL e acompanha a navegação.
    await user.click(screen.getByRole("link", { name: "Lista de espera" }));
    expect(await screen.findByRole("heading", { name: "Quem está pronto para comprar?" })).toBeInTheDocument();
    const waitlistCall = calls.find((call) => call.url.startsWith("/api/waitlist"))!;
    const query = new URLSearchParams(waitlistCall.url.split("?")[1]);
    expect(query.get("servicos")?.split(",").sort()).toEqual(["00000000-0000-4000-8000-510000000002", "00000000-0000-4000-8000-510000000006"]);
    await openServices(user);
    expect(screen.getByRole("checkbox", { name: "Dançaterapia" })).toBeChecked();
    expect(screen.getByRole("link", { name: "Turmas" }).getAttribute("href")).toContain("servicos=");

    // Trocar para Estética tira os serviços do Studio e mostra só os da linha.
    await user.click(screen.getByRole("button", { name: "Estética" }));
    await waitFor(() => expect(screen.getByText("Serviços", { selector: "summary" })).toBeInTheDocument());
    expect(screen.queryByRole("checkbox", { name: "Dançaterapia" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Limpeza de pele" })).not.toBeChecked();
  });
});

describe("CRM sem a fase 0", () => {
  it("avisa que o login como usuário ainda não existe", async () => {
    await startServer({ withoutPhase0: true });
    const user = userEvent.setup();
    renderAt("/");
    await login(user);
    expect(await screen.findByText(/ainda não aceita o login pelo painel/)).toBeInTheDocument();
  });
});
