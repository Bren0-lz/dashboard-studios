import { buildMockCrm } from "./app.js";

/** `npm run mock-crm -w @dash/bff`: CRM simulado em http://localhost:4100/api/external/v1. */
const port = Number(process.env.MOCK_CRM_PORT ?? 4100);
const apiKey = process.env.CRM_API_KEY ?? "crm_00000000_troque-esta-chave";
const { app } = buildMockCrm({ apiKey, withoutPhase0: process.env.MOCK_WITHOUT_PHASE0 === "true" });
await app.listen({ port, host: "127.0.0.1" });
console.log(`CRM simulado em http://localhost:${port}/api/external/v1 — entre com admin@aryana.com / senha123`);
