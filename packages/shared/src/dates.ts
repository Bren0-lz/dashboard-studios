/** Datas como aaaa-mm-dd, sempre no calendário (sem fuso): o CRM já devolve no fuso da clínica. */

export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / 86_400_000);
}

export function weekdayOf(iso: string): number {
  return parseIsoDate(iso).getUTCDay();
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return toIsoDate(new Date(Date.UTC(year ?? 1970, m ?? 1, 0)));
}

export function previousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return toIsoDate(new Date(Date.UTC(year ?? 1970, (m ?? 1) - 2, 1))).slice(0, 7);
}

/** Segunda-feira da semana de `iso`. */
export function weekStart(iso: string): string {
  const weekday = weekdayOf(iso);
  return addDays(iso, weekday === 0 ? -6 : 1 - weekday);
}

/** Dias úteis (seg–sáb, o estúdio abre aos sábados) de `fromIso` até `toIso`, inclusive. */
export function workingDaysBetween(fromIso: string, toIso: string): number {
  let count = 0;
  for (let day = fromIso; day <= toIso; day = addDays(day, 1)) if (weekdayOf(day) !== 0) count += 1;
  return count;
}

/** Hoje (aaaa-mm-dd) no fuso de São Paulo. */
export function todayInClinic(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const periodMonths = { single: 0, monthly: 1, quarterly: 3, semiannual: 6, annual: 12, promotional: 0 } as const;

/** Fim da validade de um plano que começa em `validFrom` (mesma regra de meses do CRM). */
export function planValidUntil(validFrom: string, planType: keyof typeof periodMonths | null | undefined): string | undefined {
  const months = planType ? periodMonths[planType] : 0;
  if (!months) return undefined;
  const [year, month, day] = validFrom.split("-").map(Number);
  const end = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 + months, day ?? 1));
  end.setUTCDate(end.getUTCDate() - 1);
  return toIsoDate(end);
}
