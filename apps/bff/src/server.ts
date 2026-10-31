import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

// Sem await no topo: a Hostinger (LiteSpeed, lsnode.js) carrega este arquivo com require(),
// que não aceita módulo ESM com top-level await (ERR_REQUIRE_ASYNC_MODULE).
async function start(): Promise<void> {
  const config = loadConfig();
  const here = dirname(fileURLToPath(import.meta.url));
  // Em produção (dist/server.js) o site compilado fica em apps/web/dist.
  config.staticDir ??= resolve(here, "../../web/dist");

  const app = await buildApp(config);
  await app.listen({ port: config.port, host: config.host });
  console.log(`Dashboard de vendas em http://localhost:${config.port} (CRM: ${config.crmApiUrl})`);
}

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
