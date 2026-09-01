import { createHash, randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export interface IssuedSession {
  token: string;
  expiresAt: number;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export function issueSession(
  sqlite: Database.Database,
  userId: string,
  ttlDays: number,
): IssuedSession {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = now + ttlDays * 24 * 60 * 60 * 1000;
  sqlite
    .prepare(
      `INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), userId, hashSessionToken(token), now, expiresAt, now);
  return { token, expiresAt };
}
