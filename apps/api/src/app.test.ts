import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app) await app.close();
  app = undefined;
});

describe("API bootstrap", () => {
  it("reports process health", async () => {
    ({ app } = buildApp({ databasePath: ":memory:" }));
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "immich-polo-api" });
  });

  it("reports database readiness and configured provider state", async () => {
    ({ app } = buildApp({ databasePath: ":memory:" }));
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, database: "ready", immichProvider: "unverified" });
  });
});
