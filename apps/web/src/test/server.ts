import { vi } from "vitest";
import { buildApp } from "../../../bff/src/app";
import { memoryGoalsStore } from "../../../bff/src/goals-store";
import { injectFetch, testConfig, API_KEY, TODAY } from "../../../bff/src/test-support/harness";
import { buildMockCrm } from "../../../bff/src/mock-crm/app";

/**
 * "Servidor" das telas nos testes: o BFF de verdade com o CRM simulado, tudo em memória.
 * O `fetch` do navegador é trocado por chamadas `inject`, com um pote de cookies simples.
 */
export async function startServer(options: { withoutPhase0?: boolean; withoutBranches?: boolean } = {}) {
  const crm = buildMockCrm({ apiKey: API_KEY, today: TODAY, ...options });
  const app = await buildApp(testConfig(), { fetch: injectFetch(crm.app), goals: memoryGoalsStore({ studio: 2_000_000, aesthetics: 800_000 }), today: () => TODAY });
  let cookie = "";
  const calls: { method: string; url: string; branch?: string }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const branch = (init?.headers as Record<string, string> | undefined)?.["X-Branch-Id"];
    calls.push({ method, url, ...(branch ? { branch } : {}) });
    const response = await app.inject({
      method: method as "GET",
      url,
      headers: { ...(init?.headers as Record<string, string>), ...(cookie ? { cookie } : {}) },
      ...(init?.body ? { payload: init.body as string } : {}),
    });
    const set = response.cookies.find((item) => item.name === "dash_session");
    if (set) cookie = set.value ? `dash_session=${set.value}` : "";
    return new Response(response.body || null, { status: response.statusCode });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { app, crm, calls };
}
