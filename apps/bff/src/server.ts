import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const here = dirname(fileURLToPath(import.meta.url));
// Em produção (dist/server.js) o site compilado fica em apps/web/dist.
config.staticDir ??= resolve(here, "../../web/dist");

const app = await buildApp(config);
await app.listen({ port: config.port, host: config.host });
console.log(`Dashboard de vendas em http://localhost:${config.port} (CRM: ${config.crmApiUrl})`);
