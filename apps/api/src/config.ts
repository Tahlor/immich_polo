import { z } from "zod";

const ConfigSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().min(1).default("./data/polo.sqlite"),
  POLO_CREDENTIAL_KEY: z.string().optional(),
  POLO_REGISTRATION_SECRET: z.string().min(12).optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  IMMICH_PROVIDER: z.enum(["unverified", "official-v3"]).default("unverified"),
  IMMICH_ALLOWED_BASE_URLS: z.string().optional(),
});

export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  credentialKey?: string;
  registrationSecret?: string;
  sessionTtlDays: number;
  immichProvider: "unverified" | "official-v3";
  immichAllowedBaseUrls: string[];
}

function parseAllowedBaseUrls(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.parse(env);
  return {
    host: parsed.HOST,
    port: parsed.PORT,
    databasePath: parsed.DATABASE_PATH,
    sessionTtlDays: parsed.SESSION_TTL_DAYS,
    immichProvider: parsed.IMMICH_PROVIDER,
    immichAllowedBaseUrls: parseAllowedBaseUrls(parsed.IMMICH_ALLOWED_BASE_URLS),
    ...(parsed.POLO_CREDENTIAL_KEY ? { credentialKey: parsed.POLO_CREDENTIAL_KEY } : {}),
    ...(parsed.POLO_REGISTRATION_SECRET ? { registrationSecret: parsed.POLO_REGISTRATION_SECRET } : {}),
  };
}
