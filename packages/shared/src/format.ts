const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const monthNames = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
export const weekdayShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const weekdayLong = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** "Terça · 18:00–19:00", como na tabela de turmas do CRM. */
export function slotLabel(slot: { weekday: number; startTime: string; endTime: string }): string {
  return `${weekdayLong[slot.weekday] ?? ""} · ${slot.startTime}–${slot.endTime}`;
}

export function formatMoney(cents: number): string {
  return money.format(cents / 100).replace(/\u00a0/g, " ");
}

/** "R$ 1,2 mil" — para cartões e eixos. */
export function formatMoneyShort(cents: number): string {
  const value = cents / 100;
  if (Math.abs(value) >= 1000)
    return `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return formatMoney(cents);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** "01 de out." a partir de aaaa-mm-dd (ou ISO completo). */
export function shortDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${String(day).padStart(2, "0")} de ${monthNames[month - 1]}`;
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatPhone(value: string | undefined): string {
  if (!value) return "";
  const digits = onlyDigits(value).replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

const nameParticles = new Set(["da", "das", "de", "do", "dos", "e"]);

/** Duas letras do nome ("Clara de Souza" → "CS"; "Clara" → "CL"), para as bolinhas dos alunos. */
export function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter((word) => word && !nameParticles.has(word.toLowerCase()));
  if (words.length === 0) return "?";
  const first = words[0]!;
  const last = words.length > 1 ? words[words.length - 1]! : "";
  const letters = last ? `${first[0]}${last[0]}` : first.slice(0, 2);
  return letters.toLocaleUpperCase("pt-BR");
}

/**
 * Bolinhas do cartão da turma: até `max` (6) nomes; acima disso, `max - 1` bolinhas e "+N" com o
 * resto, para o cartão nunca passar de `max` bolinhas.
 */
export function memberBubbles(names: readonly string[], max = 6): { shown: string[]; extra: number } {
  if (names.length <= max) return { shown: [...names], extra: 0 };
  return { shown: names.slice(0, max - 1), extra: names.length - (max - 1) };
}

/** "15/20 · 5 vagas" (ou "· turma cheia"). */
export function seatsLabel(group: { enrolled: number; capacity: number; freeSeats: number }): string {
  const free = Math.max(0, group.freeSeats);
  return `${group.enrolled}/${group.capacity} · ${free > 0 ? plural(free, "vaga", "vagas") : "turma cheia"}`;
}
