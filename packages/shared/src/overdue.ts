import type { OverdueBand } from "./crm-types.js";

export const overdueBands: OverdueBand[] = ["1-7", "8-30", "31-60", "60+"];

export const overdueBandLabels: Record<OverdueBand, string> = {
  "1-7": "1 a 7 dias",
  "8-30": "8 a 30 dias",
  "31-60": "31 a 60 dias",
  "60+": "Mais de 60 dias",
};

/** Cor fixa do atraso: amarelo até 7 dias, laranja até 30, vermelho acima. */
export type OverdueTone = "yellow" | "orange" | "red";

export function overdueBand(daysOverdue: number): OverdueBand | null {
  if (daysOverdue < 1) return null;
  if (daysOverdue <= 7) return "1-7";
  if (daysOverdue <= 30) return "8-30";
  if (daysOverdue <= 60) return "31-60";
  return "60+";
}

export function overdueTone(daysOverdue: number): OverdueTone {
  if (daysOverdue <= 7) return "yellow";
  if (daysOverdue <= 30) return "orange";
  return "red";
}
