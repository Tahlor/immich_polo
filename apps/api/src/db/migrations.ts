import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

export function defaultMigrationsDirectory(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
}

export function runMigrations(
  sqlite: Database.Database,
  migrationsDirectory = defaultMigrationsDirectory(),
): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _polo_migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(
    (sqlite.prepare("SELECT name FROM _polo_migrations").all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );

  const files = readdirSync(migrationsDirectory)
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();

  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = readFileSync(resolve(migrationsDirectory, name), "utf8");
    const apply = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite
        .prepare("INSERT INTO _polo_migrations (name, applied_at) VALUES (?, ?)")
        .run(name, Date.now());
    });
    apply();
  }
}
