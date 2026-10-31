/** Cor fixa da ocupação: verde = cheia (≥ 85%), amarelo = parcial, vermelho = vazia (< 40%). */
export type OccupancyTone = "green" | "yellow" | "red";

export function occupancyTone(percent: number): OccupancyTone {
  if (percent >= 85) return "green";
  if (percent >= 40) return "yellow";
  return "red";
}

export type DayPeriod = "morning" | "afternoon" | "evening";

export const dayPeriodLabels: Record<DayPeriod, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
};

export function dayPeriodOf(startTime: string): DayPeriod {
  const hour = Number(startTime.slice(0, 2));
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
