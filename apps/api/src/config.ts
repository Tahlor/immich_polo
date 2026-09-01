import { z } from "zod";

const ConfigSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().min(1).default("./data/polo.sqlite"),
  POLO_CREDENTIAL_KEY: z.string().optional(),
});

export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  credentialKey?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.parse(env);
  return {
    host: parsed.HOST,
    port: parsed.PORT,
    databasePath: parsed.DATABASE_PATH,
    ...(parsed.POLO_CREDENTIAL_KEY ? { credentialKey: parsed.POLO_CREDENTIAL_KEY } : {}),
  };
}
