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
    const row = (await screen.findByRole("button", { name: "Pilates Sáb 9h" })).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: /Inscrever/ }));
    const dialog = await screen.findByRole("dialog", { name: "Inscrever em Pilates Sáb 9h" });
    await user.type(within(dialog).getByLabelText("Buscar cliente"), "Clara");
    await user.click(await within(dialog).findByRole("button", { name: /Clara/ }));
    await user.click(within(dialog).getByRole("button", { name: "Confirmar inscrição" }));
    expect(await screen.findByText("Cliente inscrito na turma.")).toBeInTheDocument();
  });

  it("abre a gaveta com selo de atraso e confirma a remoção explicando a promoção", async () => {
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

describe("CRM sem a fase 0", () => {
  it("avisa que o login como usuário ainda não existe", async () => {
    await startServer({ withoutPhase0: true });
    const user = userEvent.setup();
    renderAt("/");
    await login(user);
    expect(await screen.findByText(/ainda não aceita o login pelo painel/)).toBeInTheDocument();
  });
});
