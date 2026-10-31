import { useState } from "react";
import { api } from "./api";

/** Gravação com botão travado durante o envio e mensagem de erro em pt-BR. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await api<T>(path, { method, ...(body !== undefined ? { body } : {}) });
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}
