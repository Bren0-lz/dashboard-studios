import type { FastifyInstance } from "fastify";
import { buildApp, SESSION_COOKIE } from "../app.js";
import type { Config } from "../config.js";
import type { FetchLike } from "../crm-client.js";
import { memoryGoalsStore } from "../goals-store.js";
import { buildMockCrm, type MockCrmOptions } from "../mock-crm/app.js";

export const TODAY = "2026-10-31";
export const API_KEY = "crm_0000abcd_chave-de-teste";

/** `fetch` que entrega a chamada ao CRM simulado via `inject` (sem rede). */
export function injectFetch(crm: FastifyInstance): FetchLike {
  return async (input, init) => {
    const url = new URL(input);
    const response = await crm.inject({
      method: (init?.method ?? "GET") as "GET",
      url: url.pathname + url.search,
      headers: init?.headers as Record<string, string>,
      ...(init?.body ? { payload: init.body as string } : {}),
    });
    return new Response(response.statusCode === 204 ? null : response.body, { status: response.statusCode, headers: { "content-type": "application/json" } });
  };
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    crmApiUrl: "http://crm.test/api",
    crmApiKey: API_KEY,
    sessionSecret: "segredo-de-teste-com-tamanho-suficiente",
    port: 0,
    host: "127.0.0.1",
    cacheTtlMs: 45_000,
    cookieSecure: false,
    crmWebUrl: "http://crm.test",
    pixKey: "pix@aryana.com",
    clinicName: "Studios Aryana",
    goalsFile: "",
    ...overrides,
  };
}

export async function createHarness(options: Partial<MockCrmOptions> = {}) {
  const crm = buildMockCrm({ apiKey: API_KEY, today: TODAY, ...options });
  const app = await buildApp(testConfig(), {
    fetch: injectFetch(crm.app),
    goals: memoryGoalsStore({ studio: 2_000_000, aesthetics: 800_000 }),
    today: () => TODAY,
  });

  async function login(email = "admin@aryana.com", password = "senha123") {
    const response = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
    const raw = response.cookies.find((cookie) => cookie.name === SESSION_COOKIE);
    const body = response.json() as { csrfToken: string };
    const cookie = raw ? `${SESSION_COOKIE}=${raw.value}` : "";
    return {
      response,
      cookie,
      csrf: body.csrfToken,
      get: (url: string) => app.inject({ method: "GET", url, headers: { cookie } }),
      send: (method: "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
        app.inject({ method, url, headers: { cookie, "x-csrf-token": body.csrfToken }, ...(payload !== undefined ? { payload: payload as object } : {}) }),
    };
  }

  return { app, crm, login };
}
