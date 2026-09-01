import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { runMigrations } from "./migrations.js";

export function createDatabase(path: string) {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  if (path !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }
  runMigrations(sqlite);

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
  };
}

export function checkDatabase(sqlite: Database.Database): void {
  sqlite.prepare("SELECT 1 AS ok").get();
  sqlite.prepare("SELECT name FROM _polo_migrations LIMIT 1").get();
}
