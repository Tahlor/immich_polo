import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { hashPassword, secretMatches, verifyPassword } from "../security/password.js";
import { issueSession } from "../security/session-token.js";
import { authenticateRequest, type AuthenticatedUser } from "./context.js";

const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9._-]+$/);

const RegisterSchema = z.object({
  registrationSecret: z.string(),
  username: UsernameSchema,
  displayName: z.string().trim().min(1).max(80),
  password: z.string().min(10).max(256),
});

const LoginSchema = z.object({
  username: UsernameSchema,
  password: z.string().min(1).max(256),
});

function publicUser(user: Pick<AuthenticatedUser, "id" | "displayName" | "username">) {
  return { id: user.id, displayName: user.displayName, username: user.username };
}

export function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  sqlite: Database.Database,
): AuthenticatedUser | null {
  const user = authenticateRequest(request, sqlite);
  if (!user) {
    void reply.code(401).send({ error: "unauthenticated" });
    return null;
  }
  return user;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  sqlite: Database.Database,
  config: AppConfig,
): void {
  app.post("/auth/register", async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    if (!config.registrationSecret) {
      return reply.code(503).send({ error: "registration_disabled" });
    }
    if (!secretMatches(config.registrationSecret, parsed.data.registrationSecret)) {
      return reply.code(403).send({ error: "invalid_registration_secret" });
    }

    const existing = sqlite
      .prepare("SELECT id FROM users WHERE auth_subject = ?")
      .get(parsed.data.username) as { id: string } | undefined;
    if (existing) return reply.code(409).send({ error: "username_taken" });

    const userId = randomUUID();
    const passwordHash = await hashPassword(parsed.data.password);
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO users (id, display_name, auth_subject, password_hash, notification_enabled, created_at)
         VALUES (?, ?, ?, ?, 1, ?)`,
      )
      .run(userId, parsed.data.displayName, parsed.data.username, passwordHash, now);

    const session = issueSession(sqlite, userId, config.sessionTtlDays);
    return reply.code(201).send({
      token: session.token,
      expiresAt: new Date(session.expiresAt).toISOString(),
      user: { id: userId, displayName: parsed.data.displayName, username: parsed.data.username },
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });

    const row = sqlite
      .prepare(
        `SELECT id, display_name AS displayName, auth_subject AS username, password_hash AS passwordHash
         FROM users WHERE auth_subject = ?`,
      )
      .get(parsed.data.username) as
      | { id: string; displayName: string; username: string; passwordHash: string | null }
      | undefined;

    if (!row?.passwordHash || !(await verifyPassword(parsed.data.password, row.passwordHash))) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const session = issueSession(sqlite, row.id, config.sessionTtlDays);
    return {
      token: session.token,
      expiresAt: new Date(session.expiresAt).toISOString(),
      user: { id: row.id, displayName: row.displayName, username: row.username },
    };
  });

  app.get("/auth/me", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    return { user: publicUser(user) };
  });

  app.post("/auth/logout", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    sqlite.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(user.sessionTokenHash);
    return reply.code(204).send();
  });

  app.get("/users", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    const rows = sqlite
      .prepare("SELECT id, display_name AS displayName, auth_subject AS username FROM users ORDER BY display_name, id")
      .all() as Array<{ id: string; displayName: string; username: string }>;
    return { users: rows };
  });
}
