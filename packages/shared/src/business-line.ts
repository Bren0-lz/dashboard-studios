import type { BusinessLine } from "./crm-types.js";

export const businessLines: BusinessLine[] = ["studio", "aesthetics"];

export const businessLineLabels: Record<BusinessLine, string> = {
  studio: "Studio",
  aesthetics: "Estética",
};

/** Filtro global: "all" = Tudo. */
export type LineFilter = BusinessLine | "all";

export function parseLineFilter(value: unknown): LineFilter {
  return value === "studio" || value === "aesthetics" ? value : "all";
}

/** Sem a linha de negócio (CRM antes da fase 0), tudo conta como Studio. */
export function lineOf(item: { businessLine?: BusinessLine | undefined }): BusinessLine {
  return item.businessLine ?? "studio";
}

export function matchesLine(item: { businessLine?: BusinessLine | undefined }, filter: LineFilter): boolean {
  return filter === "all" || lineOf(item) === filter;
}
