import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

const registrationSecret = "local-test-secret-123";
let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app) await app.close();
  app = undefined;
});

async function register(username: string) {
  const response = await app!.inject({
    method: "POST",
    url: "/auth/register",
    payload: { registrationSecret, username, displayName: username.toUpperCase(), password: "correct horse battery staple" },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { token: string; user: { id: string } };
}

describe("thread authorization", () => {
  it("allows members and rejects a third user", async () => {
    ({ app } = buildApp({ databasePath: ":memory:", registrationSecret }));
    const alice = await register("alice");
    const bob = await register("bob");
    const mallory = await register("mallory");

    const created = await app.inject({
      method: "POST",
      url: "/threads",
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { title: "Alice + Bob", memberUserIds: [bob.user.id] },
    });
    expect(created.statusCode).toBe(201);
    const threadId = created.json().thread.id as string;

    const bobPosts = await app.inject({ method: "GET", url: `/threads/${threadId}/posts`, headers: { authorization: `Bearer ${bob.token}` } });
    expect(bobPosts.statusCode).toBe(200);
    expect(bobPosts.json()).toEqual({ posts: [] });

    const malloryPosts = await app.inject({ method: "GET", url: `/threads/${threadId}/posts`, headers: { authorization: `Bearer ${mallory.token}` } });
    expect(malloryPosts.statusCode).toBe(403);
  });

  it("does not expose threads to non-members in the list", async () => {
    ({ app } = buildApp({ databasePath: ":memory:", registrationSecret }));
    const alice = await register("alice");
    const bob = await register("bob");
    const mallory = await register("mallory");

    await app.inject({
      method: "POST",
      url: "/threads",
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { memberUserIds: [bob.user.id] },
    });

    const list = await app.inject({ method: "GET", url: "/threads", headers: { authorization: `Bearer ${mallory.token}` } });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({ threads: [] });
  });
});
