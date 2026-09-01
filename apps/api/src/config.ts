import { z } from "zod";

const ConfigSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().min(1).default("./data/polo.sqlite"),
  POLO_CREDENTIAL_KEY: z.string().optional(),
  POLO_REGISTRATION_SECRET: z.string().min(12).optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  credentialKey?: string;
  registrationSecret?: string;
  sessionTtlDays: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.parse(env);
  return {
    host: parsed.HOST,
    port: parsed.PORT,
    databasePath: parsed.DATABASE_PATH,
    sessionTtlDays: parsed.SESSION_TTL_DAYS,
    ...(parsed.POLO_CREDENTIAL_KEY ? { credentialKey: parsed.POLO_CREDENTIAL_KEY } : {}),
    ...(parsed.POLO_REGISTRATION_SECRET ? { registrationSecret: parsed.POLO_REGISTRATION_SECRET } : {}),
  };
}
