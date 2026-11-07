import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "./App";
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

beforeEach(() => {
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => vi.unstubAllGlobals());

describe("login e visão geral", () => {
  it("entra com a conta do CRM e mostra indicadores e oportunidades", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/");
    await login(user, "admin@aryana.com");
    expect(await screen.findByRole("heading", { name: "Como estão as vendas hoje?" })).toBeInTheDocument();
    expect(await screen.findByText("Receita parada")).toBeInTheDocument();
    expect(screen.getByText("Em atraso")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Oportunidades de hoje" })).toBeInTheDocument();
    expect(screen.getAllByText(/tem \d+ vagas? e \d+ pessoas? na espera/).length).toBeGreaterThan(0);
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
    const card = await screen.findByRole("article", { name: "Dança Ter/Qui 19h" });
    expect(card).toHaveTextContent("9/12 · 3 vagas");
    expect(within(card).queryByRole("button", { name: /^Ver alunos de/ })).not.toBeInTheDocument();
    expect(within(card).queryByText(/^[A-ZÀ-Ú]{2}$/)).not.toBeInTheDocument();
  });

  it("abre a inadimplência da turma pelo \"Pagamentos atrasados\" do cartão", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/turmas");
    await login(user);
    const card = await screen.findByRole("article", { name: "Pilates Ter/Qui 18h" });
    await user.click(within(card).getByRole("link", { name: /Pagamentos atrasados: \d+ clientes? · R\$/ }));
    expect(await screen.findByRole("heading", { name: "Quem preciso cobrar?" })).toBeInTheDocument();
    expect(await screen.findByText(/Só os clientes em atraso da turma/)).toHaveTextContent("Pilates Ter/Qui 18h");
    const rows = screen.getAllByRole("row").filter((row) => within(row).queryAllByRole("cell").length > 0);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).toHaveTextContent("Pilates Ter/Qui 18h");
    await user.click(screen.getByRole("link", { name: "Ver todos os atrasos" }));
    await waitFor(() => expect(screen.queryByText(/Só os clientes em atraso da turma/)).not.toBeInTheDocument());
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
    expect(await within(drawer).findAllByText(/Atrasado há \d+ dias · R\$/)).not.toHaveLength(0);
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
    await user.click(await screen.findByRole("button", { name: "Tabela" }));
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
    await user.click(screen.getByRole("link", { name: "Visão geral" }));
    expect(await screen.findByRole("heading", { name: "Como estão as vendas hoje?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Filial")).toHaveDisplayValue("Barra");
    expect(calls.filter((call) => call.url === "/api/overview").map((call) => call.branch)).toEqual(["00000000-0000-4000-8000-510000000002"]);
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

describe("espera, inadimplência e calendário", () => {
  it("destaca vaga compatível na lista de espera", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/espera");
    await login(user);
    expect((await screen.findAllByText(/Há vaga compatível agora/)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Oferecer vaga/ })[0]).toHaveAttribute("href", expect.stringContaining("https://wa.me/55"));
  });

  it("agrupa a inadimplência por faixa com cobrança pronta", async () => {
    await startServer();
    const user = userEvent.setup();
    renderAt("/inadimplencia");
    await login(user);
    expect(await screen.findByText("Total em atraso")).toBeInTheDocument();
    const charge = screen.getAllByRole("link", { name: /Cobrar/ })[0]!;
    expect(decodeURIComponent(charge.getAttribute("href")!)).toContain("chave Pix é pix@aryana.com");
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
    await user.click(screen.getByRole("link", { name: "Inadimplência" }));
    expect(await screen.findByRole("heading", { name: "Quem preciso cobrar?" })).toBeInTheDocument();
    const overdueCall = calls.find((call) => call.url.startsWith("/api/overdue"))!;
    const query = new URLSearchParams(overdueCall.url.split("?")[1]);
    expect(query.get("servicos")?.split(",").sort()).toEqual(["00000000-0000-4000-8000-510000000002", "00000000-0000-4000-8000-510000000006"]);
    await openServices(user);
    expect(screen.getByRole("checkbox", { name: "Dançaterapia" })).toBeChecked();
    expect(screen.getByRole("link", { name: "Visão geral" }).getAttribute("href")).toContain("servicos=");

    // Trocar para Estética tira os serviços do Studio e mostra só os da linha.
    await user.click(screen.getByRole("button", { name: "Estética" }));
    await waitFor(() => expect(screen.getByText("Serviços", { selector: "summary" })).toBeInTheDocument());
    expect(screen.queryByRole("checkbox", { name: "Dançaterapia" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Limpeza de pele" })).not.toBeChecked();
  });

  it("mostra Outros nas turmas e na inadimplência; o atraso sem vínculo só aparece em Tudo", async () => {
    const { crm } = await startServer();
    const user = userEvent.setup();
    renderAt("/inadimplencia");
    await login(user);
    const product = crm.state.patients[45]!.fullName;
    const unlinked = crm.state.patients[47]!.fullName;
    expect(await screen.findByText(unlinked)).toBeInTheDocument();
    expect(screen.getByText(product)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outros" }));
    await waitFor(() => expect(screen.queryByText(unlinked)).not.toBeInTheDocument());
    expect(await screen.findByText(product)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Studio" }));
    await waitFor(() => expect(screen.queryByText(product)).not.toBeInTheDocument());
    expect(screen.queryByText(unlinked)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tudo" }));
    expect(await screen.findByText(unlinked)).toBeInTheDocument();
  });

  it("com um CRM sem os serviços nas vendas, avisa na visão geral ao escolher serviços", async () => {
    await startServer({ withoutLineDetails: true });
    const user = userEvent.setup();
    renderAt("/?servicos=00000000-0000-4000-8000-510000000001");
    await login(user);
    expect(await screen.findByText(/O CRM ainda não informa os serviços de cada venda/)).toBeInTheDocument();
    expect(screen.getByText("Faturamento do mês")).toBeInTheDocument();
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
