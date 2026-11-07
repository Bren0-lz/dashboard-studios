import { parsePanelFilter, type PanelFilter } from "@dash/shared";
import { useSearchParams } from "react-router-dom";

/**
 * Filtro global do topo (PT6): linha (Tudo | Studio | Estética | Outros) e serviços do CRM, salvos
 * na URL (`?linha=`, `?servicos=id1,id2`) e levados entre as telas.
 */
export function usePanelFilter(): [PanelFilter, (next: PanelFilter) => void] {
  const [params, setParams] = useSearchParams();
  const filter = parsePanelFilter({ linha: params.get("linha") ?? undefined, servicos: params.get("servicos") ?? undefined });
  const setFilter = (next: PanelFilter) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next.line === "all") copy.delete("linha");
        else copy.set("linha", next.line);
        if (next.services.length === 0) copy.delete("servicos");
        else copy.set("servicos", next.services.join(","));
        return copy;
      },
      { replace: true },
    );
  return [filter, setFilter];
}

/** Caminho da API (ou da tela) com o filtro global. */
export function withFilter(path: string, filter: PanelFilter): string {
  const query = new URLSearchParams();
  if (filter.line !== "all") query.set("linha", filter.line);
  if (filter.services.length > 0) query.set("servicos", filter.services.join(","));
  const text = query.toString();
  if (!text) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${text}`;
}

/** Filial escolhida, salva na URL (`?filial=`); vazio = todas as filiais do usuário. */
export function useBranchFilter(): [string, (branchId: string) => void] {
  const [params, setParams] = useSearchParams();
  const branch = params.get("filial") ?? "";
  const setBranch = (next: string) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next) copy.set("filial", next);
        else copy.delete("filial");
        return copy;
      },
      { replace: true },
    );
  return [branch, setBranch];
}

/** Filtros globais (`linha`, `servicos`, `filial`) que acompanham a navegação entre as telas. */
export function globalFilters(search: string): string {
  const current = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of ["linha", "servicos", "filial"]) {
    const value = current.get(key);
    if (value) kept.set(key, value);
  }
  const text = kept.toString();
  return text ? `?${text}` : "";
}
