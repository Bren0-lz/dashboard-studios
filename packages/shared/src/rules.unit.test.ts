import { describe, expect, it } from "vitest";
import type { ExternalGroupRow, WaitlistEntry } from "./crm-types.js";
import {
  buildOpportunities,
  compatibleGroups,
  deficitGroups,
  enrichGroups,
  expiringPlans,
  goalProgress,
  hotSlots,
  idleRevenue,
  occupancyHeatmap,
  portfolioTicket,
  toOverdueView,
  waitlistPosition,
} from "./rules.js";
import { overdueBand, overdueTone } from "./overdue.js";
import { occupancyTone, dayPeriodOf } from "./occupancy.js";
import { whatsappLink, chargeMessage } from "./whatsapp.js";
import { formatMoney, shortDate } from "./format.js";
import { workingDaysBetween } from "./dates.js";

function group(overrides: Partial<ExternalGroupRow>): ExternalGroupRow {
  return {
    id: "g1",
    name: "Pilates Ter/Qui 18h",
    active: true,
    serviceId: "s-pilates",
    serviceName: "Pilates",
    professionalId: "p1",
    professionalName: "Ana",
    roomId: "r1",
    roomName: "Sala 1",
    schedule: "Ter e Qui às 18:00",
    weeklySlots: [
      { weekday: 2, startTime: "18:00", endTime: "19:00" },
      { weekday: 4, startTime: "18:00", endTime: "19:00" },
    ],
    capacity: 8,
    enrolled: 6,
    freeSeats: 2,
    waitlistCount: 0,
    occupancyPercent: 75,
    sessionsPerMonth: 8,
    monthlyRevenueInCents: 6 * 30000,
    potentialMonthlyRevenueInCents: 8 * 30000,
    ...overrides,
  };
}

function entry(overrides: Partial<WaitlistEntry>): WaitlistEntry {
  return {
    id: "w1",
    patientId: "c1",
    patientName: "Maria Souza",
    patientPhone: "11999990000",
    kind: "service",
    serviceId: "s-pilates",
    productId: null,
    itemName: "Pilates",
    status: "waiting",
    notes: "",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

describe("faixas de atraso", () => {
  it.each([
    [0, null],
    [1, "1-7"],
    [7, "1-7"],
    [8, "8-30"],
    [30, "8-30"],
    [31, "31-60"],
    [60, "31-60"],
    [61, "60+"],
  ])("%i dias → %s", (days, band) => {
    expect(overdueBand(days)).toBe(band);
  });

  it("usa amarelo até 7 dias, laranja até 30 e vermelho acima", () => {
    expect(overdueTone(3)).toBe("yellow");
    expect(overdueTone(12)).toBe("orange");
    expect(overdueTone(45)).toBe("red");
  });
});

describe("ocupação e período do dia", () => {
  it("colore a ocupação", () => {
    expect(occupancyTone(100)).toBe("green");
    expect(occupancyTone(60)).toBe("yellow");
    expect(occupancyTone(20)).toBe("red");
  });
  it("classifica o período", () => {
    expect(dayPeriodOf("07:00")).toBe("morning");
    expect(dayPeriodOf("14:30")).toBe("afternoon");
    expect(dayPeriodOf("19:00")).toBe("evening");
  });
});

describe("receita parada (regra 1)", () => {
  it("multiplica vagas livres pelo ticket médio da turma", () => {
    expect(idleRevenue(group({}), 0)).toBe(2 * 30000);
  });
  it("usa o ticket da carteira em turma sem pagantes", () => {
    const empty = group({ id: "g2", enrolled: 0, freeSeats: 8, monthlyRevenueInCents: 0 });
    const fallback = portfolioTicket([group({}), empty]);
    expect(fallback).toBe(30000);
    expect(idleRevenue(empty, fallback)).toBe(8 * 30000);
  });
  it("ordena as turmas pela maior receita parada", () => {
    const rows = enrichGroups(
      [group({ id: "a", freeSeats: 1 }), group({ id: "b", freeSeats: 4, enrolled: 4, monthlyRevenueInCents: 120000 })],
      [entry({})],
    );
    expect(rows.map((row) => row.id)).toEqual(["b", "a"]);
    expect(rows[0]?.serviceWaitlist).toBe(1);
    expect(rows[0]?.businessLine).toBe("studio");
  });
});

describe("espera × vaga (regra 2)", () => {
  it("encontra turmas do mesmo serviço com vaga", () => {
    const groups = [group({}), group({ id: "full", freeSeats: 0 }), group({ id: "other", serviceId: "s-danca" })];
    expect(compatibleGroups(entry({}), groups).map((item) => item.id)).toEqual(["g1"]);
    expect(compatibleGroups(entry({ serviceId: null, kind: "product" }), groups)).toEqual([]);
  });
  it("calcula a posição na fila do mesmo serviço", () => {
    const first = entry({ id: "1", createdAt: "2026-10-01" });
    const second = entry({ id: "2", createdAt: "2026-10-02" });
    const served = entry({ id: "3", createdAt: "2026-09-01", status: "served" });
    expect(waitlistPosition(second, [served, second, first])).toBe(2);
    expect(waitlistPosition(served, [served])).toBeNull();
  });
});

describe("turma deficitária, horário quente e mapa de calor (regras 3 e 4)", () => {
  it("aponta turmas abaixo de 40%", () => {
    expect(deficitGroups([group({ occupancyPercent: 25 }), group({ id: "x" })]).map((g) => g.name)).toHaveLength(1);
  });
  it("sugere abrir turma quando o período está cheio e com fila", () => {
    const full = group({ freeSeats: 0, enrolled: 8, waitlistCount: 3, occupancyPercent: 100 });
    const slots = hotSlots([full]);
    expect(slots).toHaveLength(2);
    expect(slots[0]?.label).toBe("Terça · noite");
    expect(hotSlots([group({ waitlistCount: 3 })])).toEqual([]);
  });
  it("monta a ocupação por dia e hora", () => {
    const cells = occupancyHeatmap([group({}), group({ id: "b", enrolled: 2, capacity: 8, weeklySlots: [{ weekday: 2, startTime: "18:30", endTime: "19:30" }] })]);
    const tuesday = cells.find((cell) => cell.weekday === 2 && cell.hour === 18);
    expect(tuesday).toMatchObject({ groups: 2, occupancyPercent: 50 });
  });
});

describe("inadimplência em turma cheia (regra 5)", () => {
  it("marca como risco quando a turma está cheia com fila", () => {
    const view = toOverdueView(
      {
        patientId: "c1",
        patientName: "Maria",
        groups: [{ groupId: "g1", groupName: "Pilates" }],
        amountInCents: 18000,
        installments: 1,
        oldestDueDate: "2026-10-19",
        daysOverdue: 12,
      },
      [group({ freeSeats: 0, waitlistCount: 2 })],
    );
    expect(view).toMatchObject({ band: "8-30", atRisk: true });
  });
});

describe("renovação e meta (regras 6 e 7)", () => {
  it("lista planos que vencem em até 15 dias", () => {
    const plans = [{ validUntil: "2026-11-05" }, { validUntil: "2026-12-30" }, { validUntil: "2026-10-01" }, {}];
    expect(expiringPlans(plans, "2026-10-31")).toEqual([{ validUntil: "2026-11-05" }]);
  });
  it("calcula quanto falta por dia útil", () => {
    expect(workingDaysBetween("2026-10-26", "2026-10-31")).toBe(6);
    const progress = goalProgress(1_000_000, 400_000, "2026-10-26");
    expect(progress).toMatchObject({ percent: 40, remainingInCents: 600_000, workingDaysLeft: 6, perWorkingDayInCents: 100_000 });
    expect(goalProgress(0, 10, "2026-10-26")).toBeNull();
  });
});

describe("oportunidades de hoje", () => {
  it("prioriza vaga com espera, depois cobrança e lead parado", () => {
    const groups = enrichGroups([group({ waitlistCount: 3 })], []);
    const opportunities = buildOpportunities({
      today: "2026-10-31",
      groups,
      waitlist: [],
      overdue: [
        {
          patientId: "c1",
          patientName: "Maria Souza",
          phone: "11999990000",
          groups: [],
          amountInCents: 18000,
          installments: 1,
          oldestDueDate: "2026-10-19",
          daysOverdue: 12,
          band: "8-30",
          atRisk: false,
        },
      ],
      leads: [
        {
          id: "l1",
          fullName: "João Lima",
          phone: "11988887777",
          source: "Instagram",
          interest: "Pilates",
          stage: "contacted",
          createdAt: "2026-10-20T10:00:00Z",
          updatedAt: "2026-10-26T10:00:00Z",
          openTasks: 0,
          overdueTasks: 0,
        },
      ],
      stages: [{ stage: "contacted", label: "Contato", kind: "open" }],
      renewals: [],
      links: { group: (id) => `/turmas?turma=${id}`, whatsapp: () => "https://wa.me/x" },
    });
    expect(opportunities.map((item) => item.kind)).toEqual(["offer_seat", "charge", "lead_stalled"]);
    expect(opportunities[0]?.title).toBe("Pilates Ter/Qui 18h tem 2 vagas e 3 pessoas na espera");
    expect(opportunities[1]?.title).toBe("Maria está há 12 dias em atraso");
    expect(opportunities[2]?.title).toBe("Lead João parado há 5 dias na etapa Contato");
  });
});

describe("WhatsApp e formatação", () => {
  it("monta o link com DDI", () => {
    expect(whatsappLink("(11) 99999-0000", "Oi")).toBe("https://wa.me/5511999990000?text=Oi");
    expect(whatsappLink("123", "Oi")).toBeNull();
  });
  it("monta a cobrança com Pix", () => {
    const text = chargeMessage({ patientName: "Maria Souza", amountInCents: 18000, oldestDueDate: "2026-10-19", clinicName: "Studios Aryana", pixKey: "pix@aryana.com" });
    expect(text).toContain("Olá, Maria!");
    expect(text).toContain("R$ 180,00");
    expect(text).toContain("19 de out.");
    expect(text).toContain("pix@aryana.com");
  });
  it("formata dinheiro e data", () => {
    expect(formatMoney(123456)).toBe("R$ 1.234,56");
    expect(shortDate("2026-10-01")).toBe("01 de out.");
  });
});
