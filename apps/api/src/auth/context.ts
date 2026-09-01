import type Database from "better-sqlite3";
import type { FastifyRequest } from "fastify";
import { hashSessionToken } from "../security/session-token.js";

export interface AuthenticatedUser {
  id: string;
  displayName: string;
  username: string;
  sessionTokenHash: string;
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

export function authenticateRequest(
  request: FastifyRequest,
  sqlite: Database.Database,
): AuthenticatedUser | null {
  const token = bearerToken(request);
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const now = Date.now();
  const row = sqlite
    .prepare(
      `SELECT u.id, u.display_name AS displayName, u.auth_subject AS username
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash, now) as
    | { id: string; displayName: string; username: string }
    | undefined;

  if (!row) return null;
  sqlite.prepare("UPDATE auth_sessions SET last_used_at = ? WHERE token_hash = ?").run(now, tokenHash);
  return { ...row, sessionTokenHash: tokenHash };
}
