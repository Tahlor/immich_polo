import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/routes.js";
import { isThreadMember } from "../threads/authorization.js";

export const SendIdSchema = z.string().uuid();
const LEASE_MS = 90_000;

interface SendRow {
  thread_id: string;
  fingerprint: string;
  state: string;
  lease_token: string | null;
  lease_until: number | null;
  asset_id: string | null;
  upload_duplicate: number | null;
  post_id: string | null;
  response_json: string | null;
}

export class SendRequestError extends Error {
  constructor(readonly code: string, readonly status = 409) { super(code); }
}

export function findSend(sqlite: Database.Database, authorId: string, sendId: string): SendRow | undefined {
  return sqlite.prepare("SELECT * FROM send_requests WHERE author_id=? AND send_id=?").get(authorId, sendId) as SendRow | undefined;
}

/** A DB lease serializes provider work; the token fences workers after a crash/expiry. */
export function claimSend(sqlite: Database.Database, authorId: string, sendId: string, threadId: string, input: unknown) {
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const token = randomUUID();
  const row = sqlite.transaction(() => {
    const previous = findSend(sqlite, authorId, sendId);
    if (previous?.state === "cancelled") throw new SendRequestError("send_cancelled", 410);
    if (previous && (previous.thread_id !== threadId || previous.fingerprint !== fingerprint)) {
      throw new SendRequestError("send_identity_conflict");
    }
    if (previous?.state === "completed") {
      if (!previous.post_id) throw new SendRequestError("send_post_deleted", 410);
      return previous;
    }
    const now = Date.now();
    if (previous?.state === "processing" && (previous.lease_until ?? 0) > now) {
      throw new SendRequestError("send_in_progress");
    }
    if (!previous) {
      sqlite.prepare(`INSERT INTO send_requests
        (author_id,send_id,thread_id,fingerprint,state,lease_token,lease_until,created_at,updated_at)
        VALUES (?,?,?,?,'processing',?,?,?,?)`).run(authorId, sendId, threadId, fingerprint, token, now + LEASE_MS, now, now);
    } else {
      sqlite.prepare("UPDATE send_requests SET state='processing',lease_token=?,lease_until=?,updated_at=? WHERE author_id=? AND send_id=?")
        .run(token, now + LEASE_MS, now, authorId, sendId);
    }
    return findSend(sqlite, authorId, sendId)!;
  }).immediate();
  if (row.state === "completed") return { replay: JSON.parse(row.response_json!) as Record<string, unknown> };

  const assertLease = () => {
    const current = findSend(sqlite, authorId, sendId);
    if (current?.lease_token !== token || current.state !== "processing" || (current.lease_until ?? 0) <= Date.now()) {
      throw new SendRequestError("send_in_progress");
    }
  };
  const heartbeat = setInterval(() => {
    // Never revive an expired lease or a worker replaced by a newer attempt.
    const now = Date.now();
    sqlite.prepare("UPDATE send_requests SET lease_until=?,updated_at=? WHERE author_id=? AND send_id=? AND lease_token=? AND state='processing' AND lease_until>?")
      .run(now + LEASE_MS, now, authorId, sendId, token, now);
  }, 20_000);
  heartbeat.unref();
  return {
    replay: undefined,
    assetId: row.asset_id,
    duplicate: row.upload_duplicate === 1,
    checkpoint(assetId: string, duplicate: boolean) {
      sqlite.transaction(() => {
        assertLease();
        sqlite.prepare("UPDATE send_requests SET asset_id=?,upload_duplicate=?,updated_at=? WHERE author_id=? AND send_id=? AND lease_token=?")
          .run(assetId, Number(duplicate), Date.now(), authorId, sendId, token);
      }).immediate();
    },
    complete<T extends { post: { id: string } }>(create: () => T): T {
      return sqlite.transaction(() => {
        assertLease();
        // Membership may have changed while a large upload was in progress.
        if (!isThreadMember(sqlite, authorId, threadId)) throw new SendRequestError("not_thread_member", 403);
        const result = create();
        sqlite.prepare("UPDATE send_requests SET state='completed',post_id=?,response_json=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE author_id=? AND send_id=? AND lease_token=?")
          .run(result.post.id, JSON.stringify(result), Date.now(), authorId, sendId, token);
        return result;
      }).immediate();
    },
    release() {
      clearInterval(heartbeat);
      sqlite.prepare("UPDATE send_requests SET state='failed',lease_token=NULL,lease_until=NULL,updated_at=? WHERE author_id=? AND send_id=? AND lease_token=? AND state='processing'")
        .run(Date.now(), authorId, sendId, token);
    },
  };
}

export function registerSendStatusRoute(app: FastifyInstance, sqlite: Database.Database): void {
  app.get("/threads/:threadId/sends/:sendId", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    const params = z.object({ threadId: z.string().min(1), sendId: SendIdSchema }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_request" });
    if (!isThreadMember(sqlite, user.id, params.data.threadId)) return reply.code(404).send({ error: "send_not_found" });
    const row = findSend(sqlite, user.id, params.data.sendId);
    if (!row || row.thread_id !== params.data.threadId) return reply.code(404).send({ error: "send_not_found" });
    reply.header("Cache-Control", "no-store");
    if (row.state === "cancelled") return { state: "cancelled" };
    if (row.state === "completed") {
      if (!row.post_id) return reply.code(410).send({ error: "send_post_deleted" });
      return { state: "completed", result: JSON.parse(row.response_json!) as unknown };
    }
    return { state: row.state === "processing" && (row.lease_until ?? 0) > Date.now() ? "processing" : "retryable", uploadRequired: !row.asset_id };
  });
  app.delete("/threads/:threadId/sends/:sendId", async (request, reply) => {
    const user = requireUser(request, reply, sqlite);
    if (!user) return;
    const params = z.object({ threadId: z.string().min(1), sendId: SendIdSchema }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_request" });
    if (!isThreadMember(sqlite, user.id, params.data.threadId)) return reply.code(404).send({ error: "send_not_found" });
    try {
      const result = sqlite.transaction(() => {
        const row = findSend(sqlite, user.id, params.data.sendId);
        if (row && row.thread_id !== params.data.threadId) throw new SendRequestError("send_not_found", 404);
        if (row?.state === "completed") {
          if (!row.post_id) throw new SendRequestError("send_post_deleted", 410);
          return { state: "completed", result: JSON.parse(row.response_json!) as unknown };
        }
        if (row?.state === "processing" && (row.lease_until ?? 0) > Date.now()) throw new SendRequestError("send_in_progress");
        if (row) {
          sqlite.prepare("UPDATE send_requests SET state='cancelled',lease_token=NULL,lease_until=NULL,updated_at=? WHERE author_id=? AND send_id=?")
            .run(Date.now(), user.id, params.data.sendId);
        } else {
          // Fence even an original request that has not reached the server yet.
          sqlite.prepare(`INSERT INTO send_requests (author_id,send_id,thread_id,fingerprint,state,created_at,updated_at)
            VALUES (?,?,?,'','cancelled',?,?)`).run(user.id, params.data.sendId, params.data.threadId, Date.now(), Date.now());
        }
        return { state: "cancelled" };
      }).immediate();
      reply.header("Cache-Control", "no-store");
      return result;
    } catch (error) {
      if (error instanceof SendRequestError) return reply.code(error.status).send({ error: error.code });
      throw error;
    }
  });
}
