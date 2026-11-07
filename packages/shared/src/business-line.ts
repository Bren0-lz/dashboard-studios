import type { BusinessLine, SaleMovement } from "./crm-types.js";

export const businessLines: BusinessLine[] = ["studio", "aesthetics"];

export const businessLineLabels: Record<BusinessLine, string> = {
  studio: "Studio",
  aesthetics: "Estética",
};

/** Linha no painel: as do CRM e "Outros" (serviço ou produto sem classificação, `null` no CRM). */
export type LineKey = BusinessLine | "other";

export const lineKeys: LineKey[] = ["studio", "aesthetics", "other"];

export const lineKeyLabels: Record<LineKey, string> = { ...businessLineLabels, other: "Outros" };

/** Filtro de linha: "all" = Tudo (inclui Estética e Outros). */
export type LineFilter = LineKey | "all";

export function parseLineFilter(value: unknown): LineFilter {
  return value === "studio" || value === "aesthetics" || value === "other" ? value : "all";
}

/**
 * Filtro global do painel (PT6): linha e serviços do CRM (vários). Na URL: `?linha=` e
 * `?servicos=id1,id2`. Com serviços escolhidos, o item precisa ter um deles; com linha, ser dela.
 */
export interface PanelFilter {
  line: LineFilter;
  services: string[];
}

export const emptyPanelFilter: PanelFilter = { line: "all", services: [] };

export function parseServicesFilter(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...new Set(value.split(",").map((item) => item.trim()).filter((item) => item && item.length <= 64))].slice(0, 50);
}

export function parsePanelFilter(query: { linha?: unknown; servicos?: unknown }): PanelFilter {
  return { line: parseLineFilter(query.linha), services: parseServicesFilter(query.servicos) };
}

export function isFilterActive(filter: PanelFilter): boolean {
  return filter.line !== "all" || filter.services.length > 0;
}

/** Linha de um item: sem o campo (CRM antes da fase 0) conta como Studio; `null` = Outros. */
export function lineKeyOf(line: BusinessLine | null | undefined): LineKey {
  if (line === undefined) return "studio";
  return line ?? "other";
}

/** Linha que o painel mostra no item: sem o campo (CRM antigo), Studio; `null` = sem classificação. */
export function lineOf(item: { businessLine?: BusinessLine | null | undefined }): BusinessLine | null {
  return item.businessLine === undefined ? "studio" : item.businessLine;
}

/** Linhas e serviços a que um item (turma, venda, atraso, espera) pertence. */
export interface FilterTags {
  lines: LineKey[];
  services: string[];
}

/**
 * Item sem vínculo (nenhuma linha nem serviço, ex.: parcela lançada à mão): aparece só em "Tudo".
 * Proposta comunicada ao dono em 06/11; para passar a mostrá-lo também em "Outros", troque para
 * `"other"`.
 */
export const UNLINKED_LINE: LineKey | null = null;

export function matchesFilter(tags: FilterTags, filter: PanelFilter): boolean {
  if (!isFilterActive(filter)) return true;
  const lines = tags.lines.length === 0 && tags.services.length === 0 && UNLINKED_LINE ? [UNLINKED_LINE] : tags.lines;
  if (filter.line !== "all" && !lines.includes(filter.line)) return false;
  if (filter.services.length > 0 && !tags.services.some((id) => filter.services.includes(id))) return false;
  return true;
}

export function uniqueLines(lines: readonly LineKey[]): LineKey[] {
  return lineKeys.filter((line) => lines.includes(line));
}

/**
 * Venda: plano e serviço pelos serviços dela (PX5; plano com vários serviços entra em cada
 * linha, com o valor inteiro); produto pela linha do próprio produto. CRM sem `services`
 * (antes da PX5): a linha da venda, se houver, ou Studio, e sem serviços.
 */
export function saleTags(sale: Pick<SaleMovement, "sourceType" | "businessLine" | "services">): FilterTags {
  if (sale.sourceType === "product") return { lines: [lineKeyOf(sale.businessLine)], services: [] };
  if (sale.services && sale.services.length > 0)
    return { lines: uniqueLines(sale.services.map((item) => lineKeyOf(item.businessLine ?? null))), services: sale.services.map((item) => item.id) };
  return { lines: [lineKeyOf(sale.businessLine)], services: [] };
}
