import { parseLineFilter, type LineFilter } from "@dash/shared";
import { useSearchParams } from "react-router-dom";

/** Filtro global Tudo | Studio | Estética, salvo na URL (`?linha=`). */
export function useLineFilter(): [LineFilter, (line: LineFilter) => void] {
  const [params, setParams] = useSearchParams();
  const line = parseLineFilter(params.get("linha"));
  const setLine = (next: LineFilter) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === "all") copy.delete("linha");
        else copy.set("linha", next);
        return copy;
      },
      { replace: true },
    );
  return [line, setLine];
}

export function withLine(path: string, line: LineFilter): string {
  if (line === "all") return path;
  return `${path}${path.includes("?") ? "&" : "?"}linha=${line}`;
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

/** Filtros globais (`linha`, `filial`) que acompanham a navegação entre as telas. */
export function globalFilters(search: string): string {
  const current = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of ["linha", "filial"]) {
    const value = current.get(key);
    if (value) kept.set(key, value);
  }
  const text = kept.toString();
  return text ? `?${text}` : "";
}
