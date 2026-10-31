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
