import { z } from "zod";

const envSchema = z.object({
  CRM_API_URL: z.string().url().transform((value) => value.replace(/\/+$/, "")),
  CRM_API_KEY: z.string().min(10, "Defina CRM_API_KEY com a chave de integração do CRM."),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET precisa ter pelo menos 16 caracteres."),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default("0.0.0.0"),
  CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(300).default(45),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  CRM_WEB_URL: z.string().default(""),
  CLINIC_PIX_KEY: z.string().default(""),
  CLINIC_NAME: z.string().default("Studios Aryana"),
  GOALS_FILE: z.string().default("data/goals.json"),
  STATIC_DIR: z.string().optional(),
});

export type Config = {
  crmApiUrl: string;
  crmApiKey: string;
  sessionSecret: string;
  port: number;
  host: string;
  cacheTtlMs: number;
  cookieSecure: boolean;
  crmWebUrl: string;
  pixKey: string;
  clinicName: string;
  goalsFile: string;
  staticDir?: string | undefined;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Configuração inválida do dashboard:\n${issues}`);
  }
  const value = parsed.data;
  return {
    crmApiUrl: value.CRM_API_URL,
    crmApiKey: value.CRM_API_KEY,
    sessionSecret: value.SESSION_SECRET,
    port: value.PORT,
    host: value.HOST,
    cacheTtlMs: value.CACHE_TTL_SECONDS * 1000,
    cookieSecure: value.COOKIE_SECURE,
    crmWebUrl: value.CRM_WEB_URL.replace(/\/+$/, ""),
    pixKey: value.CLINIC_PIX_KEY,
    clinicName: value.CLINIC_NAME,
    goalsFile: value.GOALS_FILE,
    staticDir: value.STATIC_DIR,
  };
}
