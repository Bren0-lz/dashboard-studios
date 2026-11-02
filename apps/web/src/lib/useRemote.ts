import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useBranchFilter } from "./filters";

/** Dados com no máximo 60 s de idade: recarrega sozinho e ao voltar para a aba. */
export const REFRESH_MS = 60_000;

export interface Remote<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  updatedAt: number | null;
}

export function useRemote<T>(path: string | null): Remote<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [branch] = useBranchFilter();
  const lastKey = useRef(`${branch}|${path}`);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const key = `${branch}|${path}`;
    if (lastKey.current !== key) {
      lastKey.current = key;
      setData(null);
    }
    setLoading(true);
    // A filial vai explícita: o efeito da tela roda antes de o topo atualizar `setActiveBranch`.
    api<T>(path, { signal: controller.signal, branchId: branch })
      .then((value) => {
        setData(value);
        setError(null);
        setUpdatedAt(Date.now());
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, branch, tick]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((value) => value + 1);
    }, REFRESH_MS);
    const manual = () => setTick((value) => value + 1);
    window.addEventListener("dash:refresh", manual);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("dash:refresh", manual);
    };
  }, []);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, error, loading, reload, updatedAt };
}
