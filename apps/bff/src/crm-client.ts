import type { z } from "zod";

/** Erro devolvido pelo CRM (ou falha de rede), com a mensagem pt-BR para a tela. */
export class CrmError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface CrmRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Token do usuário logado (fase 0, 3.4): a API age em nome dele. */
  userToken?: string | undefined;
  branchId?: string | undefined;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Cliente da API externa do CRM: a chave fica aqui e nunca vai para o navegador. */
export class CrmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  url(path: string, query?: CrmRequest["query"]): string {
    const url = new URL(`${this.baseUrl}/external/v1${path}`);
    for (const [key, value] of Object.entries(query ?? {}))
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    return url.toString();
  }

  async request<T>(request: CrmRequest, schema?: z.ZodType<T>): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    if (request.body !== undefined) headers["Content-Type"] = "application/json";
    if (request.userToken) headers["X-CRM-User-Token"] = request.userToken;
    if (request.branchId) headers["X-Branch-Id"] = request.branchId;
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(request.path, request.query), {
        method: request.method ?? "GET",
        headers,
        ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new CrmError(502, "crm_unreachable", "Não foi possível falar com o CRM. Tente de novo em instantes.");
    }
    const text = await response.text();
    const payload: unknown = text ? safeJson(text) : undefined;
    if (!response.ok) {
      const error = (payload ?? {}) as { code?: string; message?: string; details?: unknown };
      throw new CrmError(
        response.status,
        error.code ?? `http_${response.status}`,
        error.message ?? defaultMessage(response.status),
        error.details,
      );
    }
    if (!schema) return payload as T;
    const parsed = schema.safeParse(payload);
    if (!parsed.success)
      throw new CrmError(502, "crm_contract", `O CRM respondeu num formato inesperado em ${request.path}.`, parsed.error.issues);
    return parsed.data;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function defaultMessage(status: number): string {
  if (status === 401) return "Sua sessão no CRM expirou. Entre de novo.";
  if (status === 403) return "Você não tem permissão para esta ação no CRM.";
  if (status === 404) return "Registro não encontrado no CRM.";
  if (status === 429) return "Muitas requisições ao CRM. Aguarde um instante.";
  return "O CRM não conseguiu concluir a operação.";
}
