import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

const registrationSecret = "local-test-secret-123";
let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app) await app.close();
  app = undefined;
});

async function register(username: string, displayName = username) {
  const response = await app!.inject({
    method: "POST",
    url: "/auth/register",
    payload: { registrationSecret, username, displayName, password: "correct horse battery staple" },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { token: string; user: { id: string; displayName: string; username: string } };
}

describe("Polo authentication", () => {
  it("registers, authenticates, logs in, and logs out", async () => {
    ({ app } = buildApp({ databasePath: ":memory:", registrationSecret }));
    const created = await register("alice", "Alice");

    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${created.token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe("alice");

    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { username: "Alice", password: "correct horse battery staple" } });
    expect(login.statusCode).toBe(200);
    const loginToken = login.json().token as string;

    const logout = await app.inject({ method: "POST", url: "/auth/logout", headers: { authorization: `Bearer ${loginToken}` } });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${loginToken}` } });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("rejects registration without the configured secret", async () => {
    ({ app } = buildApp({ databasePath: ":memory:", registrationSecret }));
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { registrationSecret: "wrong-secret-value", username: "mallory", displayName: "Mallory", password: "correct horse battery staple" },
    });
    expect(response.statusCode).toBe(403);
  });
});
